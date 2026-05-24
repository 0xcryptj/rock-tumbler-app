/**
 * Start/stop go2rtc as a child of the unified gateway process.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GATEWAY_ROOT } from './eufy-camera.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('node:child_process').ChildProcess | null} */
let child = null;

export function findGo2rtcExe() {
  const candidates = [
    path.join(GATEWAY_ROOT, 'bin', 'go2rtc.exe'),
    path.join(GATEWAY_ROOT, 'go2rtc.exe'),
    path.join(process.env.USERPROFILE || '', 'Downloads', 'go2rtc.exe'),
    path.join(process.env.USERPROFILE || '', 'Downloads', 'go2rtc_win64', 'go2rtc.exe'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function syncGo2rtcYaml() {
  const script = path.join(GATEWAY_ROOT, 'scripts', 'sync-go2rtc-yaml.mjs');
  const result = spawnSync(process.execPath, [script], {
    cwd: GATEWAY_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error('sync-go2rtc-yaml.mjs failed');
  }
}

function stopExistingGo2rtc() {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/IM', 'go2rtc.exe', '/F'], { stdio: 'ignore' });
  }
  if (child && !child.killed) {
    child.kill('SIGTERM');
    child = null;
  }
}

export function startGo2rtc() {
  const exe = findGo2rtcExe();
  if (!exe) {
    throw new Error('go2rtc.exe not found — place in gateway/bin/go2rtc.exe');
  }

  syncGo2rtcYaml();
  stopExistingGo2rtc();

  const ffmpegBin = path.join(GATEWAY_ROOT, 'bin', 'ffmpeg.exe');
  const env = { ...process.env };
  if (fs.existsSync(ffmpegBin)) {
    const binDir = path.join(GATEWAY_ROOT, 'bin');
    env.PATH = `${binDir};${env.PATH || ''}`;
  }

  child = spawn(exe, ['-config', 'go2rtc.yaml'], {
    cwd: GATEWAY_ROOT,
    env,
    stdio: 'ignore',
    windowsHide: true,
  });

  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.warn(`go2rtc exited with code ${code}`);
    }
    child = null;
  });

  console.log(`go2rtc started (${exe})`);
  return exe;
}

export function stopGo2rtc() {
  if (child && !child.killed) {
    child.kill('SIGTERM');
    child = null;
  }
  stopExistingGo2rtc();
}

export async function waitForGo2rtc(
  base = process.env.GO2RTC_BASE || 'http://127.0.0.1:1984',
  timeoutMs = 30_000
) {
  const url = `${String(base).replace(/\/$/, '')}/api`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        return true;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
