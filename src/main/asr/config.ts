import { homedir, availableParallelism } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../app/paths';
import { envGet, exeName, isWindows } from '../platform';

export function riceDataDir(): string {
  if (isWindows()) return join(envGet(process.env, 'APPDATA') ?? join(homedir(), 'AppData', 'Roaming'), 'Rice');
  return join(homedir(), 'Library', 'Application Support', 'Rice');
}

export function modelsDir(): string {
  return join(riceDataDir(), 'models');
}

export function whisperServerBinary(): string {
  if (process.env.RICE_WHISPER_SERVER) return process.env.RICE_WHISPER_SERVER;
  // Windows: o instalador leva o whisper-server.exe de whisper.cpp em resources\win (ver scripts/build-whisper-win.ps1)
  return isWindows() ? join(repoRoot(), 'resources', 'win', exeName('whisper-server')) : '/opt/homebrew/bin/whisper-server';
}

export function sileroModelPath(): string {
  // Não usar import.meta.url: no bundle CJS do Electron ele fica vazio ("Invalid URL").
  return process.env.RICE_SILERO_MODEL ?? join(repoRoot(), 'resources', 'models', 'silero_vad.onnx');
}

export function defaultThreads(): number {
  return Math.max(2, Math.min(8, availableParallelism() - 2));
}
