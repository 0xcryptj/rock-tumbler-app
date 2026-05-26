# Install Rock Tumbler home backend (go2rtc + API gateway) on Windows.
# One-liner:
#   iwr -useb https://raw.githubusercontent.com/0xcryptj/rock-tumbler-app/main/gateway/scripts/install-backend.ps1 | iex
#
# Options:
#   $env:INSTALL_DIR = "$env:LOCALAPPDATA\rock-tumbler-app"
#   .\install-backend.ps1 -Service   (register logon scheduled task)

param(
  [switch]$Service
)

$ErrorActionPreference = 'Stop'

$RepoUrl = if ($env:REPO_URL) { $env:REPO_URL } else { 'https://github.com/0xcryptj/rock-tumbler-app.git' }
$RepoBranch = if ($env:REPO_BRANCH) { $env:REPO_BRANCH } else { 'main' }
$InstallDir = if ($env:INSTALL_DIR) { $env:INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'rock-tumbler-app' }
$Go2rtcVersion = if ($env:GO2RTC_VERSION) { $env:GO2RTC_VERSION } else { 'v1.9.14' }

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-WarnStep($msg) { Write-Host "!!> $msg" -ForegroundColor Yellow }

function Test-NodeOk {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { return $false }
  $major = [int](node -p "process.versions.node.split('.')[0]" 2>$null)
  return $major -ge 18
}

function Get-LanIPv4 {
  $addr = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.PrefixOrigin -ne 'WellKnown' -and
      $_.InterfaceAlias -notmatch 'vEthernet|WSL|Loopback'
    } |
    Sort-Object -Property InterfaceMetric |
    Select-Object -First 1 -ExpandProperty IPAddress
  if ($addr) { return $addr }
  return '127.0.0.1'
}

function Ensure-Node {
  if (Test-NodeOk) {
    Write-Step "Node.js $(node -v)"
    return
  }
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    Write-Step 'Installing Node.js LTS via winget…'
    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
      [System.Environment]::GetEnvironmentVariable('Path', 'User')
    if (Test-NodeOk) { return }
  }
  throw 'Node.js 18+ required. Install from https://nodejs.org/ then re-run this script.'
}

function Clone-OrUpdate {
  if (Test-Path (Join-Path $InstallDir '.git')) {
    Write-Step "Updating $InstallDir"
    git -C $InstallDir fetch --depth 1 origin $RepoBranch
    git -C $InstallDir checkout $RepoBranch
    git -C $InstallDir pull --ff-only origin $RepoBranch 2>$null
    return
  }
  if ((Test-Path $InstallDir) -and -not (Test-Path (Join-Path $InstallDir '.git'))) {
    throw "$InstallDir exists but is not a git repo — remove it or set INSTALL_DIR"
  }
  $git = Get-Command git -ErrorAction SilentlyContinue
  if (-not $git) { throw 'git is required. Install Git for Windows: https://git-scm.com/download/win' }
  Write-Step "Cloning $RepoUrl → $InstallDir"
  git clone --depth 1 --branch $RepoBranch $RepoUrl $InstallDir
}

function Install-Go2rtc {
  $binDir = Join-Path $InstallDir 'gateway\bin'
  New-Item -ItemType Directory -Force -Path $binDir | Out-Null
  $dest = Join-Path $binDir 'go2rtc.exe'
  if (Test-Path $dest) {
    Write-Step 'go2rtc.exe already present'
    return
  }
  $zipUrl = "https://github.com/AlexxIT/go2rtc/releases/download/$Go2rtcVersion/go2rtc_win64.zip"
  $zip = Join-Path $env:TEMP 'go2rtc_win64.zip'
  Write-Step 'Downloading go2rtc (win64)…'
  Invoke-WebRequest -Uri $zipUrl -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $env:TEMP -Force
  $exe = Get-ChildItem -Path $env:TEMP -Filter 'go2rtc.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $exe) { throw 'go2rtc.exe not found in downloaded zip' }
  Copy-Item $exe.FullName $dest -Force
  Write-Step "go2rtc → $dest"
}

function Install-FfmpegIfNeeded {
  $script = Join-Path $InstallDir 'gateway/scripts/install-ffmpeg.ps1'
  if (-not (Test-Path $script)) { return }
  & $script
}

function Seed-Env {
  $envFile = Join-Path $InstallDir 'gateway/.env'
  $example = Join-Path $InstallDir 'gateway/.env.example'
  if (Test-Path $envFile) {
    Write-Step 'Keeping existing gateway/.env'
    return
  }
  if (-not (Test-Path $example)) { throw "Missing $example" }
  Copy-Item $example $envFile
  $lan = Get-LanIPv4
  if ($lan) {
    # Replace the RFC 5737 documentation placeholder with the detected LAN IP.
    (Get-Content $envFile -Raw) `
      -replace 'http://192\.0\.2\.30:8080', "http://${lan}:8080" |
      Set-Content $envFile -NoNewline
  }
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $key = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
  (Get-Content $envFile) -replace '^API_KEY=.*$', "API_KEY=$key" | Set-Content $envFile
  Write-Step "Created gateway/.env — edit RTSP_URL, ESP32_BASE, and camera credentials"
}

function Install-NpmGateway {
  Write-Step 'Installing npm dependencies (gateway/)'
  Push-Location (Join-Path $InstallDir 'gateway')
  npm install --omit=dev
  Pop-Location
}

function Write-StartScript {
  $start = Join-Path $InstallDir 'start-backend.ps1'
  @"
# Rock Tumbler backend
Set-Location (Join-Path `$PSScriptRoot 'gateway')
node index.mjs
"@ | Set-Content $start -Encoding UTF8
}

function Register-LogonTask {
  $gateway = Join-Path $InstallDir 'gateway'
  $node = (Get-Command node).Source
  $action = New-ScheduledTaskAction -Execute $node -Argument 'index.mjs' -WorkingDirectory $gateway
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName 'RockTumblerBackend' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
  Write-Step 'Scheduled task: RockTumblerBackend (runs at logon)'
}

Write-Step 'Rock Tumbler backend installer (Windows)'
Ensure-Node
Clone-OrUpdate
Install-Go2rtc
Install-FfmpegIfNeeded
Install-NpmGateway
Seed-Env
Write-StartScript

$sync = Join-Path $InstallDir 'gateway/scripts/sync-go2rtc-yaml.mjs'
if (Test-Path $sync) {
  try {
    node $sync
  } catch {
    Write-WarnStep 'sync-go2rtc-yaml skipped — finish gateway/.env first'
  }
}

if ($Service) {
  Register-LogonTask
}

$lan = Get-LanIPv4
Write-Host ''
Write-Step "Install complete: $InstallDir"
Write-Host "  1. Edit $InstallDir\gateway\.env (RTSP_URL, ESP32_BASE, API_KEY)"
Write-Host "  2. Start:  powershell -File $InstallDir\start-backend.ps1"
Write-Host "  3. App Settings → API base URL: http://${lan}:8080"
Write-Host "  4. Test:   cd $InstallDir\gateway; npm test"
Write-Host ''
Write-Host 'Run at logon: iwr ... | iex; then re-run with -Service or: .\install-backend.ps1 -Service'
