import type { TranscriptionLanguage } from '../../shared/types';
import { modelsDir, whisperServerBinary } from '../asr/config';
import { ensureModel, type DownloadProgress } from '../asr/model-download';
import { currentPlan, transcriberUsesGpu } from '../asr/transcriber-plan';
import { isWindows } from '../platform';
import type { SpeakerIdentifier } from '../asr/speaker-identifier';
import { AsrPipeline } from '../asr/pipeline';
import { createSileroSession, SileroVad } from '../asr/silero-vad';
import { WhisperServer, type AsrDevice, type Transcriber } from '../asr/whisper-server';

/** Depois da última gravação o servidor segue de pé este tempo, para cobrir o "continuar gravação". */
export const ASR_IDLE_MS = 3 * 60_000;

type Loaded = { server: Transcriber & { dispose(): Promise<void>; readonly device?: AsrDevice | null }; session: Awaited<ReturnType<typeof createSileroSession>> };

export type AsrServiceDeps = {
  ensureModel: (onProgress?: (p: DownloadProgress) => void) => Promise<string>;
  createServer: (modelPath: string) => Promise<Loaded['server']>;
  createSession: () => Promise<Loaded['session']>;
};

/** Opções de GPU do whisper-server: no Windows, a chave das Configurações e a volta para a CPU se o driver quebrar; no Mac, o Metal como sempre. */
export const gpuOptions = (windows = isWindows()): { gpu: boolean; cpuFallback: boolean } => ({ gpu: transcriberUsesGpu(windows), cpuFallback: windows });

const defaultDeps: AsrServiceDeps = {
  ensureModel: (onProgress) => ensureModel(currentPlan().model, modelsDir(), { onProgress }), // Mac: sempre o large-v3-turbo q5_0; Windows: o plano do hardware/configuração
  createServer: async (modelPath) => {
    const server = new WhisperServer({ binary: whisperServerBinary(), modelPath, threads: currentPlan().threads, ...gpuOptions() });
    await server.start();
    return server;
  },
  createSession: () => createSileroSession(),
};

/**
 * Whisper-server e sessão VAD sob demanda: sobem quando uma gravação cria o pipeline e descem
 * `idleMs` depois que o último pipeline termina (nunca durante uma gravação). No boot só garante
 * que o modelo está em disco.
 */
export class AsrService {
  private ready: Promise<Loaded> | null = null;
  private leases = 0;
  private idleTimer: NodeJS.Timeout | null = null;
  private lastServer: Loaded['server'] | null = null;
  private reloadAfter = false;
  private readonly deps: AsrServiceDeps;
  private readonly idleMs: number;

  constructor(
    private readonly opts: {
      onProgress?: (p: DownloadProgress) => void;
      onStatus?: (s: { state: 'loading' | 'ready' | 'failed'; error?: string }) => void;
      idleMs?: number;
      deps?: Partial<AsrServiceDeps>;
    } = {},
  ) {
    this.deps = { ...defaultDeps, ...opts.deps };
    this.idleMs = opts.idleMs ?? ASR_IDLE_MS;
  }

  /** Garante o modelo em disco (baixa se preciso); não sobe o servidor. Nunca rejeita (erros vão para onStatus). */
  async warmup(): Promise<void> {
    this.opts.onStatus?.({ state: 'loading' });
    try {
      await this.deps.ensureModel(this.opts.onProgress);
      this.opts.onStatus?.({ state: 'ready' });
    } catch (err) {
      this.opts.onStatus?.({ state: 'failed', error: (err as Error).message });
    }
  }

  /** `true` enquanto o servidor está carregado (ou carregando). */
  get loaded(): boolean {
    return this.ready !== null;
  }

  /** Onde a última gravação foi transcrita (GPU ou CPU, e se a GPU falhou); `null` antes da primeira nesta execução do app. */
  get device(): AsrDevice | null {
    return this.lastServer?.device ?? null; // lido do servidor: acompanha a volta para a CPU no meio da gravação
  }

  /** A próxima gravação sobe um servidor novo (a GPU foi ligada ou desligada durante esta): ao terminar, ele desce na hora, sem os 3 min. */
  reloadWhenIdle(): void {
    this.reloadAfter = true;
  }

  private load(): Promise<Loaded> {
    this.ready ??= (async () => {
      this.opts.onStatus?.({ state: 'loading' });
      const modelPath = await this.deps.ensureModel(this.opts.onProgress);
      const server = await this.deps.createServer(modelPath);
      try {
        const loaded = { server, session: await this.deps.createSession() };
        this.lastServer = server;
        this.opts.onStatus?.({ state: 'ready' });
        return loaded;
      } catch (err) {
        await server.dispose().catch(() => {});
        throw err;
      }
    })().catch((err: Error) => {
      this.ready = null;
      this.opts.onStatus?.({ state: 'failed', error: err.message });
      throw err;
    });
    return this.ready;
  }

  async createPipeline(language: TranscriptionLanguage = 'pt', vocabulary = '', speakers?: SpeakerIdentifier): Promise<AsrPipeline> {
    this.cancelIdle();
    this.leases++; // reserva já: o servidor não desce enquanto a carga está em andamento
    let loaded: Loaded;
    try {
      loaded = await this.load();
    } catch (err) {
      await speakers?.close().catch(() => {});
      this.releaseLease();
      throw err;
    }
    const pipeline = new AsrPipeline({ createDetector: () => new SileroVad(loaded.session), transcriber: loaded.server, language, ...(vocabulary ? { vocabulary } : {}), ...(speakers ? { speakers } : {}) });
    const finish = pipeline.finish.bind(pipeline);
    let released = false;
    pipeline.finish = async () => {
      try {
        await finish();
      } finally {
        await speakers?.close().catch(() => {}); // o processo do identificador de vozes some junto com a gravação
        if (!released) {
          released = true;
          this.releaseLease();
        }
      }
    };
    return pipeline;
  }

  private releaseLease(): void {
    this.leases = Math.max(0, this.leases - 1);
    if (this.leases > 0) return;
    if (this.reloadAfter) {
      this.reloadAfter = false;
      void this.stop();
    } else this.scheduleIdle();
  }

  private scheduleIdle(): void {
    this.cancelIdle();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.leases === 0) void this.unload();
    }, this.idleMs);
    this.idleTimer.unref?.();
  }

  private cancelIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private async unload(): Promise<void> {
    const ready = this.ready;
    this.ready = null;
    if (!ready) return;
    const loaded = await ready.catch(() => null);
    if (!loaded) return;
    try {
      await loaded.server.dispose();
    } catch {
      // melhor esforço
    }
    await loaded.session.release().catch(() => {});
  }

  async stop(): Promise<void> {
    this.cancelIdle();
    await this.unload();
  }
}
