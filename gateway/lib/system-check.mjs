/**
 * Unified health checks — used by /api/test/all and CLI diagnostics.
 */
import path from 'node:path';
import {
  discoverWorkingStream,
  fetchGo2rtcLogHint,
  getCameraConfig,
  maskRtspUrl,
  probeRtspUrl,
  GATEWAY_ROOT,
  getCameraProfile,
} from './camera.mjs';
import {
  esp32Health,
  esp32Relay,
  formatEsp32Health,
  getEsp32Config,
  relayPinMismatch,
} from './esp32.mjs';
import { waitForGo2rtc } from './go2rtc-process.mjs';

const FFMPEG_BIN = path.resolve(GATEWAY_ROOT, process.env.FFMPEG_BIN || 'bin/ffmpeg.exe');
const GO2RTC_BASE = (process.env.GO2RTC_BASE || 'http://127.0.0.1:1984').replace(/\/$/, '');
const GO2RTC_STREAM = process.env.GO2RTC_STREAM || 'tumbler_cam';

function check(id, label, ok, detail, extra = {}) {
  return { id, label, ok, detail, ...extra };
}

async function checkGo2rtc() {
  const label = 'go2rtc';
  try {
    const api = await fetch(`${GO2RTC_BASE}/api`, { signal: AbortSignal.timeout(5000) });
    if (!api.ok) {
      return check(label, label, false, `HTTP ${api.status}`);
    }
    const streams = await (
      await fetch(`${GO2RTC_BASE}/api/streams`, { signal: AbortSignal.timeout(5000) })
    ).json();
    const producers = streams[GO2RTC_STREAM]?.producers;
    if (!producers?.length) {
      return check(label, label, false, `No stream "${GO2RTC_STREAM}" in go2rtc.yaml`);
    }
    const url = String(producers[0].url || '').replace(/:([^:@/]+)@/, ':***@');
    const frame = await fetch(
      `${GO2RTC_BASE}/api/frame.jpeg?src=${encodeURIComponent(GO2RTC_STREAM)}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    const buf = Buffer.from(await frame.arrayBuffer());
    if (!frame.ok) {
      return check(label, label, false, `Stream configured but no frame (${frame.status})`);
    }
    if (buf.length <= 500) {
      const logHint = await fetchGo2rtcLogHint(GO2RTC_BASE);
      const detail = logHint
        ? `${logHint.message} — ${logHint.hint}`
        : `Empty frame (${buf.length} bytes) — ${getCameraProfile().wakeHint}`;
      return check(label, label, false, detail);
    }
    return check(label, label, true, `${url} · frame ${buf.length} bytes`);
  } catch (err) {
    return check(label, label, false, err.message);
  }
}

async function checkEsp32() {
  const label = 'ESP32 relay';
  const { base, expectedRelayPin } = getEsp32Config();
  if (!base) {
    return check('esp32', label, false, 'ESP32_BASE not set in gateway/.env');
  }
  try {
    const { ok, json } = await esp32Health();
    if (!ok || json.ok !== true) {
      return check('esp32', label, false, 'No /health from ESP32');
    }
    const pinWarn = relayPinMismatch(json, expectedRelayPin)
      ? `GPIO${json.relayPin} ≠ expected ${expectedRelayPin} — reflash firmware`
      : null;
    if (pinWarn) {
      return check('esp32', label, false, pinWarn, { warning: pinWarn });
    }
    return check('esp32', label, true, formatEsp32Health(json), {
      relayStatus: json.status,
      relayPin: json.relayPin,
      ip: json.ip,
    });
  } catch (err) {
    return check('esp32', label, false, err.message);
  }
}

async function checkEsp32RelayCycle() {
  const label = 'ESP32 start/stop';
  try {
    const start = await esp32Relay('start');
    await new Promise((r) => setTimeout(r, 400));
    const run = await esp32Health();
    const stop = await esp32Relay('stop');
    const end = await esp32Health();
    if (!start.ok || start.json.status !== 'running') {
      return check('esp32-cycle', label, false, `start failed: ${JSON.stringify(start.json)}`);
    }
    if (run.json.status !== 'running') {
      return check('esp32-cycle', label, false, 'Still idle after start');
    }
    if (!stop.ok || end.json.status !== 'idle') {
      return check('esp32-cycle', label, false, `stop failed: ${JSON.stringify(end.json)}`);
    }
    return check('esp32-cycle', label, true, 'idle → running → idle');
  } catch (err) {
    return check('esp32-cycle', label, false, err.message);
  }
}

async function checkCamera({ go2rtcOk = false, go2rtcDetail = '' } = {}) {
  const profile = getCameraProfile();
  const label = `${profile.label} camera`;
  if (go2rtcOk) {
    return check('camera', label, true, go2rtcDetail || 'Live via go2rtc');
  }
  const { rtspUrl } = getCameraConfig();
  if (!rtspUrl) {
    return check('camera', label, false, 'RTSP_URL not set in gateway/.env');
  }
  let probe = await probeRtspUrl(rtspUrl, FFMPEG_BIN, 12_000);
  if (probe.ok) {
    return check('camera', label, true, maskRtspUrl(rtspUrl));
  }
  const is404 = /404|Stream Not Found/i.test(probe.error || '');
  if (is404) {
    const discovered = await discoverWorkingStream(FFMPEG_BIN);
    if (discovered.ok) {
      return check('camera', label, true, `Found ${discovered.streamPath}`, { tried: discovered.tried });
    }
    return check('camera', label, false, 'RTSP 404 on all paths', { tried: discovered.tried });
  }
  return check('camera', label, false, probe.error || 'RTSP probe failed');
}

async function checkGatewayReachable(candidates) {
  const label = 'Gateway API';
  for (const base of candidates) {
    try {
      const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      if (response.ok && data.ok) {
        return check('gateway', label, true, `${base} · esp32=${data.esp32 || 'not set'}`, { base });
      }
    } catch {
      /* try next */
    }
  }
  return check(
    'gateway',
    label,
    false,
    'Not running — from repo root run: npm run start (keep that window open)'
  );
}

/**
 * @param {{ includeCamera?: boolean; publicBaseUrl?: string; assumeGatewayUp?: boolean }} [opts]
 */
export async function runSystemChecks(opts = {}) {
  const includeCamera = opts.includeCamera !== false;
  const publicBaseUrl = (opts.publicBaseUrl || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const port = process.env.PORT || 8080;
  const candidates = [
    publicBaseUrl,
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ]
    .filter(Boolean)
    .filter((u, i, a) => a.indexOf(u) === i);

  const checks = [];

  if (opts.assumeGatewayUp) {
    checks.push(
      check(
        'gateway',
        'Gateway API',
        true,
        publicBaseUrl
          ? `Listening · set app API URL to ${publicBaseUrl}`
          : `Listening on port ${port}`
      )
    );
  } else {
    checks.push(await checkGatewayReachable(candidates));
    if (!checks[0].ok) {
      return { ok: false, checks, publicBaseUrl, go2rtc: GO2RTC_BASE, esp32: getEsp32Config().base || null };
    }
  }

  let go2rtcRow = null;
  if (!(await waitForGo2rtc(GO2RTC_BASE, 3000))) {
    go2rtcRow = check('go2rtc', 'go2rtc', false, 'Not reachable — run npm run start (unified backend)');
    checks.push(go2rtcRow);
  } else {
    go2rtcRow = await checkGo2rtc();
    checks.push(go2rtcRow);
  }

  checks.push(await checkEsp32());
  const esp32Ok = checks.find((c) => c.id === 'esp32')?.ok;
  if (esp32Ok) {
    checks.push(await checkEsp32RelayCycle());
  }

  if (includeCamera) {
    checks.push(
      await checkCamera({ go2rtcOk: go2rtcRow?.ok === true, go2rtcDetail: go2rtcRow?.detail })
    );
  }

  const profile = getCameraProfile();
  const ok = checks.every((c) => c.ok);
  return {
    ok,
    checks,
    publicBaseUrl,
    go2rtc: GO2RTC_BASE,
    esp32: getEsp32Config().base || null,
    cameraType: profile.id,
    cameraLabel: profile.label,
  };
}
