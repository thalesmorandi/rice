import { describe, expect, test } from 'vitest';
import { deviceFromLog } from '../../src/main/asr/whisper-server';

// trechos reais do log de inicialização do whisper-server v1.9.2 (Windows, build com Vulkan)
const VULKAN = [
  'ggml_vulkan: Found 1 Vulkan devices:',
  'ggml_vulkan: 0 = AMD Radeon RX 9060 XT (AMD proprietary driver) | uma: 0 | fp16: 1 | bf16: 1 | fp4: 0 | warp size: 64 | shared memory: 32768 | int dot: 1 | matrix cores: KHR_coopmat',
  'load_backend: loaded Vulkan backend from C:\\Rice\\resources\\win\\ggml-vulkan.dll',
  'load_backend: loaded CPU backend from C:\\Rice\\resources\\win\\ggml-cpu-haswell.dll',
  'whisper_backend_init_gpu: device 0: Vulkan0 (type: 1)',
  'whisper_backend_init_gpu: found GPU device 0: Vulkan0 (type: 1, cnt: 0)',
  'whisper_backend_init_gpu: using Vulkan0 backend',
].join('\r\n');

describe('dispositivo do whisper-server pelo log de inicialização', () => {
  test('Vulkan: o backend e o nome da placa, sem o driver', () => {
    expect(deviceFromLog(VULKAN)).toEqual({ gpu: true, backend: 'Vulkan', name: 'AMD Radeon RX 9060 XT' });
  });
  test('CUDA: o nome vem da linha "Device N"', () => {
    const log = 'ggml_cuda_init: found 1 CUDA devices:\r\n  Device 0: NVIDIA GeForce RTX 4070, compute capability 8.9, VMM: yes\r\nwhisper_backend_init_gpu: using CUDA0 backend\r\n';
    expect(deviceFromLog(log)).toEqual({ gpu: true, backend: 'CUDA', name: 'NVIDIA GeForce RTX 4070' });
  });
  test('backend escolhido que não inicializa: CPU', () => {
    const log = `${VULKAN}\r\nwhisper_backend_init_gpu: failed to initialize Vulkan0 backend\r\n`;
    expect(deviceFromLog(log)).toEqual({ gpu: false });
  });
  test('o índice da placa em uso escolhe o nome certo quando há duas', () => {
    const log = 'ggml_vulkan: 0 = Intel(R) UHD Graphics 630 (Intel Corporation) | uma: 1\nggml_vulkan: 1 = AMD Radeon RX 9060 XT (AMD proprietary driver) | uma: 0\nwhisper_backend_init_gpu: using Vulkan1 backend\n';
    expect(deviceFromLog(log)).toEqual({ gpu: true, backend: 'Vulkan', name: 'AMD Radeon RX 9060 XT' });
  });
  test('sem GPU (ou com -ng): CPU; log sem a linha do backend também conta como CPU', () => {
    expect(deviceFromLog('whisper_backend_init_gpu: no GPU found\n')).toEqual({ gpu: false });
    expect(deviceFromLog('')).toEqual({ gpu: false });
  });
  test('backend sem linha de nome: só o backend', () => {
    expect(deviceFromLog('whisper_backend_init_gpu: using MTL0 backend\n')).toEqual({ gpu: true, backend: 'MTL' });
  });
});
