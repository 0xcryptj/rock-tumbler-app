/**
 * Tumbler home gateway
 *
 * Video: camera RTSP → go2rtc → MSE (web) / HLS (native) / MP4 fallback
 * Relay: ESP32 proxy
 */

import 'dotenv/config';
import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import fs from 'node:fs';
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
  getNetworkConfig,
  getTailscaleStatus,
  resolvePublicBaseUrl,
  runTailscaleStartupCheck,
  shouldRequireApiKey,
} from './lib/network.mjs';
import { registerHlsRoutes } from './lib/hls-proxy.mjs';
import { attachMseProxy } from './lib/mse-proxy.mjs';
import { hlsPlayerHtml, livePlayerHtml } from './lib/mse-player-html.mjs';
import { buildStreamUrls, resolveStreamProtocol } from './lib/stream-protocol.mjs';
import {
  getFfmpegBin,
  getGo2rtcRelayRtspUrl,
  pipeFfmpegJpeg,
  pipeFfmpegMp4,
} from './lib/video-stream.mjs';

const PORT = Number(process.env.PORT || 8080);
const CONFIGURED_PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const API_KEY = process.env.API_KEY || '';
const REQUIRE_API_KEY = shouldRequireApiKey();
const GO2RTC_BASE = (process.env.GO2RTC_BASE || 'http://127.0.0.1:1984').replace(/\/$/, '');
const GO2RTC_STREAM = process.env.GO2RTC_STREAM || 'tumbler_cam';
const FFMPEG_BIN = getFfmpegBin();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_WEB_DIST = path.resolve(__dirname, '..', 'tumbler-remote', 'dist');
const WEB_DIST_DIR = process.env.WEB_DIST_DIR
  ? path.resolve(process.env.WEB_DIST_DIR)
  : DEFAULT_WEB_DIST;
const WEB_DIST_INDEX = path.join(WEB_DIST_DIR, 'index.html');
const SERVE_WEB = fs.existsSync(WEB_DIST_INDEX);
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

// Force HTTPS when behind a TLS-terminating reverse proxy (Cloudflare Tunnel,
// Tailscale Funnel, Caddy/nginx, etc.). Without this, a browser that opened
// the URL via http:// shows a "Not secure" badge even though the public URL
// supports TLS.
//
// Detecting the client-side scheme is proxy-specific:
//   - Cloudflare: `CF-Visitor: {"scheme":"https"}` (most reliable)
//   - Generic L7: `X-Forwarded-Proto: https`
//   - Tailscale Funnel: `X-Forwarded-Proto: https`
// We bail out on direct LAN/Tailscale loads (no `X-Forwarded-Host`).
function detectClientScheme(req) {
  const cfVisitor = req.get('cf-visitor');
  if (cfVisitor) {
    try {
      const v = JSON.parse(cfVisitor);
      if (v && typeof v.scheme === 'string') return v.scheme.toLowerCase();
    } catch {}
  }
  const xfp = String(req.get('x-forwarded-proto') || '').toLowerCase();
  if (xfp) return xfp.split(',')[0].trim();
  return null;
}

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const xfh = req.get('x-forwarded-host') || req.get('cf-connecting-ip');
  if (!xfh) return next();
  const scheme = detectClientScheme(req);
  if (scheme && scheme !== 'http') return next();
  const hostHeader = req.get('x-forwarded-host') || req.get('host');
  if (!hostHeader) return next();
  const host = String(hostHeader).split(',')[0].trim();
  if (!host) return next();
  res.redirect(301, `https://${host}${req.originalUrl}`);
});

app.use((req, res, next) => {
  const scheme = detectClientScheme(req);
  if (scheme === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  next();
});

// Serve the Expo web build (expo-router static export) when present so the
// gateway and the browser UI share the same origin — required for Cloudflare
// Tunnel / Tailscale Funnel deployments.
if (SERVE_WEB) {
  app.use(
    express.static(WEB_DIST_DIR, {
      extensions: ['html'],
      index: 'index.html',
      setHeaders: (res, filePath) => {
        // Normalize Windows path separators so the asset-cache rules fire.
        const p = filePath.replace(/\\/g, '/');
        if (/\.html?$/i.test(p)) {
          res.setHeader('Cache-Control', 'no-cache');
          // Defense in depth: tell the browser to auto-upgrade any http://
          // sub-resource request (image, script, fetch) to https://. Stops
          // "Not secure" mixed-content warnings when stored client state or
          // legacy bundles still reference an http:// LAN URL.
          res.setHeader('Content-Security-Policy', 'upgrade-insecure-requests');
        } else if (/\/_expo\//.test(p) || /\/assets\//.test(p) || /\/icons\//.test(p)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (/\/sw\.js$/i.test(p) || /\/pwa-register\.js$/i.test(p) || /\/workbox-[a-f0-9]+\.js$/i.test(p)) {
          // Service worker plumbing must never be cached at the edge or in
          // the browser — otherwise the kill-switch update never lands.
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        }
      },
    })
  );
}

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
  return resolvePublicBaseUrl(req, CONFIGURED_PUBLIC_BASE_URL);
}

function requireAuth(req, res, next) {
  const mustAuth = REQUIRE_API_KEY || Boolean(API_KEY);
  if (!mustAuth) {
    next();
    return;
  }
  if (REQUIRE_API_KEY && !API_KEY) {
    res.status(503).json({
      error: 'Server misconfigured',
      detail: 'API_KEY is required for remote access. Set API_KEY in gateway/.env',
    });
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
    console.log('Camera OK — Play uses go2rtc MSE (web) / HLS (native)');
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

// Fallback landing page when the Expo web build is not present
// (e.g. fresh checkout that hasn't run `npm run build:web`). When dist/ exists,
// express.static above serves index.html and this handler is never reached.
if (!SERVE_WEB) {
  app.get('/', (req, res) => {
    const base = getPublicBaseUrl(req);
    const host = base.replace(/^https?:\/\//, '').replace(/:8080$/, '');
    const expoWeb = `http://${host}:8081`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Tumbler Gateway</title></head><body>
<h1>Tumbler gateway API</h1>
<p>API: <code>${base}</code> · App UI (dev): <a href="${expoWeb}">${expoWeb}</a></p>
<p>To serve the production web UI from this gateway, run <code>npm run build:web</code> at the repo root.</p>
<p>Video path: RTSP (gateway/.env) → go2rtc → MSE / HLS for the app.</p>
</body></html>`);
  });
}

app.get('/health', (req, res) => {
  const publicBaseUrl = getPublicBaseUrl(req);
  const host = publicBaseUrl.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
  const { cameraType, cameraLabel, profile } = getCameraConfig();
  const net = getNetworkConfig();
  const tailscale = getTailscaleStatus();
  // When the gateway serves the built Expo web bundle, the UI lives at the
  // same origin as the API. In dev mode (no dist/) the Expo Metro server is
  // on :8081 next to the gateway.
  const expoWebUrl = SERVE_WEB ? publicBaseUrl : `http://${host}:8081`;
  res.json({
    ok: true,
    service: 'tumbler-unified',
    video: 'rtsp→go2rtc→mse/hls',
    go2rtc: GO2RTC_BASE,
    stream: GO2RTC_STREAM,
    cameraType,
    cameraLabel,
    cameraDocs: profile.docs,
    rtspConfigured: Boolean(getRtspUrl()),
    rtspUrl: maskRtspUrl(getRtspUrl()) || null,
    esp32: ESP32_BASE || null,
    publicBaseUrl,
    localApiUrl: net.localBase || null,
    remoteApiUrl: net.remoteBase || null,
    tailscale: {
      active: tailscale.available,
      ip: tailscale.ip,
      hostname: tailscale.hostname,
    },
    authRequired: REQUIRE_API_KEY || Boolean(API_KEY),
    webUiServedByGateway: SERVE_WEB,
    expoWebUrl,
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

  void pokeGo2rtcStream(2000);

  const sessionId = crypto.randomBytes(12).toString('hex');
  const token = crypto.randomBytes(16).toString('hex');
  const expires = Date.now() + STREAM_SESSION_MS;
  sessions.set(sessionId, { token, deviceId: req.body?.deviceId || ESP32_DEVICE_ID, expires });

  const publicBaseUrl = getPublicBaseUrl(req);
  const tokenQ = encodeURIComponent(token);
  const protocol = resolveStreamProtocol(req.body, req.headers['user-agent'] || '');
  const urls = buildStreamUrls({ publicBaseUrl, sessionId, tokenQ, protocol });

  res.json({
    sessionId,
    ...urls,
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

app.get('/api/player/:sessionId/mse', (req, res) => {
  const { sessionId } = req.params;
  const token = String(req.query.token || '');
  if (!getSession(sessionId, token)) {
    res.status(401).send('Invalid or expired session');
    return;
  }
  const publicBaseUrl = getPublicBaseUrl(req);
  const wsUrl = `${publicBaseUrl.replace(/^http/i, 'ws')}/api/mse/${sessionId}/ws?token=${encodeURIComponent(token)}`;
  const hlsUrl = `${publicBaseUrl}/api/hls/${sessionId}/stream.m3u8?token=${encodeURIComponent(token)}&mp4`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(livePlayerHtml(wsUrl, hlsUrl));
});

app.get('/api/player/:sessionId/live', (req, res) => {
  const { sessionId } = req.params;
  const token = String(req.query.token || '');
  if (!getSession(sessionId, token)) {
    res.status(401).send('Invalid or expired session');
    return;
  }
  const publicBaseUrl = getPublicBaseUrl(req);
  const wsUrl = `${publicBaseUrl.replace(/^http/i, 'ws')}/api/mse/${sessionId}/ws?token=${encodeURIComponent(token)}`;
  const hlsUrl = `${publicBaseUrl}/api/hls/${sessionId}/stream.m3u8?token=${encodeURIComponent(token)}&mp4`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(livePlayerHtml(wsUrl, hlsUrl));
});

app.get('/api/player/:sessionId/hls', (req, res) => {
  const { sessionId } = req.params;
  const token = String(req.query.token || '');
  if (!getSession(sessionId, token)) {
    res.status(401).send('Invalid or expired session');
    return;
  }
  const publicBaseUrl = getPublicBaseUrl(req);
  const playlistUrl = `${publicBaseUrl}/api/hls/${sessionId}/stream.m3u8?token=${encodeURIComponent(token)}&mp4`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(hlsPlayerHtml(playlistUrl));
});

registerHlsRoutes(app, {
  getSession,
  getPublicBaseUrl,
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

app.get('/api/camera/snapshot.jpg', requireAuth, async (_req, res) => {
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

// SPA fallback — any non-API GET that doesn't match a static file returns
// index.html so expo-router can handle client-side routes (/dashboard, /pin).
if (SERVE_WEB) {
  const NON_SPA_PREFIXES = ['/api/', '/health', '/start', '/stop', '/_expo/', '/assets/', '/icons/'];
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET') return next();
    if (NON_SPA_PREFIXES.some((p) => req.path === p.replace(/\/$/, '') || req.path.startsWith(p))) {
      return next();
    }
    if (/\.[a-z0-9]+$/i.test(req.path)) {
      // Static file express.static couldn't find — let it 404.
      return next();
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Security-Policy', 'upgrade-insecure-requests');
    res.sendFile(WEB_DIST_INDEX);
  });
}

setInterval(() => {
  const now = Date.now();
  for (const [id, row] of sessions) {
    if (row.expires < now) {
      sessions.delete(id);
    }
  }
}, 60_000);

const server = http.createServer(app);

attachMseProxy(server, {
  getSession,
  go2rtcBase: GO2RTC_BASE,
  streamName: GO2RTC_STREAM,
  pokeGo2rtcStream,
});

export async function bootGateway() {
  const startup = await runTailscaleStartupCheck();
  for (const line of startup.lines) {
    if (line.startsWith('SECURITY:') && line.includes('not set')) {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
  if (startup.requireApiKey && !API_KEY) {
    console.warn('Control routes will return 503 until API_KEY is configured.');
  }

  await logGo2rtcStreamConfig();
  await verifyCameraStream();

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Gateway API http://0.0.0.0:${PORT}`);
      const net = getNetworkConfig();
      if (net.localBase) console.log(`LAN clients:      ${net.localBase}`);
      if (net.remoteBase) console.log(`Tailscale clients: ${net.remoteBase}`);
      console.log(`PUBLIC_BASE_URL: ${CONFIGURED_PUBLIC_BASE_URL || '(auto from client Host)'}`);
      console.log(`ESP32: ${ESP32_BASE || '(not set)'}${ESP32_RELAY_INVERT ? ' (relay invert ON)' : ''}`);
      console.log('Video: RTSP → go2rtc → MSE/HLS (POST /api/stream/start)');
      if (SERVE_WEB) {
        console.log(`Web UI: serving Expo build from ${WEB_DIST_DIR}`);
      } else {
        console.log(`Web UI: not bundled (run \`npm run build:web\` to serve at ${WEB_DIST_DIR})`);
      }
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
