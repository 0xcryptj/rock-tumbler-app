/**
 * Tumbler home gateway
 *
 * Video: camera RTSP → go2rtc (auth) → ffmpeg → fragmented MP4 → app <video>
 * Relay: ESP32 proxy
 */

import 'dotenv/config';
import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  discoverWorkingStream,
  fetchGo2rtcLogHint,
  getCameraConfig,
  maskRtspUrl,
  probeRtspUrl,
} from './lib/camera.mjs';
import {
  esp32Health,
  esp32Relay,
  formatEsp32Health,
  getEsp32Config,
  relayPinMismatch,
} from './lib/esp32.mjs';
import { runSystemChecks } from './lib/system-check.mjs';
import {
  getFfmpegBin,
  getGo2rtcRelayRtspUrl,
  pipeFfmpegJpeg,
  pipeFfmpegMp4,
} from './lib/video-stream.mjs';

const PORT = Number(process.env.PORT || 8080);
const CONFIGURED_PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const API_KEY = process.env.API_KEY || '';
const GO2RTC_BASE = (process.env.GO2RTC_BASE || 'http://127.0.0.1:1984').replace(/\/$/, '');
const GO2RTC_STREAM = process.env.GO2RTC_STREAM || 'tumbler_cam';
const FFMPEG_BIN = getFfmpegBin();
const { base: ESP32_BASE, deviceId: ESP32_DEVICE_ID, expectedRelayPin: ESP32_EXPECTED_PIN, relayInvert: ESP32_RELAY_INVERT } =
  getEsp32Config();
const STREAM_SESSION_MS = Number(process.env.STREAM_SESSION_MINUTES || 30) * 60 * 1000;

/** @type {Map<string, { token: string, deviceId: string, expires: number }>} */
const sessions = new Map();

const app = express();
app.set('trust proxy', true);
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());

function spawnFfmpegArgs(args) {
  return spawn(FFMPEG_BIN, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function getRtspUrl() {
  return getCameraConfig().rtspUrl;
}

function getPublicBaseUrl(req) {
  if (CONFIGURED_PUBLIC_BASE_URL) {
    return CONFIGURED_PUBLIC_BASE_URL;
  }
  const host = req.get('x-forwarded-host') || req.get('host') || `localhost:${PORT}`;
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return `${proto}://${host}`.replace(/\/$/, '');
}

function requireAuth(req, res, next) {
  if (!API_KEY) {
    next();
    return;
  }
  const header = req.headers.authorization || '';
  if (header === `Bearer ${API_KEY}`) {
    next();
    return;
  }
  res.status(401).json({ error: 'unauthorized' });
}

function getSession(sessionId, token) {
  const row = sessions.get(sessionId);
  if (!row || row.token !== token || row.expires < Date.now()) {
    return null;
  }
  return row;
}

async function isGo2rtcReachable() {
  try {
    const response = await fetch(`${GO2RTC_BASE}/api`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** Wake go2rtc RTSP producer (reads camera from go2rtc.yaml). */
async function pokeGo2rtcStream(timeoutMs = 5000) {
  try {
    await fetch(
      `${GO2RTC_BASE}/api/frame.jpeg?src=${encodeURIComponent(GO2RTC_STREAM)}`,
      { signal: AbortSignal.timeout(timeoutMs) }
    );
  } catch {
    /* may still work on Play */
  }
}

/** ffmpeg reads local go2rtc relay (no camera auth); falls back to direct RTSP. */
async function resolvePlaybackRtspUrl() {
  if (await isGo2rtcReachable()) {
    return getGo2rtcRelayRtspUrl();
  }
  return getRtspUrl();
}

async function verifyCameraReady() {
  const { rtspUrl, streamPath, profile } = getCameraConfig();
  if (!rtspUrl) {
    return { ok: false, error: 'Camera RTSP not configured' };
  }

  if (await isGo2rtcReachable()) {
    await pokeGo2rtcStream(8000);
    try {
      const response = await fetch(
        `${GO2RTC_BASE}/api/frame.jpeg?src=${encodeURIComponent(GO2RTC_STREAM)}`,
        { signal: AbortSignal.timeout(20_000) }
      );
      const buf = Buffer.from(await response.arrayBuffer());
      if (response.ok && buf.length > 500) {
        return { ok: true, mode: 'go2rtc', rtspUrl, streamPath };
      }
      const logHint = await fetchGo2rtcLogHint(GO2RTC_BASE, profile);
      if (logHint) {
        return {
          ok: false,
          error: logHint.code === 'wrong_user_pass'
            ? 'Camera rejected RTSP username/password'
            : 'No video from camera',
          detail: logHint.message,
          hint: logHint.hint,
        };
      }
    } catch (err) {
      return { ok: false, error: err.message, hint: profile.setupHint };
    }
  }

  const probe = await probeRtspUrl(rtspUrl, FFMPEG_BIN, 12_000);
  if (probe.ok) {
    return { ok: true, mode: 'ffmpeg', rtspUrl, streamPath };
  }

  const is404 = /404|Stream Not Found/i.test(probe.error || '');
  if (is404) {
    const discovered = await discoverWorkingStream(FFMPEG_BIN);
    if (discovered.ok) {
      return {
        ok: true,
        mode: 'ffmpeg',
        rtspUrl: discovered.rtspUrl,
        streamPath: discovered.streamPath,
      };
    }
    return {
      ok: false,
      error: `${profile.label} RTSP not publishing`,
      detail: probe.error,
      hint: `${profile.wakeHint} · ${profile.docs}`,
      tried: discovered.tried,
    };
  }

  return {
    ok: false,
    error: probe.error || 'RTSP probe failed',
    hint: profile.authHint || profile.setupHint,
  };
}

async function logGo2rtcStreamConfig() {
  if (!(await isGo2rtcReachable())) {
    console.warn('go2rtc not running — npm run start');
    return false;
  }
  try {
    const response = await fetch(`${GO2RTC_BASE}/api/streams`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return false;
    }
    const streams = await response.json();
    const producers = streams[GO2RTC_STREAM]?.producers;
    if (producers?.length) {
      const url = String(producers[0].url || '').replace(/:([^:@/]+)@/, ':***@');
      console.log(`RTSP source → go2rtc "${GO2RTC_STREAM}": ${url}`);
      console.log(`App playback → ffmpeg → ${getGo2rtcRelayRtspUrl()}`);
      return true;
    }
    console.warn(`go2rtc missing stream "${GO2RTC_STREAM}" — npm run reset:stream`);
  } catch (err) {
    console.warn('go2rtc streams API:', err.message);
  }
  return false;
}

async function verifyCameraStream() {
  const ready = await verifyCameraReady();
  if (ready.ok) {
    console.log('Camera OK — Play uses RTSP → MP4');
    return true;
  }
  console.warn('Camera not ready:', ready.error);
  if (ready.hint) {
    console.warn(ready.hint);
  }
  return false;
}

function popoutPlayerHtml(mediaUrl) {
  const safeUrl = String(mediaUrl)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Tumbler camera</title>
<style>html,body{margin:0;height:100%;background:#000}video{width:100%;height:100%;object-fit:contain;background:#000}</style>
</head><body>
<video src="${safeUrl}" autoplay muted playsinline controls></video>
<script>
(function () {
  var v = document.querySelector('video');
  if (!v) return;
  v.play().catch(function () { v.muted = true; v.play(); });
})();
</script>
</body></html>`;
}

app.get('/', (req, res) => {
  const base = getPublicBaseUrl(req);
  const host = base.replace(/^https?:\/\//, '').replace(/:8080$/, '');
  const expoWeb = `http://${host}:8081`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Tumbler Gateway</title></head><body>
<h1>Tumbler gateway API</h1>
<p>API: <code>${base}</code> · App UI: <a href="${expoWeb}">${expoWeb}</a></p>
<p>Video path: RTSP (gateway/.env) → go2rtc → MP4 stream for the app.</p>
</body></html>`);
});

app.get('/health', (req, res) => {
  const publicBaseUrl = getPublicBaseUrl(req);
  const host = publicBaseUrl.replace(/^https?:\/\//, '').replace(/:8080$/, '');
  const { cameraType, cameraLabel, profile } = getCameraConfig();
  res.json({
    ok: true,
    service: 'tumbler-unified',
    video: 'rtsp→mp4',
    go2rtc: GO2RTC_BASE,
    stream: GO2RTC_STREAM,
    cameraType,
    cameraLabel,
    cameraDocs: profile.docs,
    rtspConfigured: Boolean(getRtspUrl()),
    rtspUrl: maskRtspUrl(getRtspUrl()) || null,
    esp32: ESP32_BASE || null,
    publicBaseUrl,
    expoWebUrl: `http://${host}:8081`,
  });
});

app.get('/api/test/all', requireAuth, async (req, res) => {
  try {
    const report = await runSystemChecks({
      assumeGatewayUp: true,
      publicBaseUrl: getPublicBaseUrl(req),
    });
    res.status(200).json(report);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, checks: [] });
  }
});

app.get('/api/test/esp32', requireAuth, async (_req, res) => {
  if (!ESP32_BASE) {
    res.status(503).json({ ok: false, error: 'ESP32_BASE not set in gateway .env' });
    return;
  }
  try {
    const { ok, json: data } = await esp32Health();
    const pinWarn = relayPinMismatch(data, ESP32_EXPECTED_PIN)
      ? `Firmware uses GPIO${data.relayPin}; expected GPIO${ESP32_EXPECTED_PIN} — reflash sketch`
      : null;
    res.status(ok ? 200 : 502).json({
      ok: ok && data.ok === true,
      esp32: ESP32_BASE,
      deviceId: data.deviceId,
      status: data.status,
      relayStatus: data.status,
      ip: data.ip,
      relayPin: data.relayPin,
      detail: formatEsp32Health(data),
      warning: pinWarn,
    });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message, esp32: ESP32_BASE });
  }
});

app.post('/api/test/relay-cycle', requireAuth, async (_req, res) => {
  if (!ESP32_BASE) {
    res.status(503).json({ ok: false, error: 'ESP32_BASE not set in gateway .env' });
    return;
  }
  try {
    const before = await esp32Health();
    const start = await esp32Relay('start');
    await new Promise((r) => setTimeout(r, 800));
    const running = await esp32Health();
    const stop = await esp32Relay('stop');
    const after = await esp32Health();
    const ok =
      start.ok &&
      stop.ok &&
      running.json.status === 'running' &&
      after.json.status === 'idle';
    res.status(ok ? 200 : 502).json({ ok, before: before.json.status, after: after.json.status });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.get('/api/test/camera', requireAuth, async (_req, res) => {
  const configured = getCameraConfig();
  if (!configured.rtspUrl) {
    res.status(503).json({ ok: false, error: 'Set RTSP_URL in gateway/.env' });
    return;
  }
  const result = await verifyCameraReady();
  if (result.ok) {
    res.status(200).json({
      ok: true,
      detail: `RTSP OK · ${maskRtspUrl(result.rtspUrl)}`,
      rtspUrl: maskRtspUrl(result.rtspUrl),
    });
    return;
  }
  res.status(502).json({
    ok: false,
    error: result.error,
    detail: result.detail,
    hint: result.hint,
    tried: result.tried,
  });
});

app.post('/api/tumbler/start', requireAuth, async (req, res) => {
  if (!ESP32_BASE) {
    res.status(503).json({ error: 'ESP32_BASE not configured' });
    return;
  }
  try {
    const { status, json } = await esp32Relay('start');
    res.status(status).json({ ...json, deviceId: json.deviceId || req.body?.deviceId || ESP32_DEVICE_ID });
  } catch (err) {
    res.status(502).json({ error: 'ESP32 unreachable', detail: err.message });
  }
});

app.post('/api/tumbler/stop', requireAuth, async (req, res) => {
  if (!ESP32_BASE) {
    res.status(503).json({ error: 'ESP32_BASE not configured' });
    return;
  }
  try {
    const { status, json } = await esp32Relay('stop');
    res.status(status).json({ ...json, deviceId: json.deviceId || req.body?.deviceId || ESP32_DEVICE_ID });
  } catch (err) {
    res.status(502).json({ error: 'ESP32 unreachable', detail: err.message });
  }
});

app.post('/start', requireAuth, async (_req, res) => {
  try {
    const { status, json } = await esp32Relay('start');
    res.status(status).json(json);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/stop', requireAuth, async (_req, res) => {
  try {
    const { status, json } = await esp32Relay('stop');
    res.status(status).json(json);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/** Start live view — returns one MP4 URL for web + native. */
app.post('/api/stream/start', requireAuth, async (req, res) => {
  const configured = getCameraConfig();
  if (!getRtspUrl()) {
    res.status(503).json({
      error: 'Camera RTSP not configured',
      hint: `Set RTSP_URL in gateway/.env — ${configured.profile.setupHint}`,
    });
    return;
  }

  await pokeGo2rtcStream(5000);

  const sessionId = crypto.randomBytes(12).toString('hex');
  const token = crypto.randomBytes(16).toString('hex');
  const expires = Date.now() + STREAM_SESSION_MS;
  sessions.set(sessionId, { token, deviceId: req.body?.deviceId || ESP32_DEVICE_ID, expires });

  const publicBaseUrl = getPublicBaseUrl(req);
  const tokenQ = encodeURIComponent(token);
  const playbackUrl = `${publicBaseUrl}/api/mp4/${sessionId}/stream.mp4?token=${tokenQ}`;
  const popoutUrl = `${publicBaseUrl}/api/player/${sessionId}/view?token=${tokenQ}`;

  res.json({
    sessionId,
    playbackUrl,
    popoutUrl,
    protocol: 'mp4',
    expiresAt: new Date(expires).toISOString(),
  });
});

app.post('/api/stream/stop', requireAuth, (req, res) => {
  const sessionId = req.body?.sessionId;
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.status(204).end();
});

app.get('/api/player/:sessionId/view', (req, res) => {
  const { sessionId } = req.params;
  const token = String(req.query.token || '');
  if (!getSession(sessionId, token)) {
    res.status(401).send('Invalid or expired session');
    return;
  }
  const publicBaseUrl = getPublicBaseUrl(req);
  const mediaUrl = `${publicBaseUrl}/api/mp4/${sessionId}/stream.mp4?token=${encodeURIComponent(token)}`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(popoutPlayerHtml(mediaUrl));
});

/** Live video — ffmpeg reads go2rtc local RTSP relay, outputs fragmented MP4. */
app.get('/api/mp4/:sessionId/stream.mp4', async (req, res) => {
  const { sessionId } = req.params;
  const token = String(req.query.token || '');
  if (!getSession(sessionId, token)) {
    res.status(401).end();
    return;
  }

  await pokeGo2rtcStream(4000);
  const src = await resolvePlaybackRtspUrl();
  if (!src) {
    res.status(503).send('Camera RTSP not configured');
    return;
  }
  pipeFfmpegMp4(src, res, spawnFfmpegArgs);
});

app.get('/api/camera/snapshot.jpg', async (_req, res) => {
  if (await isGo2rtcReachable()) {
    try {
      const response = await fetch(
        `${GO2RTC_BASE}/api/frame.jpeg?src=${encodeURIComponent(GO2RTC_STREAM)}`,
        { signal: AbortSignal.timeout(20_000) }
      );
      const buf = Buffer.from(await response.arrayBuffer());
      if (response.ok && buf.length > 500) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache, max-age=2');
        res.send(buf);
        return;
      }
    } catch {
      /* ffmpeg fallback */
    }
  }

  const src = (await resolvePlaybackRtspUrl()) || getRtspUrl();
  if (!src) {
    res.status(503).send('Camera RTSP not configured');
    return;
  }
  pipeFfmpegJpeg(src, res, spawnFfmpegArgs);
});

app.options('/api/mp4/:sessionId/stream.mp4', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.status(204).end();
});

setInterval(() => {
  const now = Date.now();
  for (const [id, row] of sessions) {
    if (row.expires < now) {
      sessions.delete(id);
    }
  }
}, 60_000);

const server = http.createServer(app);

export async function bootGateway() {
  await logGo2rtcStreamConfig();
  await verifyCameraStream();

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Gateway API http://0.0.0.0:${PORT}`);
      console.log(`PUBLIC_BASE_URL: ${CONFIGURED_PUBLIC_BASE_URL || '(set in .env)'}`);
      console.log(`ESP32: ${ESP32_BASE || '(not set)'}${ESP32_RELAY_INVERT ? ' (relay invert ON)' : ''}`);
      console.log('Video: RTSP → go2rtc → MP4 (POST /api/stream/start)');
      resolve();
    });
  });
}

const __serverPath = fileURLToPath(import.meta.url);
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__serverPath);

if (isDirectRun) {
  console.warn('Prefer: npm run start');
  bootGateway();
}
