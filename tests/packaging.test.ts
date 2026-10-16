import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

describe('empacotamento (dmg/zip arm64)', () => {
  test('npm run dist: compila o nativo, copia para native-bin, gera o bundle e empacota', () => {
    expect(pkg.scripts.dist).toBe('scripts/build-native.sh && scripts/stage-native.sh && npm run build:app && electron-builder --mac --arm64');
    expect(pkg.devDependencies['electron-builder']).toBeTruthy();
  });
  test('alvos dmg e zip só arm64, assinatura ad hoc ("-") sem notarização, nome Rice-<versão>-arm64', () => {
    const b = pkg.build;
    expect(b.mac.target).toEqual([{ target: 'dmg', arch: ['arm64'] }, { target: 'zip', arch: ['arm64'] }]);
    expect(b.mac.identity).toBe('-');
    expect(b.artifactName).toBe('Rice-${version}-${arch}.${ext}');
    expect(b.directories.output).toBe('dist');
  });
  test('inclui out, renderer, ícones, modelo do VAD, binários nativos e node_modules, sem as plataformas que não são do Mac arm64', () => {
    const files: string[] = pkg.build.files;
    for (const f of ['out/**', 'src/renderer/**', 'resources/models/**', 'native-bin/**', 'node_modules/**']) expect(files).toContain(f);
    const macFiles: string[] = pkg.build.mac.files; // as exclusões de plataforma ficam em mac.files / win.files (o Windows precisa dos binários win32)
    expect(macFiles.some((f) => f.includes('onnxruntime-node/bin/napi-v6/linux'))).toBe(true); // excluído
    expect(macFiles.some((f) => f.startsWith('!node_modules/better-sqlite3/prebuilds'))).toBe(true);
    expect(files.some((f) => f.startsWith('!'))).toBe(false);
    expect(pkg.build.asar).toBe(false); // os binários nativos precisam existir como arquivos para serem executados
  });
  test('Info.plist: descrições de microfone, áudio do sistema, Calendário e Lembretes (pt/en)', () => {
    const info = pkg.build.mac.extendInfo;
    for (const k of ['NSMicrophoneUsageDescription', 'NSAudioCaptureUsageDescription', 'NSCalendarsFullAccessUsageDescription', 'NSRemindersFullAccessUsageDescription']) expect(info[k]).toMatch(/ \/ /);
    expect(pkg.build.mac.minimumSystemVersion).toBe('14.2');
  });
  test('entitlements para captura de áudio e agenda', () => {
    const plist = readFileSync('build/entitlements.mac.plist', 'utf8');
    for (const k of ['com.apple.security.device.audio-input', 'com.apple.security.personal-information.calendars']) expect(plist).toContain(k);
    expect(pkg.build.mac.entitlements).toBe('build/entitlements.mac.plist');
  });
  test('dist/ e native-bin/ fora do git', () => {
    const ignore = readFileSync('.gitignore', 'utf8').split('\n');
    expect(ignore).toContain('dist/');
    expect(ignore).toContain('native-bin/');
  });
  test('o whisper-server do Windows (resources/win/, gerado pelo dist:win) fora do git', () => {
    expect(readFileSync('.gitignore', 'utf8').split('\n')).toContain('resources/win/');
  });
});

describe('install.sh', () => {
  test('é executável, tem sintaxe válida e o --check roda sem instalar nada', () => {
    expect(statSync('install.sh').mode & 0o111).not.toBe(0);
    execFileSync('bash', ['-n', 'install.sh']);
    const text = readFileSync('install.sh', 'utf8');
    expect(text).toContain('set -euo pipefail');
    expect(text).not.toMatch(/\bsudo\b(?!\))/); // sem sudo (só aparece em comentário/mensagem, nunca como comando)
    for (const f of ['whisper.cpp', 'meson', 'ninja', 'pkg-config']) expect(text).toContain(f);
    expect(text).toContain('xattr -dr com.apple.quarantine');
    expect(text).toContain('ERRO:'); // mensagens de erro em pt e en
    expect(text).toContain('ERROR:');
  });
  test('o app empacotado acha os nativos: paths.ts usa native/ no repositório e native-bin/ no app', () => {
    const paths = readFileSync('src/main/app/paths.ts', 'utf8');
    expect(paths).toContain("existsSync(join(dir, 'native-bin'))");
    expect(paths).toContain("join(root, 'native-bin', name)");
    expect(existsSync('scripts/stage-native.sh')).toBe(true);
  });
});

describe('empacotamento do Windows (nsis x64)', () => {
  const win = pkg.build.win;
  test('alvo nsis só x64, ícone .ico, por usuário (sem administrador), instalador sem assinatura', () => {
    expect(win.target).toEqual([{ target: 'nsis', arch: ['x64'] }]);
    expect(existsSync(win.icon)).toBe(true);
    expect(pkg.build.nsis).toMatchObject({ oneClick: false, perMachine: false, deleteAppDataOnUninstall: false });
    expect(pkg.build.nsis.artifactName).toBe('Rice-Setup-${version}-${arch}.${ext}');
    expect(win.certificateFile).toBeUndefined();
  });
  test('leva o whisper-server e as DLLs; só os binários win32-x64 do onnx e do sqlite', () => {
    const files: string[] = win.files;
    expect(files).toContain('resources/win/**');
    expect(files).toContain('!node_modules/better-sqlite3/prebuilds/!(win32-x64.node)');
    expect(files.some((f) => f.includes('onnxruntime-node/bin/napi-v6/darwin'))).toBe(true);
    expect(files.some((f) => f.includes('napi-v6/win32/x64'))).toBe(false); // win32/x64 fica; só o arm64 sai
    expect(files.some((f) => f.includes('napi-v6/win32/arm64'))).toBe(true);
    expect(pkg.build.mac.files).toContain('!native-bin/win/**'); // o app do Mac não leva os .exe
  });
  test('o build:app não usa cp (não existe no cmd.exe); dist:win prepara helpers e whisper antes', () => {
    expect(pkg.scripts['build:app']).not.toMatch(/cp/);
    expect(readFileSync('scripts/copy-app-files.mjs', 'utf8')).toContain('icon.ico');
    expect(pkg.scripts['dist:win']).toMatch(/stage-native-win\.ps1.*build-whisper-win\.ps1.*build:app.*electron-builder --win --x64/);
    expect(pkg.scripts.dist).toBe('scripts/build-native.sh && scripts/stage-native.sh && npm run build:app && electron-builder --mac --arm64'); // o do Mac não mudou
  });
  test('whisper-server: release oficial do ggml-org com SHA-256 fixado, conferido antes de extrair', () => {
    const ps = readFileSync('scripts/fetch-whisper-win.ps1', 'utf8');
    expect(ps).toContain('https://github.com/ggml-org/whisper.cpp/releases/download/');
    expect(ps).toMatch(/\$Sha256 = '[0-9a-f]{64}'/);
    expect(ps.indexOf('SHA256]::Create')).toBeLessThan(ps.indexOf('ExtractToDirectory'));
    expect(ps).toContain('SHA-256 diferente');
  });
  test('whisper-server com Vulkan: whisper.cpp no commit fixado, CPU oficial como reserva fora do CI', () => {
    const ps = readFileSync('scripts/build-whisper-win.ps1', 'utf8');
    expect(readFileSync('scripts/build-whisper-win.ps1').subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf])); // BOM: o PowerShell 5.1 lê sem BOM como ANSI
    expect(ps).toMatch(/\$Commit = '[0-9a-f]{40}'/);
    expect(ps).toContain('https://github.com/ggml-org/whisper.cpp.git');
    expect(ps.indexOf('commit diferente')).toBeLessThan(ps.indexOf('cmake -S')); // confere o commit antes de compilar
    for (const flag of ['-DGGML_BACKEND_DL=ON', '-DGGML_CPU_ALL_VARIANTS=ON', '-DGGML_NATIVE=OFF', '-DGGML_VULKAN=ON']) expect(ps, flag).toContain(flag);
    expect(ps).toContain("'ggml-vulkan.dll'"); // o pacote sempre leva o backend Vulkan (Copy-Item falha se faltar)
    expect(ps).toMatch(/if \(\$env:CI\) \{ throw/); // no CI não cai para a CPU em silêncio
    expect(ps.indexOf("& (Join-Path $PSScriptRoot 'fetch-whisper-win.ps1')")).toBeGreaterThan(ps.indexOf('if (-not $env:VULKAN_SDK)'));
    const fetch = readFileSync('scripts/fetch-whisper-win.ps1', 'utf8');
    const version = (text: string) => text.match(/\$Version = '([^']+)'/)?.[1];
    expect(version(ps)).toBe(version(fetch)); // GPU e reserva na mesma versão do whisper.cpp
  });
  test('install.ps1: confere Windows x64 22H2, Node 22, CMake e C++; -Check não instala; erros em pt e en', () => {
    const ps = readFileSync('install.ps1', 'utf8');
    for (const k of ['19045', 'PROCESSOR_ARCHITECTURE', 'nodeMajor -lt 22', 'cmake', 'vswhere', 'param([switch]$Check)', 'dist:win', 'ERRO:', 'ERROR:', 'VULKAN_SDK', 'KhronosGroup.VulkanSDK']) expect(ps, k).toContain(k);
    expect(ps).not.toMatch(/Start-Process[^\n]*RunAs/);
    expect(ps.indexOf('if ($Check)')).toBeLessThan(ps.indexOf('npm ci'));
    expect(ps, 'PS 5.1 tira as aspas duplas de dentro das simples').not.toMatch(/node(\.exe)? -[pe] '[^'\n]*"/);
  });
});

describe('CI', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  test('matriz macos-latest e windows-latest com typecheck, testes e build:app', () => {
    expect(ci).toContain('macos-latest');
    expect(ci).toContain('windows-latest');
    for (const step of ['npm run typecheck', 'npx vitest run', 'npm run build:app']) expect(ci).toContain(step);
  });
  test('smoke no Windows com os helpers em modo simulado (binários de build/win) e esperando platform-win', () => {
    expect(ci).toContain('RICE_AUDIO_BIN');
    expect(ci).toContain('build/win/rice-audio.exe');
    expect(ci).toContain('scripts/smoke.mjs --expect-platform win32');
    const smoke = readFileSync('scripts/smoke.mjs', 'utf8');
    for (const k of ['RICE_BENCH', '--user-data-dir', '--remote-debugging-port', '--use-mock-keychain', 'RICE_AUDIO_SIMULATE', 'RICE_DETECTOR_FAKE_MIC_STEPS']) expect(smoke, k).toContain(k);
  });
  test('instaladores do Windows: Vulkan SDK com versão e SHA-256 fixados, conferido antes de instalar, antes do dist:win', () => {
    const action = readFileSync('.github/actions/vulkan-sdk/action.yml', 'utf8');
    expect(action).toMatch(/VERSION: '\d+\.\d+\.\d+\.\d+'/);
    expect(action).toMatch(/SHA256: '[0-9a-f]{64}'/);
    expect(action.indexOf('Get-FileHash')).toBeLessThan(action.indexOf('Start-Process'));
    for (const wf of [ci, readFileSync('.github/workflows/release-windows.yml', 'utf8')]) {
      expect(wf.indexOf('uses: ./.github/actions/vulkan-sdk')).toBeGreaterThan(-1);
      expect(wf.indexOf('uses: ./.github/actions/vulkan-sdk')).toBeLessThan(wf.indexOf('npm run dist:win'));
    }
  });
  test('whisper-win: compila com Vulkan e transcreve sem GPU num job sem SDK', () => {
    const wf = readFileSync('.github/workflows/whisper-win.yml', 'utf8');
    expect(wf).toContain('scripts/build-whisper-win.ps1');
    for (const k of ['MODEL_SHA256', 'WAV_SHA256']) expect(wf).toMatch(new RegExp(`${k}: [0-9a-f]{64}`));
    const smoke = wf.slice(wf.indexOf('sem-gpu:'));
    expect(smoke).not.toContain('vulkan-sdk'); // o teste sem GPU roda sem o SDK nem o MSVC, como num PC comum
    expect(smoke).not.toContain('msvc-dev-cmd');
    expect(smoke).toContain("-notmatch 'country'"); // a amostra jfk.wav precisa sair transcrita
    expect(smoke).toContain("'no GPU found'"); // e na CPU
  });
});
