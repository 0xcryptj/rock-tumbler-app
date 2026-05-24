#!/usr/bin/env node
/**
 * Set PUBLIC_BASE_URL + EXPO_PUBLIC_API_BASE_URL from this PC's LAN IPv4.
 * Run from repo root: node scripts/sync-lan-env.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function pickLanIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      const ip = iface.address;
      if (ip.startsWith('10.') || ip.startsWith('192.168.')) {
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
  console.error('No LAN IPv4 found — set PUBLIC_BASE_URL manually in gateway/.env');
  process.exit(1);
}

const apiBase = `http://${ip}:8080`;
const gatewayEnv = path.join(ROOT, 'gateway', '.env');
const remoteEnv = path.join(ROOT, 'tumbler-remote', '.env');

for (const file of [gatewayEnv, remoteEnv]) {
  if (!fs.existsSync(file)) {
    console.warn(`Skip missing ${file}`);
    continue;
  }
  if (file.includes('gateway')) {
    setEnvKey(file, 'PUBLIC_BASE_URL', apiBase);
  } else {
    setEnvKey(file, 'EXPO_PUBLIC_API_BASE_URL', apiBase);
  }
  console.log(`Updated ${path.relative(ROOT, file)}`);
}

console.log(`\nLAN API base: ${apiBase}`);
console.log(`Expo web UI:  http://${ip}:8081`);
console.log('Restart: npm run start');
