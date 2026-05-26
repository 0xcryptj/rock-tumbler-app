#!/usr/bin/env node
/**
 * Set REMOTE_API_URL / EXPO_PUBLIC_REMOTE_API_URL from Tailscale on this gateway host.
 * Requires Tailscale installed and signed in. Run: npm run sync:tailscale
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 8080;

function isTailscaleIp(ip) {
  const parts = String(ip).split('.').map(Number);
  return parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

function pickTailscaleIp() {
  try {
    const out = execSync('tailscale ip -4', { encoding: 'utf8', timeout: 5000 }).trim();
    const ip = out.split('\n')[0].trim();
    if (isTailscaleIp(ip)) return ip;
  } catch {
    /* fall through */
  }

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

function pickTailscaleHostname() {
  try {
    const raw = execSync('tailscale status --json', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const status = JSON.parse(raw);
    const dns = status?.Self?.DNSName;
    if (dns) return String(dns).replace(/\.$/, '');
  } catch {
    /* ignore */
  }
  return null;
}

function setEnvKey(filePath, key, value) {
  const text = fs.readFileSync(filePath, 'utf8');
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  const next = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  fs.writeFileSync(filePath, next.endsWith('\n') ? next : `${next}\n`, 'utf8');
}

const ip = pickTailscaleIp();
const hostname = pickTailscaleHostname();

if (!ip && !hostname) {
  console.error('Tailscale not detected — install Tailscale, sign in, then re-run npm run sync:tailscale');
  process.exit(1);
}

const remoteBase = hostname ? `http://${hostname}:${PORT}` : `http://${ip}:${PORT}`;
const gatewayEnv = path.join(ROOT, 'gateway', '.env');
const remoteEnv = path.join(ROOT, 'tumbler-remote', '.env');

for (const file of [gatewayEnv, remoteEnv]) {
  if (!fs.existsSync(file)) {
    console.warn(`Skip missing ${file}`);
    continue;
  }
  if (file.includes('gateway')) {
    setEnvKey(file, 'REMOTE_API_URL', remoteBase);
    if (hostname) setEnvKey(file, 'TAILSCALE_HOSTNAME', hostname);
    if (ip) setEnvKey(file, 'TAILSCALE_IP', ip);
  } else {
    setEnvKey(file, 'EXPO_PUBLIC_REMOTE_API_URL', remoteBase);
  }
  console.log(`Updated ${path.relative(ROOT, file)}`);
}

console.log(`\nTailscale remote API: ${remoteBase}`);
if (hostname) console.log(`MagicDNS hostname:    ${hostname}`);
if (ip) console.log(`Tailscale IPv4:       ${ip}`);
console.log('\nSet a strong API_KEY in gateway/.env and EXPO_PUBLIC_API_KEY in tumbler-remote/.env');
console.log('Leave PUBLIC_BASE_URL empty for auto Host-based playback URLs (LAN + Tailscale).');
console.log('Restart: npm run start');
