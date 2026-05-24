# Test Eufy RTSP — uses shared verify-eufy.mjs (reads .env fresh)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $here

$ffmpeg = Join-Path $here "bin\ffmpeg.exe"
if (-not (Test-Path $ffmpeg)) {
  Write-Host "Installing ffmpeg..."
  & "$here\scripts\install-ffmpeg.ps1"
}

node "$here\scripts\verify-eufy.mjs"
exit $LASTEXITCODE
