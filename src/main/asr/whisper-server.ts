import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { buildChildEnv } from '../ai/env';
import { setTimeout as sleep } from 'node:timers/promises';
import { isWindows } from '../platform';
import { killTree } from '../platform/process';
import { defaultThreads } from './config';

export interface Transcriber {
  /** `language`: `pt`, `en` ou `auto` — vale só para esta chamada (o whisper-server aceita o campo por requisição). */
  transcribe(wav: Buffer, opts?: { prompt?: string; language?: string }): Promise<string>;
  restart(): Promise<void>;
}

export type WhisperServerOptions = {
  binary: string;
  modelPath: string;
  language?: string;
  threads?: number;
  /** `false` sobe o servidor com `-ng` (só CPU). Padrão: a GPU, quando o build tem uma (Metal no Mac, Vulkan no Windows). */
  gpu?: boolean;
  /**
   * Se o servidor morrer usando a GPU (driver de vídeo com defeito; o ggml-vulkan compila os shaders na primeira transcrição, então a quebra
   * vem na subida ou na primeira inferência), sobe de novo com `-ng` e segue na CPU enquanto esta instância existir. O app liga só no Windows.
   */
  cpuFallback?: boolean;
  startupTimeoutMs?: number;
  env?: NodeJS.ProcessEnv;
};

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('não foi possível reservar uma porta'));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

/**
 * O whisper-server é um binário de terceiros que ignora stdin, então não percebe a morte do pai.
 * Este wrapper (`sh`) vigia o PID do Rice e derruba o servidor se o Rice sumir (crash, SIGKILL);
 * com SIGTERM/SIGINT/SIGHUP no wrapper, derruba o servidor e sai.
 * Argumentos: `sh -c WATCHDOG_SCRIPT sh <binário> <args...>`.
 */
export const WATCHDOG_SCRIPT = `P=$PPID
"$@" &
C=$!
trap 'kill $C 2>/dev/null; wait $C 2>/dev/null; exit 143' TERM INT HUP
while kill -0 $P 2>/dev/null; do
  kill -0 $C 2>/dev/null || { wait $C; exit $?; }
  sleep 1 & wait $!
done
kill $C 2>/dev/null
wait $C 2>/dev/null
exit 0`;

/**
 * Windows: não há `sh`. O mesmo vigia em Node (o próprio Electron com ELECTRON_RUN_AS_NODE): sobe o servidor e o derruba se o Rice
 * sumir. Argumentos: `execPath -e WATCHDOG_JS <binário> <args...>`.
 */
export const WATCHDOG_JS = `const {spawn}=require('node:child_process');const P=process.ppid;
const c=spawn(process.argv[1],process.argv.slice(2),{stdio:'inherit',windowsHide:true});
const stop=()=>{try{c.kill()}catch{}};
c.on('error',()=>process.exit(1));c.on('exit',(code)=>process.exit(code??0));
process.on('SIGTERM',()=>{stop();process.exit(143)});
setInterval(()=>{try{process.kill(P,0)}catch{stop();process.exit(0)}},1000);`;

/** Como subir o servidor sob o vigia: `/bin/sh` em grupo próprio no Mac; vigia em Node no Windows. */
export function watchdogLaunch(binary: string, args: string[]): { command: string; args: string[]; detached: boolean; env: NodeJS.ProcessEnv } {
  if (isWindows()) return { command: process.execPath, args: ['-e', WATCHDOG_JS, binary, ...args], detached: false, env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {} };
  return { command: '/bin/sh', args: ['-c', WATCHDOG_SCRIPT, 'sh', binary, ...args], detached: true, env: {} };
}

/** O servidor terminou antes de ficar pronto (o binário rodou; não é erro ao executá-lo). */
class ServerExited extends Error {}

/** Onde o whisper-server transcreve: placa de vídeo (backend do ggml, como Vulkan, e o nome da placa) ou só a CPU. */
export type AsrDevice = { gpu: boolean; backend?: string; name?: string; fellBackToCpu: boolean };

/**
 * Lê o dispositivo do log de inicialização do whisper.cpp: `whisper_backend_init_gpu: using Vulkan0 backend` (ou `no GPU found`, ou
 * `failed to initialize … backend`, que também deixa na CPU) e o nome da placa em `ggml_vulkan: 0 = AMD Radeon RX 9060 XT (…)`.
 */
export function deviceFromLog(log: string): Omit<AsrDevice, 'fellBackToCpu'> {
  const used = /whisper_backend_init_gpu: using ([A-Za-z]+?)(\d+) backend/.exec(log);
  if (!used || /whisper_backend_init_gpu: failed to initialize/.test(log)) return { gpu: false };
  const [, backend, index] = used;
  const name = new RegExp(`ggml_vulkan: ${index} = (.+?)(?: \\(| \\|)`).exec(log)?.[1];
  return { gpu: true, backend, ...(name ? { name: name.trim() } : {}) };
}

export class WhisperServer implements Transcriber {
  private child: ChildProcess | null = null;
  private port = 0;
  private log = '';
  private disposed = false;
  private onCpu = false;
  private dev: AsrDevice | null = null;

  constructor(private readonly options: WhisperServerOptions) {}

  get running(): boolean {
    return this.child !== null && this.child.exitCode === null && this.child.signalCode === null;
  }

  /** `true` depois que o servidor caiu usando a GPU (na subida ou numa transcrição) e voltou na CPU (`cpuFallback`). */
  get fellBackToCpu(): boolean {
    return this.onCpu;
  }

  /** Onde a última subida do servidor ficou transcrevendo (lido do log de inicialização); `null` antes da primeira. */
  get device(): AsrDevice | null {
    return this.dev;
  }

  async start(): Promise<void> {
    if (this.disposed) throw new Error('whisper-server descartado');
    if (this.running) return;
    try {
      await this.launch();
    } catch (err) {
      if (!(err instanceof ServerExited) || !this.options.cpuFallback || this.options.gpu === false || this.onCpu) throw err;
      this.onCpu = true;
      console.warn(`whisper-server: falhou ao subir com a GPU; tentando de novo só na CPU (-ng). ${err.message}`);
      await this.launch();
    }
  }

  private async launch(): Promise<void> {
    this.port = await freePort();
    this.log = '';
    const args = [
      '-m', this.options.modelPath,
      '--host', '127.0.0.1',
      '--port', String(this.port),
      '-l', this.options.language ?? 'pt',
      '-t', String(this.options.threads ?? defaultThreads()),
      ...(this.options.gpu === false || this.onCpu ? ['-ng'] : []),
    ];
    // grupo próprio: o SIGKILL de último recurso derruba wrapper e servidor juntos
    const launch = watchdogLaunch(this.options.binary, args);
    const child = spawn(launch.command, launch.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...buildChildEnv(this.options.env ?? process.env), ...launch.env }, // binário de terceiros: sem as credenciais do shell do usuário
      detached: launch.detached,
      windowsHide: true,
    });
    this.child = child;
    let startup = ''; // o log da subida inteiro (o `log` guarda só o fim): as linhas do dispositivo vêm logo no começo
    const append = (d: Buffer) => {
      const text = d.toString('utf8');
      this.log = (this.log + text).slice(-4000);
      if (startup.length < 65_536) startup += text;
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    let spawnError: Error | null = null;
    child.once('error', (err) => (spawnError = err));

    const deadline = Date.now() + (this.options.startupTimeoutMs ?? 180_000);
    while (Date.now() < deadline) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null) {
        this.child = null;
        if (spawnError) throw new Error(`whisper-server saiu (${(spawnError as Error).message}): ${this.log.trim()}`);
        throw new ServerExited(`whisper-server saiu (código ${child.exitCode ?? child.signalCode}): ${this.log.trim()}`);
      }
      if (await this.healthy()) {
        this.dev = { ...deviceFromLog(startup), fellBackToCpu: this.onCpu };
        return;
      }
      await sleep(250);
    }
    await this.stop();
    throw new Error(`whisper-server não ficou pronto a tempo: ${this.log.trim()}`);
  }

  private async healthy(): Promise<boolean> {
    try {
      const health = await fetch(`http://127.0.0.1:${this.port}/health`, { signal: AbortSignal.timeout(1000) });
      if (health.status === 200) return true;
      if (health.status !== 404) return false;
      const root = await fetch(`http://127.0.0.1:${this.port}/`, { signal: AbortSignal.timeout(1000) });
      return root.status === 200;
    } catch {
      return false;
    }
  }

  async transcribe(wav: Buffer, opts?: { prompt?: string; language?: string }): Promise<string> {
    if (!this.running) throw new Error('whisper-server não iniciado');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'chunk.wav');
    form.append('response_format', 'json');
    form.append('temperature', '0.0');
    if (opts?.prompt) form.append('prompt', opts.prompt);
    if (opts?.language && /^(pt|en|auto)$/.test(opts.language)) form.append('language', opts.language);
    const response = await fetch(`http://127.0.0.1:${this.port}/inference`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`whisper-server inferência falhou: HTTP ${response.status}`);
    const body = (await response.json()) as { text?: unknown };
    if (typeof body.text !== 'string') throw new Error(`whisper-server resposta inválida: ${JSON.stringify(body).slice(0, 200)}`);
    return body.text;
  }

  async restart(): Promise<void> {
    // morreu sozinho usando a GPU (o driver pode quebrar só na primeira transcrição, quando o ggml-vulkan compila os shaders): volta na CPU
    if (this.options.cpuFallback && this.options.gpu !== false && !this.onCpu && this.child !== null && !this.running) {
      this.onCpu = true;
      console.warn(`whisper-server: caiu usando a GPU; subindo de novo só na CPU (-ng). ${this.log.trim().slice(-300)}`);
    }
    await this.stop();
    await this.start();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.stop();
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    if (isWindows()) {
      killTree(child.pid); // sem sinais no Windows: derruba o vigia e o servidor
      await Promise.race([exited, sleep(3000)]);
      return;
    }
    child.kill('SIGTERM');
    const timedOut = await Promise.race([exited.then(() => false), sleep(3000).then(() => true)]);
    if (timedOut) {
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
      await exited;
    }
  }
}
