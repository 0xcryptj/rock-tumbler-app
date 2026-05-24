#!/usr/bin/env node
/**
 * Unified Tumbler backend — one process:
 *   1. sync go2rtc.yaml from .env
 *   2. start go2rtc
 *   3. start Express gateway (camera + ESP32 proxy)
 *
 * Run: npm run start   (from repo root or gateway/)
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { startGo2rtc, stopGo2rtc, waitForGo2rtc } from './lib/go2rtc-process.mjs';
import { bootGateway } from './server.js';

const GO2RTC_BASE = process.env.GO2RTC_BASE || 'http://127.0.0.1:1984';
const PORT = Number(process.env.PORT || 8080);

function freeListenPort(port) {
  if (process.platform !== 'win32') {
    return;
  }
  spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
    ],
    { stdio: 'ignore' }
  );
}

function shutdown() {
  console.log('\nShutting down…');
  stopGo2rtc();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('=== Tumbler unified backend ===\n');

try {
  startGo2rtc();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

if (!(await waitForGo2rtc(GO2RTC_BASE))) {
  console.error('go2rtc did not become ready — check gateway/go2rtc.yaml and camera RTSP');
  stopGo2rtc();
  process.exit(1);
}

freeListenPort(PORT);
await bootGateway();
