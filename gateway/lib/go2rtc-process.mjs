/**
 * Start/stop go2rtc as a child of the unified gateway process.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findGo2rtcBin,
  gatewayBinPath,
  FFMPEG_BIN_NAME,
  pathSeparatorForEnv,
} from './bin-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('node:child_process').ChildProcess | null} */
let child = null;

export { findGo2rtcBin as findGo2rtcExe };

export function syncGo2rtcYaml() {
  const script = path.join(path.dirname(__dirname), 'scripts', 'sync-go2rtc-yaml.mjs');
  const result = spawnSync(process.execPath, [script], {
    cwd: path.dirname(__dirname),
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
  } else {
    spawnSync('pkill', ['-x', 'go2rtc'], { stdio: 'ignore' });
  }
  if (child && !child.killed) {
    child.kill('SIGTERM');
    child = null;
  }
}

export function startGo2rtc() {
  const exe = findGo2rtcBin();
  if (!exe) {
    const hint =
      process.platform === 'win32'
        ? 'gateway/bin/go2rtc.exe — run gateway/scripts/install-backend.ps1'
        : 'gateway/bin/go2rtc — run gateway/scripts/install-backend.sh';
    throw new Error(`go2rtc not found — place binary in ${hint}`);
  }

  syncGo2rtcYaml();
  stopExistingGo2rtc();

  const ffmpegBin = gatewayBinPath(FFMPEG_BIN_NAME);
  const env = { ...process.env };
  if (fs.existsSync(ffmpegBin)) {
    const binDir = path.dirname(ffmpegBin);
    const sep = pathSeparatorForEnv();
    env.PATH = `${binDir}${sep}${env.PATH || ''}`;
  }

  const spawnOpts = {
    cwd: path.dirname(__dirname),
    env,
    stdio: 'ignore',
  };
  if (process.platform === 'win32') {
    spawnOpts.windowsHide = true;
  }

  child = spawn(exe, ['-config', 'go2rtc.yaml'], spawnOpts);

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
