# Print URLs for phone / other devices on the same Wi-Fi
$ip = (
  Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -like '10.*' -or $_.IPAddress -like '192.168.*' } |
  Where-Object { $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -First 1 -ExpandProperty IPAddress
)
if (-not $ip) {
  $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' } | Select-Object -First 1).IPAddress
}
Write-Host ""
Write-Host "LAN URLs (update .env if your IP differs):" -ForegroundColor Cyan
Write-Host "  App preview:  http://${ip}:8081"
Write-Host "  Gateway API:  http://${ip}:8080"
Write-Host ""
Write-Host "tumbler-remote/.env:"
Write-Host "  EXPO_PUBLIC_API_BASE_URL=http://${ip}:8080"
Write-Host ""
Write-Host "gateway/.env:"
Write-Host "  PUBLIC_BASE_URL=http://${ip}:8080"
Write-Host ""
