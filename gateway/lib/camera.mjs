/**
 * Multi-vendor RTSP camera config — gateway + scripts.
 * Expo app never sees RTSP URLs; set CAMERA_TYPE + RTSP_* in gateway/.env only.
 * @see docs/CAMERA-PROFILES.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GATEWAY_ROOT = path.join(__dirname, '..');
export const ENV_FILE = path.join(GATEWAY_ROOT, '.env');

/** @typedef {'eufy'|'tapo'|'reolink'|'wyze'|'generic'} CameraTypeId */

/**
 * Vendor presets — stream paths, go2rtc defaults, setup hints.
 * @type {Record<CameraTypeId, {
 *   id: CameraTypeId;
 *   label: string;
 *   streamPaths: string[];
 *   defaultPath: string;
 *   portProbeOrder: boolean[];
 *   defaultUseFfmpeg: boolean;
 *   defaultAudio: string;
 *   docs: string;
 *   setupHint: string;
 *   authHint: string;
 *   wakeHint: string;
 *   digestNote?: string;
 * }>}
 */
export const CAMERA_PROFILES = {
  tapo: {
    id: 'tapo',
    label: 'TP-Link Tapo',
    streamPaths: ['stream1', 'stream2'],
    defaultPath: 'stream1',
    portProbeOrder: [true, false],
    defaultUseFfmpeg: false,
    defaultAudio: 'none',
    docs: 'docs/TAPO-RTSP.md',
    setupHint:
      'Tapo app → camera → Settings (gear) → Advanced Settings → RTSP → On, create camera account (not main TP-Link login)',
    authHint: 'Use the Tapo camera account in RTSP_URL; port 554 is typical (stream1 = HD, stream2 = SD)',
    wakeHint: 'Open live view in the Tapo app for a few seconds if the stream is idle',
  },
  eufy: {
    id: 'eufy',
    label: 'Eufy Security',
    streamPaths: ['live0', 'live1', 'live2'],
    defaultPath: 'live0',
    portProbeOrder: [false, true],
    defaultUseFfmpeg: false,
    defaultAudio: 'none',
    docs: 'docs/EUFY-C220-RTSP.md',
    setupHint: 'Eufy app → Storage → RTSP/NAS → enable → Setup Guide → Copy link',
    authHint:
      'Digest auth: keep RTSP_USE_FFMPEG=false (go2rtc native). ffmpeg often 401 on Eufy dual digest headers',
    wakeHint: 'Open live view in the Eufy app for 10–30s (or wave during NAS test)',
    digestNote:
      'If go2rtc fails, try RTSP Security → Basic in the Eufy app, then RTSP_USE_FFMPEG=true',
  },
  reolink: {
    id: 'reolink',
    label: 'Reolink',
    streamPaths: ['h264Preview_01_main', 'h264Preview_01_sub'],
    defaultPath: 'h264Preview_01_main',
    portProbeOrder: [true, false],
    defaultUseFfmpeg: true,
    defaultAudio: 'aac',
    docs: 'docs/CAMERA-PROFILES.md#reolink',
    setupHint: 'Reolink app → enable RTSP; use main/sub stream paths from device settings',
    authHint: 'Default RTSP port 554; credentials from camera user (not cloud-only login)',
    wakeHint: 'Open live preview in the Reolink app if RTSP returns 404',
  },
  wyze: {
    id: 'wyze',
    label: 'Wyze (RTSP firmware)',
    streamPaths: ['live', 'substream'],
    defaultPath: 'live',
    portProbeOrder: [true, false],
    defaultUseFfmpeg: true,
    defaultAudio: 'none',
    docs: 'docs/CAMERA-PROFILES.md#wyze',
    setupHint: 'Wyze with official RTSP firmware / plugin — enable RTSP in app',
    authHint: 'Use RTSP credentials from Wyze RTSP setup (varies by model)',
    wakeHint: 'Wake the camera in the Wyze app before Play',
  },
  generic: {
    id: 'generic',
    label: 'Generic RTSP',
    streamPaths: ['stream1', 'stream', 'live0', 'live', 'h264', 'main'],
    defaultPath: 'stream1',
    portProbeOrder: [true, false],
    defaultUseFfmpeg: true,
    defaultAudio: 'aac',
    docs: 'docs/CAMERA-PROFILES.md',
    setupHint: 'Set RTSP_URL from your camera app or VLC “Open Network Stream” test URL',
    authHint: 'Test the same rtsp:// URL in VLC on the gateway PC first',
    wakeHint: 'Open the camera live view in its app if RTSP connects but has no video',
  },
};

/** @deprecated use CAMERA_PROFILES.eufy.streamPaths */
export const EUFY_STREAM_PATHS = CAMERA_PROFILES.eufy.streamPaths;

export function parseEnvFile(filePath = ENV_FILE) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const vars = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim().replace(/^\uFEFF/, '');
    vars[key] = trimmed.slice(idx + 1).trim();
  }
  return vars;
}

export function stripRtspHash(url) {
  return String(url).replace(/#.*$/, '').trim();
}

/** Infer vendor from stream path when CAMERA_TYPE is auto or unset. */
export function inferCameraTypeFromPath(pathPart) {
  const p = String(pathPart || '').replace(/^\//, '').toLowerCase();
  if (/^stream[12]?$/.test(p) || p === 'stream') return 'tapo';
  if (/^live[012]?$/.test(p) || p === 'live') return 'eufy';
  if (p.includes('h264preview')) return 'reolink';
  return 'generic';
}

/** Resolve profile from CAMERA_TYPE env (eufy | tapo | reolink | wyze | generic | auto). */
export function getCameraProfile(vars = parseEnvFile()) {
  const raw = (vars.CAMERA_TYPE || vars.CAMERA_VENDOR || 'auto').toLowerCase().trim();
  if (raw === 'auto' || !raw) {
    const fromPath = inferCameraTypeFromPath(vars.RTSP_PATH);
    if (vars.RTSP_URL) {
      try {
        const u = new URL(stripRtspHash(vars.RTSP_URL));
        const inferred = inferCameraTypeFromPath(u.pathname);
        if (inferred !== 'generic' || !vars.RTSP_PATH) {
          return CAMERA_PROFILES[inferred];
        }
      } catch {
        /* use path only */
      }
    }
    return CAMERA_PROFILES[fromPath] || CAMERA_PROFILES.generic;
  }
  return CAMERA_PROFILES[raw] || CAMERA_PROFILES.generic;
}

export function buildRtspUrl(vars, { streamPath, includePort } = {}) {
  const profile = getCameraProfile(vars);
  const pathPart = streamPath || vars.RTSP_PATH || profile.defaultPath;
  if (vars.RTSP_URL) {
    const base = stripRtspHash(vars.RTSP_URL);
    if (streamPath) {
      const hostPart = base.replace(/\/[^/]*$/, '');
      return `${hostPart}/${pathPart}`;
    }
    if (includePort === true) {
      return base.replace(/^rtsp:\/\/([^@]+@)([^/:]+)(\/.*)$/i, 'rtsp://$1$2:554$3');
    }
    if (includePort === false) {
      return base.replace(/^rtsp:\/\/([^@]+@)([^/:]+):554(\/.*)$/i, 'rtsp://$1$2$3');
    }
    return base;
  }
  const ip = vars.CAMERA_IP || '';
  const user = vars.RTSP_USER || '';
  const pass = vars.RTSP_PASS || '';
  if (!ip) return '';
  const host = includePort === true ? `${ip}:554` : ip;
  if (user && pass) {
    return `rtsp://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}/${pathPart}`;
  }
  return `rtsp://${host}/${pathPart}`;
}

export function getCameraConfig(options = {}) {
  const vars = parseEnvFile();
  const profile = getCameraProfile(vars);
  const streamPath = options.streamPath;
  const rtspUrl = buildRtspUrl(vars, { streamPath, includePort: false });
  const useFfmpegEnv = vars.RTSP_USE_FFMPEG;
  const useFfmpegInGo2rtc =
    useFfmpegEnv === undefined || useFfmpegEnv === ''
      ? profile.defaultUseFfmpeg
      : useFfmpegEnv !== 'false';
  return {
    vars,
    profile,
    cameraType: profile.id,
    cameraLabel: profile.label,
    rtspUrl,
    streamPath: streamPath || vars.RTSP_PATH || profile.defaultPath,
    cameraIp: vars.CAMERA_IP || '',
    useFfmpegInGo2rtc,
    go2rtcStream: vars.GO2RTC_STREAM || 'tumbler_cam',
    go2rtcAudio: vars.GO2RTC_AUDIO || profile.defaultAudio,
  };
}

export function maskRtspUrl(url) {
  if (/@/.test(url)) {
    return url.replace(/:([^:@/]+)@/, ':***@');
  }
  return url;
}

/** Parse rtsp://user:pass@host/path from any vendor setup UI or VLC. */
export function parseRtspUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Paste a full rtsp:// URL from your camera app or VLC' };
  }
  let url = trimmed;
  if (!/^rtsp:\/\//i.test(url)) {
    if (/^[\w]+:\/\//i.test(url)) {
      return { ok: false, error: 'Expected an rtsp:// URL' };
    }
    url = `rtsp://${url}`;
  }
  try {
    const u = new URL(url);
    if (u.protocol !== 'rtsp:') {
      return { ok: false, error: 'URL must use rtsp://' };
    }
    const user = decodeURIComponent(u.username || '');
    const pass = decodeURIComponent(u.password || '');
    const host = u.hostname;
    const pathPart = u.pathname.replace(/^\//, '') || getCameraProfile().defaultPath;
    if (!host) {
      return { ok: false, error: 'Missing camera IP/hostname in URL' };
    }
    if (!user || !pass) {
      return {
        ok: false,
        error: 'URL must include username and password (create a camera RTSP account in the app)',
      };
    }
    const port = u.port ? `:${u.port}` : '';
    const rtspUrl = `rtsp://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}${port}/${pathPart}`;
    const cameraType = inferCameraTypeFromPath(pathPart);
    const profile = CAMERA_PROFILES[cameraType];
    return {
      ok: true,
      cameraType,
      profile,
      cameraIp: host,
      rtspUser: user,
      rtspPass: pass,
      rtspPath: pathPart,
      rtspUrl,
    };
  } catch (err) {
    return { ok: false, error: `Invalid RTSP URL: ${err.message}` };
  }
}

/** @deprecated alias */
export const parseEufySetupGuideUrl = parseRtspUrl;

export async function fetchGo2rtcLogHint(
  base = process.env.GO2RTC_BASE || 'http://127.0.0.1:1984',
  profile = getCameraProfile()
) {
  const api = String(base).replace(/\/$/, '');
  try {
    const response = await fetch(`${api}/api/log`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    const lines = text.trim().split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        const row = JSON.parse(lines[i]);
        const err = String(row.error || row.message || '');
        if (/wrong user\/pass/i.test(err)) {
          return {
            code: 'wrong_user_pass',
            message: err,
            hint: `${profile.label}: wrong RTSP user/pass in gateway/.env — ${profile.setupHint} · npm run apply:rtsp -- "rtsp://..."`,
          };
        }
        if (/404|Stream Not Found|not contain any stream/i.test(err)) {
          return {
            code: 'stream_not_found',
            message: err,
            hint: profile.wakeHint,
          };
        }
      } catch {
        /* skip non-json */
      }
    }
  } catch {
    /* go2rtc offline */
  }
  return null;
}

export function probeRtspUrl(rtspUrl, ffmpegBin, timeoutMs = 12_000) {
  return new Promise((resolve) => {
    if (!rtspUrl) {
      resolve({ ok: false, error: 'RTSP URL not configured' });
      return;
    }
    let child;
    try {
      child = spawn(
        ffmpegBin,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-rtsp_transport',
          'tcp',
          '-i',
          rtspUrl,
          '-t',
          '2',
          '-f',
          'null',
          '-',
        ],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (err) {
      resolve({ ok: false, error: `ffmpeg failed to start: ${err.message}` });
      return;
    }
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, error: 'RTSP probe timed out' });
    }, timeoutMs);
    child.stderr.on('data', (c) => {
      stderr += c.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ ok: false, error: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ ok: true, rtspUrl });
      } else {
        resolve({ ok: false, error: stderr.trim() || `ffmpeg exit ${code}` });
      }
    });
  });
}

/** Try profile stream paths (and port variants) until one works. */
export async function discoverWorkingStream(ffmpegBin, options = {}) {
  const vars = parseEnvFile();
  const profile = options.profile || getCameraProfile(vars);
  const tried = [];
  for (const streamPath of profile.streamPaths) {
    for (const includePort of profile.portProbeOrder) {
      const url = buildRtspUrl(vars, { streamPath, includePort });
      const result = await probeRtspUrl(url, ffmpegBin, 10_000);
      const label = includePort ? `${streamPath}:554` : streamPath;
      tried.push({
        streamPath: label,
        url: maskRtspUrl(url),
        ok: result.ok,
        error: result.error,
      });
      if (result.ok) {
        return {
          ok: true,
          streamPath,
          rtspUrl: url,
          usePort554: includePort,
          profile,
          tried,
        };
      }
    }
  }
  return { ok: false, profile, tried };
}

export function applyRtspDefaultsForProfile(profile) {
  return {
    CAMERA_TYPE: profile.id,
    RTSP_USE_FFMPEG: profile.defaultUseFfmpeg ? 'true' : 'false',
    GO2RTC_AUDIO: profile.defaultAudio,
  };
}
