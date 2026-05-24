# Build go2rtc.yaml from gateway/.env (delegates to shared Node module)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $here
node "$here\scripts\sync-go2rtc-yaml.mjs"
