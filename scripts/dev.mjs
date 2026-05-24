#!/usr/bin/env node
/**
 * One terminal, one command: backend (go2rtc + gateway) + Expo web.
 *
 *   npm run start
 *
 * Ctrl+C stops everything.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const GATEWAY = path.join(ROOT, 'gateway');
const REMOTE = path.join(ROOT, 'tumbler-remote');

loadEnv({ path: path.join(GATEWAY, '.env') });

const PORT = Number(process.env.PORT || 8080);
const EXPO_PORT = Number(process.env.EXPO_WEB_PORT || 8081);
const backendOnly = process.argv.includes('--backend-only');
const noExpo = process.argv.includes('--no-expo') || backendOnly;
const skipCheck = process.argv.includes('--no-check');

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function freePort(port) {
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

function track(child) {
  children.push(child);
  return child;
}

function shutdown() {
  console.log('\nStopping all services…');
  for (const child of children) {
    try {
      child.kill('SIGINT');
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => {
    for (const child of children) {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }
    process.exit(0);
  }, 2500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function waitForGateway(timeoutMs = 90_000) {
  const bases = [
    process.env.PUBLIC_BASE_URL,
    `http://127.0.0.1:${PORT}`,
    `http://localhost:${PORT}`,
  ]
    .filter(Boolean)
    .map((u) => String(u).replace(/\/$/, ''))
    .filter((u, i, a) => a.indexOf(u) === i);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const base of bases) {
      try {
        const response = await fetch(`${base}/health`, {
          signal: AbortSignal.timeout(4000),
        });
        if (response.ok) {
          return base;
        }
      } catch {
        /* retry */
      }
    }
    await sleep(600);
  }
  throw new Error(`Gateway did not respond on port ${PORT} within ${timeoutMs / 1000}s`);
}

async function printBootChecks(apiBase) {
  const { runSystemChecks } = await import(
    `file://${path.join(GATEWAY, 'lib', 'system-check.mjs')}`
  );
  const report = await runSystemChecks({
    assumeGatewayUp: true,
    publicBaseUrl: process.env.PUBLIC_BASE_URL || apiBase,
  });
  for (const row of report.checks) {
    const mark = row.ok ? 'OK ' : 'FAIL';
    console.log(`  [${mark}] ${row.label}: ${row.detail}`);
  }
  if (!report.ok) {
    console.log('\nSome checks failed — app may still work for parts that passed.');
  }
  return report.ok;
}

function startBackend() {
  if (!fs.existsSync(path.join(GATEWAY, 'node_modules'))) {
    console.log('Installing gateway dependencies…');
    spawnSync('npm', ['install'], { cwd: GATEWAY, stdio: 'inherit', shell: true });
  }
  return track(
    spawn(process.execPath, ['index.mjs'], {
      cwd: GATEWAY,
      stdio: 'inherit',
      env: { ...process.env },
    })
  );
}

function startExpo() {
  if (!fs.existsSync(path.join(REMOTE, 'node_modules'))) {
    console.log('Installing Expo app dependencies…');
    spawnSync('npm', ['install'], { cwd: REMOTE, stdio: 'inherit', shell: true });
  }
  return track(
    spawn('npm', ['run', 'web'], {
      cwd: REMOTE,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, FORCE_COLOR: '1' },
    })
  );
}

function lanHostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'localhost';
  }
}

console.log('=== Rock Tumbler (one terminal) ===\n');

freePort(PORT);
if (!noExpo) {
  freePort(EXPO_PORT);
}

const backend = startBackend();
backend.on('exit', (code) => {
  if (code !== null && code !== 0) {
    console.error(`Backend exited (${code})`);
    shutdown();
  }
});

let apiBase;
try {
  console.log('Waiting for backend (go2rtc + gateway)…');
  apiBase = await waitForGateway();
  console.log(`\nBackend ready: ${apiBase}`);
} catch (err) {
  console.error(err.message);
  shutdown();
}

if (!skipCheck) {
  console.log('\nConnection checks:');
  await printBootChecks(apiBase);
}

const apiUrl = process.env.PUBLIC_BASE_URL || apiBase;
const host = lanHostFromUrl(apiUrl);
const appUrl = `http://${host}:${EXPO_PORT}`;

console.log('\n--- URLs ---');
console.log(`API (set in app Settings): ${apiUrl}`);
console.log(`go2rtc (local):            http://127.0.0.1:1984`);
if (!noExpo) {
  console.log(`Expo web app:              ${appUrl}`);
}

if (noExpo) {
  console.log('\nBackend only. Press Ctrl+C to stop.\n');
  await new Promise(() => {});
}

console.log('\nStarting Expo web…\n');
const expo = startExpo();
expo.on('exit', (code) => {
  if (code !== null && code !== 0) {
    console.error(`Expo exited (${code})`);
  }
  shutdown();
});

console.log('Press Ctrl+C once to stop backend + Expo.\n');
await new Promise(() => {});
