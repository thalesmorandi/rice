import { describe, expect, test } from 'vitest';
import { WHISPER_MODELS } from '../../src/main/asr/model-download';
import { LIGHT_LIMITS, normalizeMode, planTranscriber, setTranscriberGpu, threadsFor, transcriberUsesGpu } from '../../src/main/asr/transcriber-plan';

const GIB = 1024 ** 3;
const pc = (ramGiB: number, logicalCores: number) => ({ totalMemBytes: ramGiB * GIB, logicalCores });

describe('modelo e threads do transcritor', () => {
  test('Mac: nada muda (large-v3-turbo q5_0 e as threads de sempre), qualquer que seja o modo salvo', () => {
    for (const mode of ['auto', 'full', 'light'] as const) {
      const plan = planTranscriber(mode, pc(8, 4), false);
      expect(plan.tier).toBe('large');
      expect(plan.model).toEqual(WHISPER_MODELS.q5_0);
      expect(plan.threads).toBeGreaterThanOrEqual(2);
      expect(plan.threads).toBeLessThanOrEqual(8);
    }
  });

  test('Windows automático: PC com folga usa o grande; pouca RAM ou poucos núcleos usa o leve', () => {
    expect(planTranscriber('auto', pc(16, 12), true).model).toEqual(WHISPER_MODELS.q5_0);
    expect(planTranscriber('auto', pc(32, 8), true).tier).toBe('large');
    expect(planTranscriber('auto', pc(8, 12), true).tier).toBe('small'); // 8 GB de RAM
    expect(planTranscriber('auto', pc(7.8, 16), true).tier).toBe('small'); // "8 GB" reais aparecem como ~7,8
    expect(planTranscriber('auto', pc(16, 4), true).tier).toBe('small'); // menos de 6 núcleos
    expect(planTranscriber('auto', pc(16, LIGHT_LIMITS.smallMinCores), true).tier).toBe('large'); // 6 núcleos já é o grande
    expect(planTranscriber('auto', pc(4, 8), true).model).toEqual(WHISPER_MODELS.base_q5_1);
    expect(planTranscriber('auto', pc(16, 2), true).model).toEqual(WHISPER_MODELS.base_q5_1);
  });

  test('forçar: grande ignora o hardware; leve usa small (ou base em máquina mínima) mesmo num PC forte', () => {
    expect(planTranscriber('full', pc(4, 2), true).model).toEqual(WHISPER_MODELS.q5_0);
    expect(planTranscriber('light', pc(32, 16), true).model).toEqual(WHISPER_MODELS.small_q5_1);
    expect(planTranscriber('light', pc(3, 8), true).model).toEqual(WHISPER_MODELS.base_q5_1);
  });

  test('RICE_WHISPER_MODEL à mão vale sempre (como antes), no Windows também', () => {
    expect(planTranscriber('light', pc(4, 2), true, 'f16').model).toEqual(WHISPER_MODELS.f16);
  });

  test('threads: deixa 2 núcleos livres, nunca menos de 2 nem mais que o teto do modelo', () => {
    expect(threadsFor('large', 32)).toBe(6);
    expect(threadsFor('large', 8)).toBe(6);
    expect(threadsFor('small', 32)).toBe(6);
    expect(threadsFor('base', 32)).toBe(4);
    expect(threadsFor('small', 2)).toBe(2);
    expect(planTranscriber('light', pc(8, 4), true).threads).toBe(2);
  });

  test('os modelos leves têm SHA-256 e tamanho fixos no código (nada de confiar no cabeçalho do servidor)', () => {
    for (const spec of [WHISPER_MODELS.small_q5_1, WHISPER_MODELS.base_q5_1]) {
      expect(spec.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(spec.bytes).toBeGreaterThan(50_000_000);
      expect(spec.url.startsWith('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/')).toBe(true);
    }
  });

  test('modo salvo inválido vira automático', () => {
    expect(normalizeMode('light')).toBe('light');
    expect(normalizeMode('full')).toBe('full');
    expect(normalizeMode('large')).toBe('full');
    for (const v of [undefined, null, 'x', 3]) expect(normalizeMode(v)).toBe('auto');
  });

  test('GPU: ligada por padrão; só um false salvo a desliga, e só no Windows (o Mac usa sempre o Metal)', () => {
    try {
      for (const v of [undefined, null, true, 'x']) {
        setTranscriberGpu(v);
        expect(transcriberUsesGpu(true)).toBe(true);
      }
      setTranscriberGpu(false);
      expect(transcriberUsesGpu(true)).toBe(false);
      expect(transcriberUsesGpu(false)).toBe(true);
    } finally {
      setTranscriberGpu(undefined);
    }
  });
});
