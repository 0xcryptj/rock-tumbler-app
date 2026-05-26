#!/usr/bin/env node
/**
 * Set LOCAL_API_URL / EXPO_PUBLIC_LOCAL_API_URL from this PC's LAN IPv4.
 * Run from repo root: npm run sync:lan
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 8080;

function pickLanIp() {
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

function setEnvKey(filePath, key, value) {
  const text = fs.readFileSync(filePath, 'utf8');
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  const next = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  fs.writeFileSync(filePath, next.endsWith('\n') ? next : `${next}\n`, 'utf8');
}

const ip = pickLanIp();
if (!ip) {
  console.error('No LAN IPv4 found — set LOCAL_API_URL manually in gateway/.env');
  process.exit(1);
}

const apiBase = `http://${ip}:${PORT}`;
const gatewayEnv = path.join(ROOT, 'gateway', '.env');
const remoteEnv = path.join(ROOT, 'tumbler-remote', '.env');

for (const file of [gatewayEnv, remoteEnv]) {
  if (!fs.existsSync(file)) {
    console.warn(`Skip missing ${file}`);
    continue;
  }
  if (file.includes('gateway')) {
    setEnvKey(file, 'LOCAL_API_URL', apiBase);
    setEnvKey(file, 'PUBLIC_BASE_URL', apiBase);
  } else {
    setEnvKey(file, 'EXPO_PUBLIC_LOCAL_API_URL', apiBase);
    setEnvKey(file, 'EXPO_PUBLIC_API_BASE_URL', apiBase);
  }
  console.log(`Updated ${path.relative(ROOT, file)}`);
}

console.log(`\nLAN API base: ${apiBase}`);
console.log(`Expo web UI:  http://${ip}:8081`);
console.log('For Tailscale remote: npm run sync:tailscale');
console.log('Restart: npm run start');
