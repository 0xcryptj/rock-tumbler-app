# Delegates to repo-root dev launcher (backend + optional Expo in one terminal)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
node scripts/dev.mjs @args
