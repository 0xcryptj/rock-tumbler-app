#!/usr/bin/env node
/**
 * Verify Eufy RTSP from gateway/.env (tries live0, live1, live2 per iSpy/C220 matrix).
 */
import path from 'node:path';
import {
  discoverWorkingStream,
  fetchGo2rtcLogHint,
  getCameraConfig,
  maskRtspUrl,
  GATEWAY_ROOT,
} from '../lib/eufy-camera.mjs';

import { getFfmpegBin } from '../lib/bin-paths.mjs';

const ffmpegBin = getFfmpegBin();

console.log('Eufy RTSP verify (reads gateway/.env fresh)\n');

const { rtspUrl, cameraIp } = getCameraConfig();
if (!rtspUrl && !cameraIp) {
  console.error('Missing RTSP_URL or CAMERA_IP in gateway/.env');
  process.exit(1);
}

console.log(`Configured: ${maskRtspUrl(rtspUrl || `rtsp://***@${cameraIp}/...`)}\n`);

const result = await discoverWorkingStream(ffmpegBin);

for (const row of result.tried) {
  const mark = row.ok ? 'OK ' : 'FAIL';
  console.log(`  [${mark}] /${row.streamPath}  ${row.url}`);
  if (!row.ok && row.error) {
    const line = row.error.split('\n').find((l) => l.trim()) || row.error;
    console.log(`         ${line}`);
  }
}

console.log('');
if (result.ok) {
  console.log(`RTSP OK — use RTSP_PATH=${result.streamPath} in gateway/.env`);
  if (result.streamPath !== getCameraConfig().streamPath) {
    console.log(`  (configured path was ${getCameraConfig().streamPath}; update .env)`);
  }
  console.log('\nNext: npm run reset:stream');
  process.exit(0);
}

const live0 = result.tried.find((t) => t.streamPath === 'live0');
const auth401 = live0 && !live0.ok && /401|Unauthorized/i.test(live0.error || '');

const logHint = await fetchGo2rtcLogHint();
if (logHint?.code === 'wrong_user_pass') {
  console.error('\ngo2rtc: wrong user/pass — credentials in gateway/.env do not match the camera.');
  console.error(logHint.hint);
  console.error('\nRun: npm run apply:rtsp -- "rtsp://..."  (paste fresh link from Eufy Setup Guide)');
  process.exit(1);
}

if (auth401) {
  const base = (getCameraConfig().vars.GO2RTC_BASE || 'http://127.0.0.1:1984').replace(/\/$/, '');
  const stream = getCameraConfig().go2rtcStream || 'tumbler_cam';
  try {
    const frameUrl = `${base}/api/frame.jpeg?src=${encodeURIComponent(stream)}`;
    const res = await fetch(frameUrl, { signal: AbortSignal.timeout(15_000) });
    const buf = await res.arrayBuffer();
    if (res.ok && buf.byteLength > 2000) {
      console.log(`go2rtc frame OK (${buf.byteLength} bytes) — ffmpeg 401 is expected with Eufy Digest; keep RTSP_USE_FFMPEG=false`);
      console.log('\nNext: npm run start');
      process.exit(0);
    }
    console.error(`go2rtc frame empty or failed (HTTP ${res.status}, ${buf.byteLength} bytes) — restart: npm run reset:stream`);
  } catch (err) {
    console.error(`go2rtc not reachable at ${base}: ${err.message}`);
  }
  console.error('\nffmpeg cannot use Eufy Digest (401). Options:');
  console.error('  1. Keep RTSP_USE_FFMPEG=false and fix go2rtc (open live view, npm run reset:stream)');
  console.error('  2. Eufy app → RTSP Security → change authentication to Basic, then RTSP_USE_FFMPEG=true');
}

const all404 = result.tried.every((t) => !t.ok && /404|Stream Not Found/i.test(t.error || ''));
if (all404) {
  console.error('No working stream path (404 on all — camera reachable, stream not published).');
} else {
  console.error('RTSP probe failed on all paths.');
}
console.error('Eufy app: enable RTSP/NAS, tap Have configured, open live view 10s, match Setup Guide in gateway/.env, test in VLC.');
console.error('See docs/EUFY-C220-RTSP.md');
process.exit(1);
