#!/usr/bin/env node
/**
 * One terminal, one command: backend (go2rtc + gateway) + Expo web + public URL.
 *
 *   npm run start
 *
 * Ctrl+C stops everything.
 *
 * Public URL strategy (chosen automatically, no flags needed):
 *   1. If `tailscale funnel status` shows Funnel published for our port → use it.
 *      This is the STABLE forever URL (e.g. https://<host>.<tailnet>.ts.net).
 *   2. Otherwise → fall back to a Cloudflare TryCloudflare quick tunnel
 *      (rotates on every restart, fine for last-resort testing).
 *
 * Flags:
 *   --backend-only   Skip Expo web and any remote tunnel
 *   --no-expo        Skip Expo web (keep remote tunnel)
 *   --no-tunnel      Skip ALL remote tunnels — LAN/Funnel only
 *   --no-funnel      Skip Tailscale Funnel even if it's enabled (force cloudflared)
 *   --no-cloudflared Skip Cloudflare fallback when Funnel isn't available
 *   --no-check       Skip the startup connection self-check
 *
 * Env overrides:
 *   TAILSCALE_BIN            Absolute path to tailscale executable
 *   CLOUDFLARED_BIN          Absolute path to cloudflared executable
 *   CLOUDFLARED_NAMED_TUNNEL Run `cloudflared tunnel run <name>` instead of a quick tunnel
 *   CLOUDFLARED_EXTRA_ARGS   Extra space-separated args appended to the cloudflared invocation
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
const noTunnel = process.argv.includes('--no-tunnel') || backendOnly;
const noFunnel = process.argv.includes('--no-funnel') || noTunnel;
const noCloudflared = process.argv.includes('--no-cloudflared') || noTunnel;
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

function killStaleCloudflared() {
  // Stray cloudflared from a previous session would race the one we spawn and
  // expose a second, unmanaged trycloudflare URL pointed at the same origin.
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/IM', 'cloudflared.exe', '/F'], { stdio: 'ignore' });
  } else {
    spawnSync('pkill', ['-x', 'cloudflared'], { stdio: 'ignore' });
  }
}

function findTailscaleBin() {
  if (process.env.TAILSCALE_BIN) {
    return process.env.TAILSCALE_BIN;
  }
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Tailscale\\tailscale.exe',
      'C:\\Program Files (x86)\\Tailscale\\tailscale.exe',
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    const which = spawnSync('where', ['tailscale'], { encoding: 'utf8' });
    if (which.status === 0) {
      const first = String(which.stdout || '').split(/\r?\n/).find(Boolean);
      if (first && fs.existsSync(first)) return first;
    }
    return null;
  }
  const which = spawnSync('which', ['tailscale'], { encoding: 'utf8' });
  if (which.status === 0) {
    const first = String(which.stdout || '').trim();
    if (first && fs.existsSync(first)) return first;
  }
  return null;
}

/**
 * Inspect `tailscale funnel status` and return the public URL if Funnel is
 * actively proxying our port. Returns null otherwise (Funnel off, different
 * port, tailscale not installed, etc.) so the caller can decide whether to
 * fall back to cloudflared.
 */
function detectTailscaleFunnel(port) {
  const bin = findTailscaleBin();
  if (!bin) return null;
  const out = spawnSync(bin, ['funnel', 'status'], { encoding: 'utf8', timeout: 5000 });
  if (out.status !== 0) return null;
  const text = `${out.stdout || ''}\n${out.stderr || ''}`;
  // Output looks like:
  //   https://<hostname>.<tailnet>.ts.net (Funnel on)
  //   |-- / proxy http://127.0.0.1:8080
  // We only adopt it if the proxy target matches our port.
  const portTargetRe = new RegExp(`proxy\\s+https?://(?:127\\.0\\.0\\.1|localhost):${port}\\b`, 'i');
  if (!portTargetRe.test(text)) return null;
  const urlMatch = text.match(/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+\.ts\.net/i);
  return urlMatch ? urlMatch[0] : null;
}

function findCloudflaredBin() {
  if (process.env.CLOUDFLARED_BIN) {
    return process.env.CLOUDFLARED_BIN;
  }
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
      'C:\\Program Files\\cloudflared\\cloudflared.exe',
      path.join(process.env.LOCALAPPDATA || '', 'cloudflared', 'cloudflared.exe'),
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    // Last resort: rely on PATH.
    const which = spawnSync('where', ['cloudflared'], { encoding: 'utf8' });
    if (which.status === 0) {
      const first = String(which.stdout || '').split(/\r?\n/).find(Boolean);
      if (first && fs.existsSync(first)) return first;
    }
    return null;
  }
  const which = spawnSync('which', ['cloudflared'], { encoding: 'utf8' });
  if (which.status === 0) {
    const first = String(which.stdout || '').trim();
    if (first && fs.existsSync(first)) return first;
  }
  return null;
}

function buildCloudflaredArgs(port) {
  const named = (process.env.CLOUDFLARED_NAMED_TUNNEL || '').trim();
  const extra = (process.env.CLOUDFLARED_EXTRA_ARGS || '').trim().split(/\s+/).filter(Boolean);
  if (named) {
    // Named tunnels read their origin from ~/.cloudflared/config.yml, so we
    // don't pass --url.
    return ['tunnel', 'run', named, '--no-autoupdate', ...extra];
  }
  return ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate', ...extra];
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
  // Remove the persisted tunnel URL so nothing thinks a dead URL is current.
  try {
    fs.unlinkSync(path.join(ROOT, 'tunnel-url.txt'));
  } catch {
    /* file may not exist */
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

/**
 * Spawn cloudflared and resolve once we either capture the public
 * trycloudflare URL (quick tunnel) or see "Registered tunnel connection"
 * (named tunnel — the public URL is owned by the operator, not cloudflared).
 * Returns { child, publicUrl } on success, or null if cloudflared isn't
 * installed (we don't want a missing tunnel to block local dev).
 */
function startCloudflared() {
  const bin = findCloudflaredBin();
  if (!bin) {
    console.warn(
      'Cloudflare tunnel: cloudflared not found in PATH or standard install dirs — skipping.\n' +
        '  Install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n' +
        '  or set CLOUDFLARED_BIN in your environment. Use --no-tunnel to silence this warning.'
    );
    return Promise.resolve(null);
  }

  killStaleCloudflared();

  const args = buildCloudflaredArgs(PORT);
  const child = track(
    spawn(bin, args, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      windowsHide: true,
    })
  );

  const named = (process.env.CLOUDFLARED_NAMED_TUNNEL || '').trim();
  const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
  let publicUrl = null;

  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      console.warn('Cloudflare tunnel: still starting after 30s — continuing without a public URL.');
      resolve({ child, publicUrl });
    }, 30_000);

    const onLine = (line) => {
      const trimmed = String(line).trim();
      if (!trimmed) return;
      // Forward to operator so cloudflared logs are visible inside the unified
      // terminal. cloudflared logs to stderr by default.
      console.log(`[cloudflared] ${trimmed}`);
      if (!publicUrl) {
        const match = trimmed.match(URL_RE);
        if (match) {
          publicUrl = match[0];
        }
      }
      if (!resolved) {
        const ready =
          (named && /Registered tunnel connection/i.test(trimmed)) ||
          (!named && publicUrl && /Registered tunnel connection/i.test(trimmed));
        if (ready) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ child, publicUrl });
        }
      }
    };

    const buffered = (stream) => {
      let buf = '';
      stream.on('data', (chunk) => {
        buf += chunk.toString();
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          onLine(buf.slice(0, idx));
          buf = buf.slice(idx + 1);
        }
      });
      stream.on('end', () => {
        if (buf) onLine(buf);
      });
    };

    if (child.stdout) buffered(child.stdout);
    if (child.stderr) buffered(child.stderr);

    child.on('exit', (code) => {
      if (resolved) {
        if (code !== null && code !== 0) {
          console.error(`Cloudflare tunnel exited (${code})`);
        }
        return;
      }
      resolved = true;
      clearTimeout(timeout);
      console.warn(`Cloudflare tunnel exited before connecting (code ${code})`);
      resolve(null);
    });
  });
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

/** @type {{ url: string, source: 'funnel' | 'cloudflared' } | null} */
let publicTunnel = null;

if (!noFunnel) {
  const funnelUrl = detectTailscaleFunnel(PORT);
  if (funnelUrl) {
    publicTunnel = { url: funnelUrl, source: 'funnel' };
    console.log(`\nTailscale Funnel detected — using stable public URL: ${funnelUrl}`);
    // Kill any leftover cloudflared from previous sessions so we don't expose
    // two competing URLs for the same gateway.
    killStaleCloudflared();
  }
}

if (!publicTunnel && !noCloudflared) {
  console.log('\nStarting Cloudflare tunnel (no Tailscale Funnel detected)…');
  const cloudflared = await startCloudflared();
  if (cloudflared?.publicUrl) {
    publicTunnel = { url: cloudflared.publicUrl, source: 'cloudflared' };
  }
}

console.log('\n--- URLs ---');
console.log(`API (set in app Settings): ${apiUrl}`);
console.log(`go2rtc (local):            http://127.0.0.1:1984`);
if (!noExpo) {
  console.log(`Expo web app:              ${appUrl}`);
}

const tunnelUrlFile = path.join(ROOT, 'tunnel-url.txt');
if (publicTunnel) {
  const { url, source } = publicTunnel;
  const sourceLabel =
    source === 'funnel'
      ? 'Tailscale Funnel (STABLE — same URL forever)'
      : 'Cloudflare quick tunnel (rotates on each restart)';
  // Persist so it can be retrieved from any other shell / script without
  // re-reading dev.mjs output. Old contents are always overwritten, so this
  // file is guaranteed to reflect the CURRENT tunnel.
  try {
    fs.writeFileSync(
      tunnelUrlFile,
      `${url}\n# Source: ${source}\n# Updated ${new Date().toISOString()} by scripts/dev.mjs\n`,
      'utf8'
    );
  } catch (err) {
    console.warn(`Could not write tunnel-url.txt: ${err.message}`);
  }

  const banner = '═'.repeat(Math.max(60, url.length + 8));
  console.log('\n' + banner);
  console.log('  MOBILE / REMOTE PUBLIC URL (use this on your phone):');
  console.log(`      ${url}`);
  console.log(`  Source: ${sourceLabel}`);
  console.log(`  Also saved to: ${tunnelUrlFile}`);
  console.log(banner);
  if (source === 'cloudflared' && !process.env.CLOUDFLARED_NAMED_TUNNEL) {
    console.log(
      '  NOTE: TryCloudflare quick tunnels get a NEW random URL every restart.\n' +
      '  For a stable URL, enable Tailscale Funnel:  tailscale funnel --bg 8080\n' +
      '  (See docs/TAILSCALE.md.)'
    );
  }
} else if (!noTunnel) {
  console.log('Public URL:                (none — LAN access only)');
  try {
    if (fs.existsSync(tunnelUrlFile)) fs.unlinkSync(tunnelUrlFile);
  } catch {
    /* ignore */
  }
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

console.log('Press Ctrl+C once to stop backend + Expo + tunnel.\n');
await new Promise(() => {});
