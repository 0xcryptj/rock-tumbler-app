#!/usr/bin/env node
/** Generate go2rtc.yaml from gateway/.env using camera profile. */
import fs from 'node:fs';
import path from 'node:path';
import { buildRtspUrl, getCameraProfile, parseEnvFile, stripRtspHash, GATEWAY_ROOT } from '../lib/camera.mjs';

const env = parseEnvFile();
const profile = getCameraProfile(env);
const rtspBase = env.RTSP_URL
  ? stripRtspHash(env.RTSP_URL)
  : buildRtspUrl(env, { includePort: profile.portProbeOrder[0] });
if (!rtspBase) {
  console.error('Set RTSP_URL or CAMERA_IP (+ optional RTSP_USER/RTSP_PASS) in gateway/.env');
  process.exit(1);
}

const binDir = path.join(GATEWAY_ROOT, 'bin');
const ffmpegLocal = path.join(binDir, 'ffmpeg.exe');
const hasFfmpeg = fs.existsSync(ffmpegLocal);
const wantFfmpeg =
  env.RTSP_USE_FFMPEG === undefined || env.RTSP_USE_FFMPEG === ''
    ? profile.defaultUseFfmpeg
    : env.RTSP_USE_FFMPEG !== 'false';
if (wantFfmpeg && !hasFfmpeg) {
  console.error(`RTSP_USE_FFMPEG is enabled but missing: ${ffmpegLocal}`);
  console.error('Run: powershell -File gateway/scripts/install-ffmpeg.ps1');
  process.exit(1);
}
const useFfmpeg = wantFfmpeg;

/**
 * go2rtc ffmpeg hash options (one audio= only — duplicate audio= breaks map / RTSP out).
 * @see https://github.com/AlexxIT/go2rtc/blob/master/internal/streams/README.md
 */
function buildGo2rtcSource(rtspUrl, { useFfmpeg, audioMode, profile }) {
  if (!useFfmpeg) {
    return `${rtspUrl}#rtsp_transport=tcp`;
  }
  const input = '#input=-rtsp_transport tcp -fflags nobuffer -flags low_delay';
  if (profile?.id === 'tapo') {
    const tapoInput = '#input=-rtsp_transport tcp -fflags nobuffer -flags low_delay -an';
    return `ffmpeg:${rtspUrl}${tapoInput}#video=copy`;
  }
  const video = '#video=copy';
  if (audioMode === 'none') {
    return `ffmpeg:${rtspUrl}${input}${video}`;
  }
  if (audioMode === 'copy') {
    return `ffmpeg:${rtspUrl}${input}${video}#audio=copy`;
  }
  return `ffmpeg:${rtspUrl}${input}${video}#audio=aac`;
}

const audioMode = (env.GO2RTC_AUDIO || profile.defaultAudio).toLowerCase();
let source;
if (useFfmpeg) {
  source = buildGo2rtcSource(rtspBase, { useFfmpeg: true, audioMode, profile });
  console.log(`Using ffmpeg source (${profile.label}, audio=${audioMode})`);
} else {
  source = buildGo2rtcSource(rtspBase, { useFfmpeg: false, audioMode, profile });
  const hasAuth = /@/.test(rtspBase);
  console.log(
    hasAuth
      ? `Using native RTSP (${profile.label}, credentials in URL)`
      : `Using native RTSP (${profile.label}, no auth in URL)`
  );
}

const lines = [
  '# Auto-generated from .env — do not edit; run scripts/sync-go2rtc-yaml.ps1',
  'api:',
  '  listen: ":1984"',
  '',
  'rtsp:',
  '  listen: ":8554"',
];
if (useFfmpeg && hasFfmpeg) {
  lines.push('', 'ffmpeg:', '  bin: bin/ffmpeg.exe');
}
lines.push('', 'streams:', '  tumbler_cam:', `    - '${source.replace(/'/g, "''")}'`);

const out = path.join(GATEWAY_ROOT, 'go2rtc.yaml');
fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log(`Wrote ${out}`);
console.log(`  ${source.replace(/:([^:@/]+)@/, ':***@')}`);
