import { availableParallelism, totalmem } from 'node:os';
import { isWindows } from '../platform';
import { defaultThreads } from './config';
import { whisperModelFor, WHISPER_MODELS, type ModelSpec } from './model-download';

/**
 * Qual modelo do Whisper e quantas threads usar. No Mac nada muda (large-v3-turbo q5_0 com `defaultThreads()`, Metal do whisper-server).
 * No Windows a escolha olha só a RAM e a CPU (a GPU, quando o whisper-server a usa, só acelera): PC com pouca RAM ou poucos núcleos usa o
 * "modo leve" (small ou base quantizados), escolhido sozinho; em Configurações o usuário pode forçar o grande ou o leve, e desligar a GPU.
 */
/** Os mesmos valores de `settings.asrModel` do app: 'full' = modelo grande, 'light' = small/base, 'auto' = pelo hardware. */
export type TranscriberMode = 'auto' | 'full' | 'light';
export type TranscriberTier = 'large' | 'small' | 'base';
export type Hardware = { totalMemBytes: number; logicalCores: number };
export type TranscriberPlan = { tier: TranscriberTier; model: ModelSpec; threads: number; reason: string };

const GIB = 1024 ** 3;

/** Limites do modo leve (ver o relatório de medidas): RAM total ≤ 8 GiB ou menos de 6 núcleos lógicos → small; ≤ 4 GiB ou menos de 4 núcleos → base. */
export const LIGHT_LIMITS = { smallRamGiB: 8.5, smallMinCores: 6, baseRamGiB: 4.5, baseMinCores: 4 } as const;

export function normalizeMode(value: unknown): TranscriberMode {
  return value === 'full' || value === 'light' ? value : value === 'large' ? 'full' : 'auto'; // 'large' (nome antigo) = 'full'
}

function lightTier(hw: Hardware): TranscriberTier {
  return hw.totalMemBytes <= LIGHT_LIMITS.baseRamGiB * GIB || hw.logicalCores < LIGHT_LIMITS.baseMinCores ? 'base' : 'small';
}

const ceil = { large: 6, small: 6, base: 4 } as const; // medido: mais threads que isso não ajuda (o large empata em 6 e 8; small e base pioram em 8)

/** Threads: deixa 2 núcleos para o resto do PC (gravação, Electron), entre 2 e o teto do modelo (mais threads que isso piora: ver medidas). */
export function threadsFor(tier: TranscriberTier, logicalCores: number): number {
  return Math.max(2, Math.min(ceil[tier], logicalCores - 2));
}

export function planTranscriber(mode: TranscriberMode, hw: Hardware, windows: boolean, variantOverride?: string): TranscriberPlan {
  const large = (reason: string): TranscriberPlan => ({ tier: 'large', model: whisperModelFor(variantOverride), threads: windows ? threadsFor('large', hw.logicalCores) : defaultThreads(), reason });
  // Mac, ou quem define RICE_WHISPER_MODEL à mão: como sempre foi.
  if (!windows || variantOverride) return large(windows ? 'RICE_WHISPER_MODEL' : 'mac');
  if (mode === 'full') return large('forçado: modelo grande');
  const weak = hw.totalMemBytes <= LIGHT_LIMITS.smallRamGiB * GIB || hw.logicalCores < LIGHT_LIMITS.smallMinCores;
  if (mode === 'auto' && !weak) return large('automático: PC com folga');
  const tier = lightTier(hw);
  const why = mode === 'light' ? 'forçado: modo leve' : `automático: ${(hw.totalMemBytes / GIB).toFixed(1)} GiB de RAM, ${hw.logicalCores} núcleos`;
  return { tier, model: tier === 'base' ? WHISPER_MODELS.base_q5_1 : WHISPER_MODELS.small_q5_1, threads: threadsFor(tier, hw.logicalCores), reason: why };
}

let preference: TranscriberMode = 'auto';
export const setTranscriberMode = (mode: unknown): void => {
  preference = normalizeMode(mode);
};
export const getTranscriberMode = (): TranscriberMode => preference;

/** `settings.asrGpu` (padrão: ligado). Desligado, o whisper-server do Windows sobe com `-ng` (só CPU); o Mac ignora (Metal, como sempre). */
let gpuPreference = true;
export const setTranscriberGpu = (on: unknown): void => {
  gpuPreference = on !== false;
};
export const transcriberUsesGpu = (windows = isWindows()): boolean => !windows || gpuPreference;

/** O plano de agora (modo das configurações + hardware desta máquina). */
export function currentPlan(): TranscriberPlan {
  return planTranscriber(preference, { totalMemBytes: totalmem(), logicalCores: availableParallelism() }, isWindows(), process.env.RICE_WHISPER_MODEL);
}
