# Find the ESP32 relay HTTP endpoint on the local 10.0.0.x LAN.
$ErrorActionPreference = "Continue"

$prefix = $env:ESP32_SCAN_PREFIX
if (-not $prefix) {
  $prefix = "10.0.0"
}

Write-Host "Scanning $prefix.2-$prefix.254 for /health..." -ForegroundColor Cyan

$found = @()
foreach ($i in 2..254) {
  $ip = "$prefix.$i"
  $url = "http://$ip/health"
  $body = & curl.exe -s --connect-timeout 1 --max-time 2 $url
  if ($LASTEXITCODE -eq 0 -and $body -match '"deviceId"' -and $body -match '"relayPin"') {
    Write-Host "FOUND $url" -ForegroundColor Green
    Write-Host $body
    $found += $url
  }
}

if ($found.Count -eq 0) {
  Write-Host "No ESP32 relay /health endpoint found." -ForegroundColor Yellow
  Write-Host "Flash the sketch, open Serial Monitor at 115200, then use the printed Health URL."
  exit 1
}

exit 0
