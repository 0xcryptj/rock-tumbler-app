# Optional: install ffmpeg next to go2rtc.exe (only needed if RTSP_USE_FFMPEG=true)
$bin = Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) "bin"
New-Item -ItemType Directory -Force -Path $bin | Out-Null

if (Test-Path (Join-Path $bin "ffmpeg.exe")) {
  Write-Host "ffmpeg.exe already in $bin"
  exit 0
}

Write-Host "Downloading ffmpeg for Windows (essentials build)..."
$zip = "$env:TEMP\ffmpeg-essentials.zip"
# BtbN builds — small essentials zip
$url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath $env:TEMP -Force
$exe = Get-ChildItem -Path $env:TEMP -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1
if (-not $exe) {
  Write-Error "ffmpeg.exe not found in archive"
}
Copy-Item $exe.FullName (Join-Path $bin "ffmpeg.exe") -Force
Write-Host "Installed: $bin\ffmpeg.exe"
Write-Host "Set RTSP_USE_FFMPEG=true in .env only if native RTSP fails"
