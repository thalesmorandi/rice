import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTranscriberGpu } from '../../src/main/asr/transcriber-plan';
import { AsrService, gpuOptions } from '../../src/main/session/asr-service';

function setup(idleMs = 1000) {
  const servers: Array<{ dispose: ReturnType<typeof vi.fn> }> = [];
  const sessions: Array<{ release: ReturnType<typeof vi.fn> }> = [];
  const ensureModel = vi.fn(async () => '/models/fake.bin');
  const service = new AsrService({
    idleMs,
    deps: {
      ensureModel,
      createServer: async () => {
        const server = { dispose: vi.fn(async () => {}), transcribe: vi.fn(), restart: vi.fn() };
        servers.push(server);
        return server as never;
      },
      createSession: async () => {
        const session = { release: vi.fn(async () => {}) };
        sessions.push(session);
        return session as never;
      },
    },
  });
  return { service, servers, sessions, ensureModel };
}

describe('AsrService sob demanda', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('device: lido do servidor (acompanha a volta para a CPU no meio da gravação) e mantido depois de ele descer', async () => {
    const server = { dispose: vi.fn(async () => {}), transcribe: vi.fn(), restart: vi.fn(), device: { gpu: true, backend: 'Vulkan', name: 'AMD Radeon RX 9060 XT', fellBackToCpu: false } as object };
    const service = new AsrService({ idleMs: 1000, deps: { ensureModel: async () => '/m', createServer: async () => server as never, createSession: async () => ({ release: vi.fn(async () => {}) }) as never } });
    expect(service.device).toBeNull();
    const pipeline = await service.createPipeline('pt');
    expect(service.device).toEqual({ gpu: true, backend: 'Vulkan', name: 'AMD Radeon RX 9060 XT', fellBackToCpu: false });
    server.device = { gpu: false, fellBackToCpu: true }; // o driver caiu numa transcrição e o servidor voltou na CPU
    expect(service.device).toEqual({ gpu: false, fellBackToCpu: true });
    await pipeline.finish();
    await vi.advanceTimersByTimeAsync(1001);
    expect(service.loaded).toBe(false);
    expect(service.device).toEqual({ gpu: false, fellBackToCpu: true });
  });

  it('device: nada se a sessão de VAD falha (não houve gravação)', async () => {
    const server = { dispose: vi.fn(async () => {}), transcribe: vi.fn(), restart: vi.fn(), device: { gpu: true, backend: 'Vulkan', fellBackToCpu: false } };
    const service = new AsrService({ idleMs: 1000, deps: { ensureModel: async () => '/m', createServer: async () => server as never, createSession: async () => { throw new Error('onnx'); } } });
    await expect(service.createPipeline('pt')).rejects.toThrow('onnx');
    expect(service.device).toBeNull();
  });

  it('reloadWhenIdle: a GPU mudou durante a gravação; ao terminar, o servidor desce na hora e a próxima sobe outro', async () => {
    const { service, servers } = setup(1000);
    const pipeline = await service.createPipeline('pt');
    service.reloadWhenIdle();
    await pipeline.finish();
    await vi.waitFor(() => expect(servers[0]!.dispose).toHaveBeenCalledOnce()); // sem esperar os 1000 ms de ociosidade
    expect(service.loaded).toBe(false);
    const next = await service.createPipeline('pt');
    expect(servers).toHaveLength(2);
    await next.finish();
    await vi.advanceTimersByTimeAsync(999);
    expect(servers[1]!.dispose).not.toHaveBeenCalled(); // pedido atendido: volta à ociosidade normal
  });

  it('gpuOptions: no Windows, a chave e a volta para a CPU; no Mac, a GPU (Metal) e nenhuma nova tentativa', () => {
    try {
      setTranscriberGpu(false);
      expect(gpuOptions(true)).toEqual({ gpu: false, cpuFallback: true });
      expect(gpuOptions(false)).toEqual({ gpu: true, cpuFallback: false });
      setTranscriberGpu(true);
      expect(gpuOptions(true)).toEqual({ gpu: true, cpuFallback: true });
    } finally {
      setTranscriberGpu(undefined);
    }
  });

  it('warmup só garante o modelo: não sobe o servidor', async () => {
    const { service, servers, ensureModel } = setup();
    await service.warmup();
    expect(ensureModel).toHaveBeenCalledOnce();
    expect(servers).toHaveLength(0);
    expect(service.loaded).toBe(false);
  });

  it('sobe ao criar o pipeline e desce depois da ociosidade, não antes', async () => {
    const { service, servers, sessions } = setup(1000);
    const pipeline = await service.createPipeline('pt');
    expect(servers).toHaveLength(1);
    await pipeline.finish();
    await vi.advanceTimersByTimeAsync(999);
    expect(servers[0]!.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(servers[0]!.dispose).toHaveBeenCalledOnce();
    expect(sessions[0]!.release).toHaveBeenCalledOnce();
    expect(service.loaded).toBe(false);
  });

  it('o identificador de pessoas é fechado quando a gravação termina (o processo de voz some junto)', async () => {
    const { service } = setup(1000);
    const speakers = { identify: vi.fn(), close: vi.fn(async () => {}) };
    const pipeline = await service.createPipeline('pt', '', speakers as never);
    expect(speakers.close).not.toHaveBeenCalled();
    await pipeline.finish();
    expect(speakers.close).toHaveBeenCalledOnce();
  });

  it('se o pipeline nem sobe, o identificador também é fechado', async () => {
    const service = new AsrService({ idleMs: 1000, deps: { ensureModel: async () => { throw new Error('sem rede'); }, createServer: async () => ({}) as never, createSession: async () => ({}) as never } });
    const speakers = { identify: vi.fn(), close: vi.fn(async () => {}) };
    await expect(service.createPipeline('pt', '', speakers as never)).rejects.toThrow('sem rede');
    expect(speakers.close).toHaveBeenCalledOnce();
  });

  it('não desce durante a gravação, por mais que o tempo passe', async () => {
    const { service, servers } = setup(1000);
    await service.createPipeline('pt');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(servers[0]!.dispose).not.toHaveBeenCalled();
    expect(service.loaded).toBe(true);
  });

  it('"continuar gravação" dentro da janela reaproveita o servidor e cancela a descida', async () => {
    const { service, servers } = setup(1000);
    const first = await service.createPipeline('pt');
    await first.finish();
    await vi.advanceTimersByTimeAsync(900);
    const second = await service.createPipeline('pt');
    await vi.advanceTimersByTimeAsync(5000);
    expect(servers).toHaveLength(1);
    expect(servers[0]!.dispose).not.toHaveBeenCalled();
    await second.finish();
    await vi.advanceTimersByTimeAsync(1001);
    expect(servers[0]!.dispose).toHaveBeenCalledOnce();
  });

  it('depois de descer, a próxima gravação sobe um servidor novo', async () => {
    const { service, servers } = setup(1000);
    await (await service.createPipeline('pt')).finish();
    await vi.advanceTimersByTimeAsync(1001);
    await service.createPipeline('pt');
    expect(servers).toHaveLength(2);
  });

  it('finish repetido devolve a reserva uma só vez', async () => {
    const { service, servers } = setup(1000);
    const a = await service.createPipeline('pt');
    await service.createPipeline('pt');
    await a.finish();
    await a.finish();
    await vi.advanceTimersByTimeAsync(5000);
    expect(servers[0]!.dispose).not.toHaveBeenCalled(); // o segundo pipeline ainda grava
  });

  it('falha ao carregar libera a reserva e permite nova tentativa', async () => {
    const failing = new AsrService({
      idleMs: 1000,
      deps: { ensureModel: async () => '/m', createServer: async () => { throw new Error('boom'); }, createSession: async () => ({}) as never },
    });
    await expect(failing.createPipeline('pt')).rejects.toThrow('boom');
    expect(failing.loaded).toBe(false);
  });

  it('stop derruba na hora', async () => {
    const { service, servers, sessions } = setup(60_000);
    await service.createPipeline('pt');
    await service.stop();
    expect(servers[0]!.dispose).toHaveBeenCalledOnce();
    expect(sessions[0]!.release).toHaveBeenCalledOnce();
  });
});
