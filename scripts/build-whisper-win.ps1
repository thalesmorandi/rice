# Compila o whisper-server.exe do whisper.cpp (ggml-org) no commit fixado abaixo, com Vulkan, para resources\win. Os backends carregam em
# tempo de execução (GGML_BACKEND_DL): sem GPU ou sem driver Vulkan, o servidor usa a CPU.
# Builds whisper.cpp's whisper-server.exe at the commit pinned below, with Vulkan, into resources\win.
# Precisa / Needs: git, CMake, Visual Studio C++ e Vulkan SDK. Sem o SDK, fora do CI: fetch-whisper-win.ps1 (só CPU).
# Para atualizar: versão e commit da tag aqui e a mesma versão no fetch-whisper-win.ps1 / To update: version and tag commit, same as fetch.
$ErrorActionPreference = 'Stop'
$Version = 'v1.9.2'
$Commit = '306c88f4d1286aec1bf96e544632897886af5501'
Set-Location (Join-Path $PSScriptRoot '..')
$dest = 'resources\win'
if ((Test-Path "$dest\whisper-server.exe") -and (Test-Path "$dest\.version") -and ((Get-Content "$dest\.version") -eq "$Version $Commit vulkan")) { Write-Host "whisper-server $Version (vulkan): ok (já compilado / already built)"; exit 0 }

if (-not $env:VULKAN_SDK) {
  # no CI falha: o instalador nunca sai só com CPU por engano / in CI it fails instead
  if ($env:CI) { throw 'Vulkan SDK não encontrado (VULKAN_SDK vazio) / Vulkan SDK not found (VULKAN_SDK is empty)' }
  Write-Host 'aviso: sem o Vulkan SDK, a transcrição fica só na CPU (whisper-server oficial). Para a GPU: winget install KhronosGroup.VulkanSDK' -ForegroundColor Yellow
  Write-Host 'warning: no Vulkan SDK, transcription stays on the CPU (official whisper-server). For the GPU: winget install KhronosGroup.VulkanSDK' -ForegroundColor Yellow
  & (Join-Path $PSScriptRoot 'fetch-whisper-win.ps1')
  exit 0
}
foreach ($tool in 'git', 'cmake') { if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool não encontrado no PATH / $tool not found in PATH" } }

# no TEMP, e não no repositório: a árvore de build do Vulkan é funda e o MSVC falha (C1041) com caminhos acima de 260 caracteres.
# Fica de um build para o outro, que então só recompila o que mudou. / In TEMP to keep paths short for MSVC; reused between builds.
$work = Join-Path ([IO.Path]::GetTempPath()) 'rice-whisper-win'
$src = "$work\src"
if (-not (Test-Path "$src\.git")) {
  git init -q $src
  if ($LASTEXITCODE -ne 0) { throw 'git init falhou / git init failed' }
}
if ((git -C $src rev-parse -q --verify "$Commit^{commit}") -ne $Commit) {
  # busca o commit fixado, não a tag (uma tag pode ser movida) / fetches the pinned commit, not the tag (a tag can be moved)
  git -C $src fetch -q --depth 1 https://github.com/ggml-org/whisper.cpp.git $Commit
  if ($LASTEXITCODE -ne 0) { throw "git fetch do whisper.cpp falhou (se persistir, apague $work) / git fetch of whisper.cpp failed" }
}
# sempre devolve a árvore ao commit: arquivo alterado ou sobrando no TEMP não entra no build / always resets the tree to the commit
git -C $src checkout -q -f --detach $Commit
if ($LASTEXITCODE -ne 0) { throw 'git checkout do whisper.cpp falhou / git checkout of whisper.cpp failed' }
git -C $src clean -q -f -d -x
if ($LASTEXITCODE -ne 0) { throw 'git clean do whisper.cpp falhou / git clean of whisper.cpp failed' }
$got = git -C $src rev-parse HEAD
if ($got -ne $Commit) { throw "commit diferente do esperado / commit mismatch: $got" }

# Ninja quando o ambiente do MSVC x64 já está carregado (CI, vcvars64); senão o gerador do Visual Studio, que acha o MSVC sozinho.
# O Developer PowerShell abre em x86 por padrão, por isso a checagem do alvo. / Ninja only with an x64 MSVC environment.
$ninja = ($env:VSCMD_ARG_TGT_ARCH -eq 'x64') -and (Get-Command ninja -ErrorAction SilentlyContinue)
$build = if ($ninja) { "$work\build-ninja" } else { "$work\build-vs" }
$generator = if ($ninja) { @('-G', 'Ninja', '-DCMAKE_BUILD_TYPE=Release') } else { @('-A', 'x64') }
# as mesmas opções do release oficial de Windows do whisper.cpp, mais o backend Vulkan / same options as the official Windows release, plus Vulkan
cmake -S $src -B $build @generator -DBUILD_SHARED_LIBS=ON -DGGML_NATIVE=OFF -DGGML_BACKEND_DL=ON -DGGML_CPU_ALL_VARIANTS=ON `
  -DGGML_VULKAN=ON -DWHISPER_BUILD_TESTS=OFF -DWHISPER_SDL2=OFF
if ($LASTEXITCODE -ne 0) { throw 'cmake não configurou o whisper.cpp / cmake could not configure whisper.cpp' }
cmake --build $build --config Release --target whisper-server --parallel
if ($LASTEXITCODE -ne 0) { throw 'a compilação do whisper.cpp falhou / building whisper.cpp failed' }

$bin = @("$build\bin\Release", "$build\bin") | Where-Object { Test-Path "$_\whisper-server.exe" } | Select-Object -First 1
if (-not $bin) { throw "whisper-server.exe não apareceu em $build / whisper-server.exe not found in $build" }
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
New-Item -ItemType Directory -Force $dest | Out-Null
# o servidor e as DLLs que ele carrega: whisper, ggml, o backend Vulkan e as variantes de CPU
Copy-Item "$bin\whisper-server.exe" $dest
foreach ($dll in 'whisper.dll', 'ggml.dll', 'ggml-base.dll', 'ggml-vulkan.dll') { Copy-Item "$bin\$dll" $dest }
Copy-Item "$bin\ggml-cpu-*.dll" $dest
if (-not (Test-Path "$dest\ggml-cpu-*.dll")) { throw "faltam as DLLs ggml-cpu-* em $bin / ggml-cpu-* DLLs missing in $bin" }
Set-Content -NoNewline -Path "$dest\.version" -Value "$Version $Commit vulkan"
# SHA-256 de cada arquivo no log, para comparar builds / SHA-256 of each file in the log, to compare builds
$sha = [System.Security.Cryptography.SHA256]::Create()
foreach ($file in Get-ChildItem $dest -File) {
  $stream = [IO.File]::OpenRead($file.FullName)
  try { Write-Host ('{0}  {1}' -f ([BitConverter]::ToString($sha.ComputeHash($stream)) -replace '-', '').ToLowerInvariant(), $file.Name) } finally { $stream.Dispose() }
}
Write-Host "ok: whisper-server $Version (vulkan, $((Get-ChildItem $dest -Filter *.dll).Count) DLLs)"
