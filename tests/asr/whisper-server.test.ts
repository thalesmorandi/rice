import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { WhisperServer, type WhisperServerOptions } from '../../src/main/asr/whisper-server';
import { pcmToWav } from '../../src/shared/wav';
import { makeTmpDir } from '../helpers/tmp';

const FAKE = resolve(__dirname, '../fixtures/fake-whisper-server.mjs');
const servers: WhisperServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.stop()));
});

async function server(mode = 'ok', modelExists = true, extra: Partial<WhisperServerOptions> = {}) {
  const dir = await makeTmpDir();
  const modelPath = join(dir, 'model.bin');
  if (modelExists) await writeFile(modelPath, 'x');
  const s = new WhisperServer({ binary: FAKE, modelPath, threads: 2, startupTimeoutMs: 5000, env: { ...process.env, FAKE_WHISPER_MODE: mode }, ...extra });
  servers.push(s);
  return s;
}

test('inicia, espera ficar saudável e transcreve', async () => {
  const s = await server();
  await s.start();
  expect(s.running).toBe(true);
  const text = await s.transcribe(pcmToWav(Buffer.alloc(3200)));
  expect(text).toMatch(/^ olá \(\d+ bytes\) prompt=0$/);
});

test('envia o idioma por requisição (pt, en, auto) e ignora valores inválidos', async () => {
  const s = await server();
  await s.start();
  const wav = pcmToWav(Buffer.alloc(3200));
  expect(await s.transcribe(wav, { language: 'en' })).toMatch(/ lang=en$/);
  expect(await s.transcribe(wav, { language: 'auto' })).toMatch(/ lang=auto$/);
  expect(await s.transcribe(wav, { language: 'pt', prompt: 'x' })).toMatch(/ lang=pt$/);
  expect(await s.transcribe(wav, { language: '--translate' })).not.toMatch(/lang=/);
  expect(await s.transcribe(wav)).not.toMatch(/lang=/);
});

test('envia o campo prompt quando informado', async () => {
  const s = await server();
  await s.start();
  const text = await s.transcribe(pcmToWav(Buffer.alloc(3200)), { prompt: 'contexto anterior' });
  expect(text).toMatch(/ prompt=17$/);
});

test('modelo ausente rejeita com a mensagem do servidor, sem travar', async () => {
  const s = await server('ok', false);
  await expect(s.start()).rejects.toThrow('failed to load model');
  expect(s.running).toBe(false);
});

test('aceita servidor antigo sem /health', async () => {
  const s = await server('no-health');
  await s.start();
  expect(s.running).toBe(true);
});

test('servidor que morre na inferência: transcribe rejeita e restart recupera', async () => {
  const s = await server('crash-on-inference');
  await s.start();
  await expect(s.transcribe(pcmToWav(Buffer.alloc(32)))).rejects.toThrow();
  await s.restart();
  expect(s.running).toBe(true);
});

test('gpu: false sobe o servidor com -ng (só CPU)', async () => {
  const s = await server('gpu-crash', true, { gpu: false });
  await s.start();
  expect(s.running).toBe(true);
  expect(s.fellBackToCpu).toBe(false);
  expect(s.device).toEqual({ gpu: false, fellBackToCpu: false });
});

test('device: lê do log de inicialização a placa em uso', async () => {
  const s = await server();
  expect(s.device).toBeNull();
  await s.start();
  expect(s.device).toEqual({ gpu: true, backend: 'Vulkan', name: 'Fake GPU', fellBackToCpu: false });
});

test('cpuFallback: o servidor que morre ao subir com a GPU sobe de novo com -ng e segue na CPU no restart', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const s = await server('gpu-crash', true, { cpuFallback: true });
    await s.start();
    expect(s.running).toBe(true);
    expect(s.fellBackToCpu).toBe(true);
    expect(s.device).toEqual({ gpu: false, fellBackToCpu: true });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ErrorDeviceLost'));
    await s.restart();
    expect(s.running).toBe(true);
  } finally {
    warn.mockRestore();
  }
});

test('cpuFallback: o servidor que morre na primeira transcrição com a GPU volta na CPU no restart', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const s = await server('gpu-crash-on-inference', true, { cpuFallback: true });
    await s.start();
    expect(s.device).toEqual({ gpu: true, backend: 'Vulkan', name: 'Fake GPU', fellBackToCpu: false });
    await expect(s.transcribe(pcmToWav(Buffer.alloc(32)))).rejects.toThrow();
    // o pipeline espera o backoff (1 s ou mais) antes do restart; nesse tempo o vigia (no Mac, o sh confere a cada 1 s) já viu a morte
    await vi.waitFor(() => expect(s.running).toBe(false), { timeout: 3000 });
    await s.restart();
    expect(s.fellBackToCpu).toBe(true);
    expect(s.device).toEqual({ gpu: false, fellBackToCpu: true });
    expect(await s.transcribe(pcmToWav(Buffer.alloc(3200)))).toMatch(/^ olá/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('caiu usando a GPU'));
  } finally {
    warn.mockRestore();
  }
});

test('sem cpuFallback (o Mac), o restart depois de cair na transcrição sobe de novo com a GPU, como antes', async () => {
  const s = await server('gpu-crash-on-inference');
  await s.start();
  await expect(s.transcribe(pcmToWav(Buffer.alloc(32)))).rejects.toThrow();
  await vi.waitFor(() => expect(s.running).toBe(false), { timeout: 3000 });
  await s.restart();
  expect(s.fellBackToCpu).toBe(false);
  expect(s.device).toEqual({ gpu: true, backend: 'Vulkan', name: 'Fake GPU', fellBackToCpu: false });
});

test('sem cpuFallback (o Mac), o servidor que morre ao subir rejeita como antes, sem nova tentativa', async () => {
  const s = await server('gpu-crash');
  await expect(s.start()).rejects.toThrow('ErrorDeviceLost');
  expect(s.fellBackToCpu).toBe(false);
});

test('cpuFallback não esconde outros erros: modelo ausente continua rejeitando com a mensagem do servidor', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const s = await server('ok', false, { cpuFallback: true });
    await expect(s.start()).rejects.toThrow('failed to load model');
    expect(s.running).toBe(false);
  } finally {
    warn.mockRestore();
  }
});

test('transcribe antes do start rejeita', async () => {
  const s = await server();
  await expect(s.transcribe(pcmToWav(Buffer.alloc(32)))).rejects.toThrow('não iniciado');
});

test('stop encerra o processo', async () => {
  const s = await server();
  await s.start();
  await s.stop();
  expect(s.running).toBe(false);
});

test('dispose encerra o processo e start/restart passam a recusar', async () => {
  const s = await server();
  await s.start();
  await s.dispose();
  expect(s.running).toBe(false);
  await expect(s.start()).rejects.toThrow('whisper-server descartado');
  await expect(s.restart()).rejects.toThrow('whisper-server descartado');
  expect(s.running).toBe(false);
});

test('o servidor morre junto com o pai, mesmo com SIGKILL no pai (sem órfão)', async () => {
  const { execFileSync, spawn } = await import('node:child_process');
  const { WATCHDOG_SCRIPT } = await import('../../src/main/asr/whisper-server');
  const marker = `${31000 + (process.pid % 900)}.5`;
  const alive = () => execFileSync('pgrep', ['-f', `sleep ${marker}`], { encoding: 'utf8' }).trim() !== '';
  const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  // pai (sh) → wrapper → "servidor" (sleep); o pai é o PID vigiado
  const parent = spawn('/bin/sh', ['-c', `/bin/sh -c ${quote(WATCHDOG_SCRIPT)} sh sleep ${marker} & wait`], { stdio: 'ignore' });
  await vi.waitFor(() => expect(alive()).toBe(true), { timeout: 5000 });
  parent.kill('SIGKILL');
  await vi.waitFor(() => {
    let still = true;
    try {
      still = alive();
    } catch {
      still = false; // pgrep sai com 1 quando não acha ninguém
    }
    expect(still).toBe(false);
  }, { timeout: 8000, interval: 250 });
});
