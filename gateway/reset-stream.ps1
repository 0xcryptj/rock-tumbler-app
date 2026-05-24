# Reset go2rtc from .env only. Run after changing gateway/.env RTSP URL or path.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=== Reset camera stream ===" -ForegroundColor Cyan

& "$PSScriptRoot\scripts\sync-go2rtc-yaml.ps1"

if (-not (Test-Path ".\bin\go2rtc.exe")) {
  Write-Error "Missing bin\go2rtc.exe. Download go2rtc.exe and place it in gateway\bin."
}

Get-Process go2rtc -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 2

$binDir = Join-Path $PSScriptRoot "bin"
$env:PATH = "$binDir;$env:PATH"

Write-Host "Starting go2rtc (config: go2rtc.yaml)..."
Start-Process `
  -FilePath ".\bin\go2rtc.exe" `
  -ArgumentList "-config", "go2rtc.yaml" `
  -WorkingDirectory $PSScriptRoot `
  -WindowStyle Hidden
Start-Sleep 5

Write-Host ""
& "$PSScriptRoot\scripts\test-rtsp.ps1"
