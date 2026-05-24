#!/usr/bin/env node
/**
 * Apply camera RTSP URL to gateway/.env (any vendor).
 * Usage: npm run apply:rtsp -- "rtsp://USER:PASS@10.0.0.50:554/stream1"
 */
import fs from 'node:fs';
import {
  applyRtspDefaultsForProfile,
  parseRtspUrl,
  maskRtspUrl,
  ENV_FILE,
} from '../lib/camera.mjs';

const raw = process.argv.slice(2).join(' ').trim();
const parsed = parseRtspUrl(raw);
if (!parsed.ok) {
  console.error(parsed.error);
  console.error('\nExamples:');
  console.error('  Tapo: npm run apply:rtsp -- "rtsp://USER:PASS@10.0.0.50:554/stream1"');
  console.error('  Eufy: npm run apply:rtsp -- "rtsp://USER:PASS@10.0.0.89/live0"');
  process.exit(1);
}

if (!fs.existsSync(ENV_FILE)) {
  console.error(`Missing ${ENV_FILE}`);
  process.exit(1);
}

let text = fs.readFileSync(ENV_FILE, 'utf8');
const profileDefaults = applyRtspDefaultsForProfile(parsed.profile);
const updates = {
  CAMERA_IP: parsed.cameraIp,
  RTSP_PATH: parsed.rtspPath,
  RTSP_USER: parsed.rtspUser,
  RTSP_PASS: parsed.rtspPass,
  RTSP_URL: parsed.rtspUrl,
  ...profileDefaults,
};

for (const [key, value] of Object.entries(updates)) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
}

fs.writeFileSync(ENV_FILE, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
console.log('Updated gateway/.env:');
console.log(`  CAMERA_TYPE=${parsed.cameraType} (${parsed.profile.label})`);
console.log(`  RTSP_URL=${maskRtspUrl(parsed.rtspUrl)}`);
console.log(`  RTSP_USE_FFMPEG=${profileDefaults.RTSP_USE_FFMPEG}`);
console.log(`  GO2RTC_AUDIO=${profileDefaults.GO2RTC_AUDIO}`);
console.log('\nNext: npm run reset:stream   then   npm run start');
