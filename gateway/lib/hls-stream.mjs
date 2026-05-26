/**
 * On-demand HLS pipeline.
 *
 * Reads from the local go2rtc RTSP relay and produces an Apple-spec HLS
 * stream (fMP4, 2 s segments, rolling 6-segment window). Native iOS Safari
 * and the WebKit in-app browsers play this cleanly.
 *
 * Why this exists instead of proxying go2rtc's /api/stream.m3u8 directly:
 * go2rtc's HLS endpoint exposes a low-latency 2-segment window with a
 * sub-second TARGETDURATION, #EXT-X-MEDIA-SEQUENCE pinned to 0, and a
 * session id in the segment URLs that rotates every playlist refresh. On
 * native iOS HLS this triggers MEDIA_ERR_DECODE (HTMLMediaElement error
 * code 3) — the player loads init.mp4 + segments from one go2rtc session,
 * refreshes the playlist (proxy creates a new session), and the next
 * segment download mismatches the cached init.mp4 codec config.
 *
 * The pipeline is process-singleton (one ffmpeg per gateway, one shared
 * disk window) and is spawned on the first /stream.m3u8 fetch, kept alive
 * while clients keep poking it, and torn down after IDLE_KILL_MS.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFfmpegBin, getGo2rtcRelayRtspUrl } from './video-stream.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HLS_DIR = path.resolve(__dirname, '..', 'tmp', 'hls');

const PLAYLIST_FILE = 'stream.m3u8';
const INIT_FILE = 'init.mp4';
const SEGMENT_RE = /^segment_\d{5,}\.m4s$/;

const IDLE_KILL_MS = 30_000;
const STARTUP_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 150;
const RESTART_BACKOFF_MS = 1_000;

/** @type {import('node:child_process').ChildProcess | null} */
let child = null;
/** @type {Promise<void> | null} */
let startupPromise = null;
let lastTouchAt = 0;
/** @type {NodeJS.Timeout | null} */
let idleTimer = null;
let exitedAt = 0;

function ensureDir() {
  fs.mkdirSync(HLS_DIR, { recursive: true });
}

function purgeDir() {
  try {
    if (!fs.existsSync(HLS_DIR)) return;
    for (const entry of fs.readdirSync(HLS_DIR)) {
      try {
        fs.unlinkSync(path.join(HLS_DIR, entry));
      } catch {
        /* segment may still be open by ffmpeg on Windows — ignore */
      }
    }
  } catch {
    /* swallow */
  }
}

function spawnFfmpegHls() {
  const ffmpegBin = getFfmpegBin();
  const rtspUrl = getGo2rtcRelayRtspUrl();
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-fflags',
    'nobuffer',
    '-flags',
    'low_delay',
    '-rtsp_transport',
    'tcp',
    '-probesize',
    '32',
    '-analyzeduration',
    '0',
    '-i',
    rtspUrl,
    '-an',
    '-c:v',
    'copy',
    '-f',
    'hls',
    '-hls_time',
    '2',
    '-hls_list_size',
    '6',
    '-hls_flags',
    'delete_segments+independent_segments+omit_endlist',
    '-hls_segment_type',
    'fmp4',
    '-hls_fmp4_init_filename',
    INIT_FILE,
    '-hls_segment_filename',
    'segment_%05d.m4s',
    PLAYLIST_FILE,
  ];

  const proc = spawn(ffmpegBin, args, {
    cwd: HLS_DIR,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let stderrTail = '';
  proc.stderr.on('data', (chunk) => {
    const msg = chunk.toString();
    stderrTail = (stderrTail + msg).slice(-2_000);
    const line = msg.trim();
    if (line) console.warn('[hls]', line);
  });

  proc.on('exit', (code) => {
    if (child === proc) {
      child = null;
      startupPromise = null;
      exitedAt = Date.now();
    }
    if (code !== null && code !== 0) {
      console.warn(`HLS pipeline ffmpeg exited (code ${code}): ${stderrTail.trim().slice(-200)}`);
    }
  });

  return proc;
}

function waitForStartup(proc) {
  const playlistPath = path.join(HLS_DIR, PLAYLIST_FILE);
  const initPath = path.join(HLS_DIR, INIT_FILE);
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (child !== proc) {
        reject(new Error('HLS pipeline replaced during startup'));
        return;
      }
      if (!child || child.killed || child.exitCode !== null) {
        reject(new Error('HLS pipeline exited before producing segments'));
        return;
      }
      try {
        if (fs.existsSync(playlistPath) && fs.existsSync(initPath)) {
          const segments = fs.readdirSync(HLS_DIR).filter((f) => SEGMENT_RE.test(f));
          if (segments.length >= 1) {
            const text = fs.readFileSync(playlistPath, 'utf8');
            if (text.includes('#EXTINF')) {
              resolve();
              return;
            }
          }
        }
      } catch {
        /* not ready yet */
      }
      if (Date.now() > deadline) {
        reject(new Error('HLS pipeline did not start in time (check RTSP_URL)'));
        return;
      }
      setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();
  });
}

function ensureIdleTimer() {
  if (idleTimer) return;
  idleTimer = setInterval(() => {
    if (!child) {
      clearInterval(idleTimer);
      idleTimer = null;
      return;
    }
    if (Date.now() - lastTouchAt > IDLE_KILL_MS) {
      stopHlsPipeline();
    }
  }, 5_000);
  idleTimer.unref?.();
}

export async function ensureHlsPipeline() {
  lastTouchAt = Date.now();
  if (child && !child.killed && child.exitCode === null) {
    if (startupPromise) {
      await startupPromise;
    }
    return;
  }
  if (exitedAt && Date.now() - exitedAt < RESTART_BACKOFF_MS) {
    await new Promise((r) => setTimeout(r, RESTART_BACKOFF_MS));
  }
  ensureDir();
  purgeDir();
  const proc = spawnFfmpegHls();
  child = proc;
  startupPromise = waitForStartup(proc)
    .then(() => {
      ensureIdleTimer();
    })
    .catch((err) => {
      if (child === proc) {
        try {
          proc.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        child = null;
      }
      startupPromise = null;
      throw err;
    });
  await startupPromise;
}

export function touchHlsPipeline() {
  lastTouchAt = Date.now();
}

export function readHlsPlaylistText() {
  return fs.readFileSync(path.join(HLS_DIR, PLAYLIST_FILE), 'utf8');
}

export function isHlsFileName(name) {
  return name === INIT_FILE || SEGMENT_RE.test(name);
}

export function getHlsFilePath(name) {
  if (!isHlsFileName(name)) return null;
  const filePath = path.join(HLS_DIR, name);
  return fs.existsSync(filePath) ? filePath : null;
}

export function stopHlsPipeline() {
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = null;
  }
  if (child) {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
    child = null;
  }
  startupPromise = null;
  purgeDir();
}

// Make sure the ffmpeg child doesn't outlive the gateway.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => stopHlsPipeline());
}
process.on('exit', () => stopHlsPipeline());
