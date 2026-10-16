# Instala o Rice no Windows a partir do código: confere o ambiente, compila os helpers nativos, gera o instalador e o abre.
# Installs Rice on Windows from source: checks the environment, builds the native helpers, creates the installer and opens it.
# Idempotente. / Idempotent.   Uso/Usage:  powershell -ExecutionPolicy Bypass -File install.ps1 [-Check]   (-Check só confere / only checks)
param([switch]$Check)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$pt = (Get-UICulture).Name -like 'pt*'
function Say($p, $e) { if ($pt) { Write-Host $p } else { Write-Host $e } }                 # progresso: no idioma do sistema
function Die($p, $e) { Write-Host "ERRO: $p`nERROR: $e" -ForegroundColor Red; exit 1 }       # erros: sempre em pt e en

# 1) Windows 10 22H2 (build 19045) ou mais novo, 64 bits
if (-not [Environment]::Is64BitOperatingSystem) { Die 'o Rice precisa do Windows de 64 bits (x64).' 'Rice needs 64-bit Windows (x64).' }
if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { Die 'este instalador é para o Windows x64 (o ARM64 ainda não é suportado).' 'this installer is for Windows x64 (ARM64 is not supported yet).' }
$build = [Environment]::OSVersion.Version.Build
if ($build -lt 19045) { Die "é preciso o Windows 10 22H2 (build 19045) ou mais novo (você tem o build $build)." "Windows 10 22H2 (build 19045) or newer is required (you have build $build)." }
Say "Windows build ${build}: ok" "Windows build ${build}: ok"

# 2) Node 22 ou mais
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Die 'Node não encontrado. Instale o Node 22 ou mais novo (winget install OpenJS.NodeJS.LTS) e rode de novo.' 'Node not found. Install Node 22 or newer (winget install OpenJS.NodeJS.LTS) and run again.' }
$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]"))
if ($nodeMajor -lt 22) { Die "é preciso o Node 22 ou mais novo (você tem $(node -v))." "Node 22 or newer is required (you have $(node -v))." }
Say "Node $(node -v): ok" "Node $(node -v): ok"

# 3) CMake e as ferramentas C++ do Visual Studio (compilam rice-audio.exe e rice-detector.exe)
if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) { Die 'CMake não encontrado. Instale com: winget install Kitware.CMake' 'CMake not found. Install it with: winget install Kitware.CMake' }
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vs = if (Test-Path $vswhere) { & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath } else { $null }
if (-not $vs) { Die 'faltam as ferramentas C++ do Visual Studio. Instale com: winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --passive"' 'the Visual Studio C++ tools are missing. Install them with: winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --passive"' }
Say 'CMake e ferramentas C++: ok' 'CMake and C++ tools: ok'
# Vulkan SDK (opcional): com ele o whisper-server é compilado com GPU; sem ele, o instalador leva o whisper-server oficial, só CPU
if ($env:VULKAN_SDK) { Say 'Vulkan SDK: ok (transcrição na GPU)' 'Vulkan SDK: ok (transcription on the GPU)' }
else { Say 'aviso: sem o Vulkan SDK a transcrição fica só na CPU. Para usar a GPU: winget install KhronosGroup.VulkanSDK' 'warning: without the Vulkan SDK transcription stays on the CPU. To use the GPU: winget install KhronosGroup.VulkanSDK' }

if ($Check) { Say 'ambiente conferido (-Check): nada foi instalado nem gerado.' 'environment checked (-Check): nothing was installed or built.'; exit 0 }

# 4) dependências, helpers nativos e o instalador
Say 'instalando dependências (npm ci)…' 'installing dependencies (npm ci)…'
npm ci; if ($LASTEXITCODE -ne 0) { Die 'npm ci falhou.' 'npm ci failed.' }
# Cancelamento de eco (WebRTC AEC3): compila uma vez a partir do tarball versionado (10 a 20 min). Se faltar python/meson ou falhar,
# o Rice instala igual, só que sem AEC (quem usa fone não percebe; no alto-falante o eco da call pode ser transcrito duas vezes).
if (-not (Test-Path 'native\third_party\webrtc-apm-win\lib')) {
  Say 'compilando o cancelamento de eco (WebRTC AEC3; só na primeira vez, leva alguns minutos)…' 'building echo cancellation (WebRTC AEC3; first time only, takes a few minutes)…'
  $apmOk = $false
  if (Get-Command python -ErrorAction SilentlyContinue) {
    python -m pip install --quiet meson==1.5.2 ninja==1.11.1.1
    if ($LASTEXITCODE -eq 0) {
      try { & (Join-Path $PSScriptRoot 'scripts\build-webrtc-apm.ps1'); $apmOk = $true } catch { Write-Host $_.Exception.Message }
    }
  }
  if (-not $apmOk) { Say 'aviso: não consegui compilar o AEC; seguindo sem cancelamento de eco.' 'warning: could not build the AEC; continuing without echo cancellation.' }
}
Say 'compilando os helpers nativos (rice-audio.exe, rice-detector.exe)…' 'building the native helpers (rice-audio.exe, rice-detector.exe)…'
cmake -S native/win -B build/win -A x64; if ($LASTEXITCODE -ne 0) { Die 'o CMake não configurou os helpers.' 'CMake could not configure the helpers.' }
cmake --build build/win --config Release; if ($LASTEXITCODE -ne 0) { Die 'a compilação dos helpers falhou. Veja as mensagens acima.' 'building the helpers failed. See the messages above.' }
Say 'gerando o instalador (npm run dist:win; prepara o whisper-server, leva alguns minutos)…' 'building the installer (npm run dist:win; prepares the whisper-server, takes a few minutes)…'
npm run dist:win; if ($LASTEXITCODE -ne 0) { Die 'npm run dist:win falhou. Veja as mensagens acima.' 'npm run dist:win failed. See the messages above.' }

$setup = Get-ChildItem dist -Filter 'Rice-Setup-*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { Die 'não encontrei o instalador em dist\ depois do build.' 'could not find the installer in dist\ after the build.' }
Unblock-File $setup.FullName

# 5) abrir o instalador (por usuário, sem administrador)
Say "pronto: $($setup.FullName)" "done: $($setup.FullName)"
Say 'o instalador não é assinado: o SmartScreen pode avisar "Windows protegeu o computador"; clique em "Mais informações" e "Executar assim mesmo".' 'the installer is not signed: SmartScreen may say "Windows protected your PC"; click "More info" then "Run anyway".'
Start-Process $setup.FullName
