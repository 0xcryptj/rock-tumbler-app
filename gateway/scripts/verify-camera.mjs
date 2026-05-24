#!/usr/bin/env node
/**
 * Verify RTSP from gateway/.env (tries paths for CAMERA_TYPE profile).
 */
import path from 'node:path';
import {
  discoverWorkingStream,
  fetchGo2rtcLogHint,
  getCameraConfig,
  maskRtspUrl,
  GATEWAY_ROOT,
} from '../lib/camera.mjs';

const ffmpegBin = path.resolve(GATEWAY_ROOT, process.env.FFMPEG_BIN || 'bin/ffmpeg.exe');
const { profile } = getCameraConfig();

console.log(`${profile.label} RTSP verify (reads gateway/.env fresh)\n`);

const { rtspUrl, cameraIp } = getCameraConfig();
if (!rtspUrl && !cameraIp) {
  console.error('Missing RTSP_URL or CAMERA_IP in gateway/.env');
  process.exit(1);
}

console.log(`Profile: ${profile.id} (${profile.label})`);
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

const logHint = await fetchGo2rtcLogHint();
if (logHint?.code === 'wrong_user_pass') {
  console.error(`\ngo2rtc: wrong user/pass — ${logHint.hint}`);
  process.exit(1);
}

const firstPath = profile.streamPaths[0];
const firstTry = result.tried.find((t) => String(t.streamPath).startsWith(firstPath));
const auth401 = firstTry && !firstTry.ok && /401|Unauthorized/i.test(firstTry.error || '');

if (auth401 && profile.id === 'eufy') {
  const base = (getCameraConfig().vars.GO2RTC_BASE || 'http://127.0.0.1:1984').replace(/\/$/, '');
  const stream = getCameraConfig().go2rtcStream || 'tumbler_cam';
  try {
    const frameUrl = `${base}/api/frame.jpeg?src=${encodeURIComponent(stream)}`;
    const res = await fetch(frameUrl, { signal: AbortSignal.timeout(15_000) });
    const buf = await res.arrayBuffer();
    if (res.ok && buf.byteLength > 2000) {
      console.log(
        `go2rtc frame OK (${buf.byteLength} bytes) — ffmpeg 401 is expected with Eufy Digest; keep RTSP_USE_FFMPEG=false`
      );
      console.log('\nNext: npm run start');
      process.exit(0);
    }
    console.error(`go2rtc frame empty or failed (HTTP ${res.status}, ${buf.byteLength} bytes) — npm run reset:stream`);
  } catch (err) {
    console.error(`go2rtc not reachable at ${base}: ${err.message}`);
  }
  console.error('\nffmpeg cannot use Eufy Digest (401). Options:');
  console.error('  1. Keep RTSP_USE_FFMPEG=false and fix go2rtc (open live view, npm run reset:stream)');
  console.error('  2. Eufy app → RTSP Security → Basic, then RTSP_USE_FFMPEG=true');
} else if (auth401) {
  console.error(`\nRTSP authentication failed — ${profile.authHint}`);
}

const all404 = result.tried.every((t) => !t.ok && /404|Stream Not Found/i.test(t.error || ''));
if (all404) {
  console.error('No working stream path (404 on all — camera reachable, stream not published).');
} else {
  console.error('RTSP probe failed on all paths.');
}

console.error(`\n${profile.setupHint}`);
console.error(profile.wakeHint);
console.error(`See ${profile.docs}`);
process.exit(1);
