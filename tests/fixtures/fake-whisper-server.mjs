#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';

const args = process.argv.slice(2);
const arg = (flag) => args[args.indexOf(flag) + 1];
const mode = process.env.FAKE_WHISPER_MODE ?? 'ok';

if (!existsSync(arg('-m'))) {
  console.error(`error: failed to load model '${arg('-m')}'`);
  process.exit(1);
}
if (arg('-l') !== 'pt') {
  console.error('error: expected -l pt');
  process.exit(1);
}
if (mode === 'gpu-crash' && !args.includes('-ng')) {
  // driver de vídeo com defeito: morre ao subir com a GPU; com -ng (só CPU) sobe normal
  console.error('ggml_vulkan: vk::Device::createComputePipeline: ErrorDeviceLost');
  process.exit(2);
}
// as linhas de dispositivo do whisper.cpp v1.9.2, que o WhisperServer lê para mostrar onde transcreve
if (args.includes('-ng')) console.error('whisper_backend_init_gpu: no GPU found');
else console.error('ggml_vulkan: 0 = Fake GPU (test driver) | uma: 0 | fp16: 1\nwhisper_backend_init_gpu: using Vulkan0 backend');

const loadedAt = Date.now() + 300;
const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    if (mode === 'no-health') return res.writeHead(404).end();
    if (Date.now() < loadedAt) return res.writeHead(503, { 'content-type': 'application/json' }).end('{"status":"loading model"}');
    return res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}');
  }
  if (req.method === 'GET' && req.url === '/') return res.writeHead(200).end('<html>whisper</html>');
  if (req.method === 'POST' && req.url === '/inference') {
    if (mode === 'crash-on-inference') process.exit(3);
    if (mode === 'gpu-crash-on-inference' && !args.includes('-ng')) process.exit(4); // o ggml-vulkan compila os shaders na 1ª transcrição
    const parts = [];
    req.on('data', (d) => parts.push(d));
    req.on('end', () => {
      const body = Buffer.concat(parts);
      const size = body.length;
      const match = /name="prompt"\r\n\r\n([\s\S]*?)\r\n--/.exec(body.toString('latin1'));
      const prompt = match ? Buffer.from(match[1], 'latin1').toString('utf8') : '';
      const lang = /name="language"\r\n\r\n([\s\S]*?)\r\n--/.exec(body.toString('latin1'));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ text: ` olá (${size} bytes) prompt=${prompt.length}${lang ? ` lang=${lang[1]}` : ''}` }));
    });
    return;
  }
  res.writeHead(404).end();
});
server.listen(Number(arg('--port')), arg('--host'));
