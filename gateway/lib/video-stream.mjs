/**
 * RTSP → live video for the app: one output format (fragmented MP4).
 * go2rtc pulls the camera (Digest etc.); ffmpeg reads the local relay without re-auth.
 */
import { getFfmpegBin } from './bin-paths.mjs';

const GO2RTC_STREAM = process.env.GO2RTC_STREAM || 'tumbler_cam';
const GO2RTC_RTSP_PORT = Number(process.env.GO2RTC_RTSP_PORT || 8554);

export function getGo2rtcRelayRtspUrl() {
  return `rtsp://127.0.0.1:${GO2RTC_RTSP_PORT}/${GO2RTC_STREAM}`;
}

export { getFfmpegBin };

/** Pipe fragmented MP4 from an RTSP URL to an HTTP response. */
export function pipeFfmpegMp4(rtspUrl, res, spawnFfmpeg) {
  let child;
  try {
    child = spawnFfmpeg([
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
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      '-f',
      'mp4',
      'pipe:1',
    ]);
  } catch (err) {
    res.status(502).send(`ffmpeg failed to start: ${err.message}`);
    return null;
  }

  let started = false;
  let stderr = '';
  const failIfNotStarted = setTimeout(() => {
    if (!started && !res.headersSent) {
      child.kill('SIGKILL');
      res.status(502).send(
        stderr.trim() || 'RTSP stream did not start — open camera live view, check gateway/.env RTSP_URL'
      );
    }
  }, 15_000);

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  child.stdout.on('error', (err) => {
    clearTimeout(failIfNotStarted);
    if (!child.killed) {
      child.kill('SIGKILL');
    }
    if (!res.headersSent) {
      res.status(502).send(err.message);
    } else if (!res.destroyed) {
      res.destroy(err);
    }
  });
  child.on('error', (err) => {
    clearTimeout(failIfNotStarted);
    if (!res.headersSent) {
      res.status(502).send(err.message);
    } else {
      res.destroy(err);
    }
  });
  child.stdout.once('data', (chunk) => {
    started = true;
    clearTimeout(failIfNotStarted);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
      res.setHeader('Cache-Control', 'no-cache');
    }
    res.write(chunk);
    child.stdout.pipe(res);
  });
  child.on('close', () => {
    clearTimeout(failIfNotStarted);
    if (!res.destroyed) {
      res.end();
    }
  });
  res.on('close', () => {
    clearTimeout(failIfNotStarted);
    if (!child.killed) {
      child.kill('SIGKILL');
    }
  });
  res.on('error', () => {
    clearTimeout(failIfNotStarted);
    if (!child.killed) {
      child.kill('SIGKILL');
    }
  });
  return child;
}

/** Single JPEG frame from RTSP (thumbnail / probe). */
export function pipeFfmpegJpeg(rtspUrl, res, spawnFfmpeg) {
  let child;
  try {
    child = spawnFfmpeg([
      '-hide_banner',
      '-loglevel',
      'error',
      '-rtsp_transport',
      'tcp',
      '-i',
      rtspUrl,
      '-frames:v',
      '1',
      '-f',
      'mjpeg',
      'pipe:1',
    ]);
  } catch (err) {
    res.status(502).send(`ffmpeg failed to start: ${err.message}`);
    return null;
  }

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, max-age=2');
  child.stdout.pipe(res);
  child.on('close', () => res.end());
  child.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).send(err.message);
    }
  });
  return child;
}
