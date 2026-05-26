/**
 * Network helpers — LAN vs Tailscale detection for secure remote access.
 * Only the gateway host runs Tailscale; camera and ESP32 stay on home LAN.
 */
import { execSync } from 'node:child_process';
import os from 'node:os';

/** Tailscale CGNAT range (100.64.0.0/10) */
export function isTailscaleIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

export function isPrivateLanIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  return isTailscaleIp(ip);
}

export function pickLanIpv4() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      const ip = iface.address;
      if (ip.startsWith('10.') || ip.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) {
        candidates.push(ip);
      }
    }
  }
  return candidates[0] || null;
}

export function pickTailscaleIpv4() {
  const nets = os.networkInterfaces();
  for (const [name, ifaces] of Object.entries(nets)) {
    for (const iface of ifaces || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      if (isTailscaleIp(iface.address) || /tailscale/i.test(name)) {
        return iface.address;
      }
    }
  }
  return null;
}

function parseHostPort(value, defaultPort = 8080) {
  const raw = String(value || '').trim().replace(/\/$/, '');
  if (!raw) return { host: '', port: defaultPort, base: '' };
  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`http://${raw}`);
    return {
      host: url.hostname.toLowerCase(),
      port: Number(url.port || defaultPort),
      base: `${url.protocol}//${url.host}`.replace(/\/$/, ''),
    };
  } catch {
    return { host: '', port: defaultPort, base: '' };
  }
}

export function getNetworkConfig() {
  const port = Number(process.env.PORT || 8080);
  const localBase =
    (process.env.LOCAL_API_URL || '').replace(/\/$/, '') ||
    (pickLanIpv4() ? `http://${pickLanIpv4()}:${port}` : '');
  const tailscaleIp = pickTailscaleIpv4();
  const remoteFromEnv = (process.env.REMOTE_API_URL || '').replace(/\/$/, '');
  const remoteBase =
    remoteFromEnv ||
    (process.env.TAILSCALE_HOSTNAME
      ? `http://${process.env.TAILSCALE_HOSTNAME.replace(/\/$/, '')}:${port}`
      : tailscaleIp
        ? `http://${tailscaleIp}:${port}`
        : '');
  const publicBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

  return {
    port,
    localBase,
    remoteBase,
    publicBase,
    tailscaleIp,
    tailscaleHostname: (process.env.TAILSCALE_HOSTNAME || '').trim(),
    localHost: parseHostPort(localBase, port),
    remoteHost: parseHostPort(remoteBase, port),
    publicHost: parseHostPort(publicBase, port),
  };
}

export function isAllowedPublicHost(host) {
  const h = String(host || '').toLowerCase().split(':')[0];
  if (!h) return false;
  if (h === 'localhost' || h === '127.0.0.1') return true;
  if (isPrivateLanIp(h)) return true;
  if (h.endsWith('.ts.net')) return true;
  // Cloudflare TryCloudflare quick tunnels (random subdomain per launch).
  if (h.endsWith('.trycloudflare.com')) return true;
  // Cloudflare Tunnel default catch-all hostnames.
  if (h.endsWith('.cfargotunnel.com')) return true;
  const cfg = getNetworkConfig();
  const allowed = [cfg.localHost.host, cfg.remoteHost.host, cfg.publicHost.host, cfg.tailscaleHostname]
    .filter(Boolean)
    .map((x) => x.toLowerCase());
  if (allowed.includes(h)) return true;
  // Allow any extra hosts the operator trusts. Each entry is matched exactly
  // OR — if it starts with `.` — as a suffix (e.g. `.example.com`).
  const extra = String(process.env.ALLOWED_PUBLIC_HOSTS || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  for (const entry of extra) {
    if (entry.startsWith('.')) {
      if (h.endsWith(entry) || h === entry.slice(1)) return true;
    } else if (h === entry) {
      return true;
    }
  }
  return false;
}

/**
 * Build playback/control URLs using how-to-client host when possible so LAN,
 * Tailscale, and Cloudflare Tunnel clients each get reachable stream URLs.
 *
 * Behind a TLS reverse proxy (Cloudflare Tunnel sets `x-forwarded-proto: https`
 * and `x-forwarded-host: tumbler.example.com` with no port), we must NOT
 * append the local PORT — the public listener is 443.
 */
export function resolvePublicBaseUrl(req, configuredPublicBaseUrl = '') {
  const configured = configuredPublicBaseUrl.replace(/\/$/, '');
  const xfh = req.get('x-forwarded-host');
  const hostHeader = (xfh || req.get('host') || '').split(',')[0].trim();
  const hostOnly = hostHeader.split(':')[0];
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const proxied = Boolean(xfh) || proto === 'https';

  if (hostHeader && isAllowedPublicHost(hostOnly)) {
    if (hostHeader.includes(':')) {
      return `${proto}://${hostHeader}`.replace(/\/$/, '');
    }
    // No port in Host header → behind reverse proxy (use protocol default port)
    // or a public hostname like tumbler.example.com → return as-is.
    if (proxied || configured) {
      return `${proto}://${hostHeader}`.replace(/\/$/, '');
    }
    const port = Number(process.env.PORT || 8080);
    return `${proto}://${hostOnly}:${port}`.replace(/\/$/, '');
  }

  if (configured) return configured;

  const cfg = getNetworkConfig();
  if (cfg.publicBase) return cfg.publicBase;
  if (cfg.remoteBase && isTailscaleIp(hostOnly)) return cfg.remoteBase;
  if (cfg.localBase) return cfg.localBase;

  return `${proto}://${hostHeader || `localhost:${process.env.PORT || 8080}`}`.replace(/\/$/, '');
}

export function tailscaleCliAvailable() {
  try {
    execSync('tailscale version', { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export function getTailscaleStatus() {
  const ip = pickTailscaleIpv4();
  const cli = tailscaleCliAvailable();
  let hostname = (process.env.TAILSCALE_HOSTNAME || '').trim();
  let backendState = 'unknown';

  if (cli) {
    try {
      const raw = execSync('tailscale status --json', {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const status = JSON.parse(raw);
      backendState = status?.BackendState || 'unknown';
      if (!hostname && status?.Self?.DNSName) {
        hostname = String(status.Self.DNSName).replace(/\.$/, '');
      }
      if (!ip && status?.Self?.TailscaleIPs?.length) {
        const tsIp = status.Self.TailscaleIPs.find(isTailscaleIp);
        if (tsIp) {
          return {
            available: backendState === 'Running',
            ip: tsIp,
            hostname,
            backendState,
            cli: true,
          };
        }
      }
    } catch {
      /* fall through */
    }
  }

  return {
    available: Boolean(ip) || backendState === 'Running',
    ip: ip || null,
    hostname: hostname || null,
    backendState,
    cli,
  };
}

export async function probeUrl(baseUrl, timeoutMs = 4000) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  if (!base) return { ok: false, error: 'URL not configured' };
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    return { ok: data?.ok === true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function shouldRequireApiKey() {
  if (process.env.REQUIRE_API_KEY === 'true') return true;
  if (process.env.REQUIRE_API_KEY === 'false') return false;
  const ts = getTailscaleStatus();
  if (ts.available && ts.ip) return true;
  if (process.env.REMOTE_API_URL || process.env.TAILSCALE_HOSTNAME) return true;
  return false;
}

export async function runTailscaleStartupCheck() {
  const cfg = getNetworkConfig();
  const ts = getTailscaleStatus();
  const lines = [];

  if (ts.available) {
    lines.push(`Tailscale: active${ts.ip ? ` (${ts.ip})` : ''}${ts.hostname ? ` · ${ts.hostname}` : ''}`);
  } else if (cfg.remoteBase || process.env.TAILSCALE_HOSTNAME) {
    lines.push('Tailscale: REMOTE_API_URL set but Tailscale IP not detected on this host');
  } else {
    lines.push('Tailscale: not detected (LAN-only mode)');
  }

  if (cfg.localBase) {
    lines.push(`Local API:  ${cfg.localBase}`);
  }
  if (cfg.remoteBase) {
    lines.push(`Remote API: ${cfg.remoteBase}`);
    const probe = await probeUrl(cfg.remoteBase, 5000);
    lines.push(probe.ok ? 'Remote reachability: OK (self-check)' : `Remote reachability: ${probe.error}`);
  }
  if (cfg.publicBase) {
    lines.push(`PUBLIC_BASE_URL: ${cfg.publicBase}`);
  } else {
    lines.push('PUBLIC_BASE_URL: (auto from client Host header — recommended for LAN + Tailscale)');
  }

  const requireKey = shouldRequireApiKey();
  if (requireKey && !process.env.API_KEY) {
    lines.push('SECURITY: API_KEY is required for remote access but not set in gateway/.env');
  } else if (requireKey) {
    lines.push('SECURITY: API key enforcement enabled');
  } else if (!process.env.API_KEY) {
    lines.push('SECURITY: API_KEY not set — LAN-only; set API_KEY before enabling Tailscale');
  }

  return { ts, cfg, lines, requireApiKey: requireKey };
}
