/**
 * Serve the on-demand Apple-spec HLS pipeline (gateway/lib/hls-stream.mjs)
 * with per-session token rewriting. Native iOS Safari / WebKit clients hit
 * /api/hls/:sessionId/stream.m3u8, this returns a playlist whose segment
 * URLs are tokenised back through /api/hls/:sessionId/seg/<filename>.
 */
import {
  ensureHlsPipeline,
  getHlsFilePath,
  isHlsFileName,
  readHlsPlaylistText,
  touchHlsPipeline,
} from './hls-stream.mjs';

const PLAYLIST_CT = 'application/vnd.apple.mpegurl';
const SEGMENT_CT = 'video/mp4';

function rewritePlaylistLines(text, { sessionBase, tokenQ }) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const mapMatch = line.match(/URI="([^"]+)"/);
      if (mapMatch) {
        const original = mapMatch[1];
        const rewritten = `${sessionBase}/${encodeURIComponent(original)}?token=${tokenQ}`;
        return line.replace(`URI="${original}"`, `URI="${rewritten}"`);
      }
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }
      return `${sessionBase}/${encodeURIComponent(trimmed)}?token=${tokenQ}`;
    })
    .join('\n');
}

function setNoStoreHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
}

export function registerHlsRoutes(app, { getSession, getPublicBaseUrl }) {
  app.get('/api/hls/:sessionId/stream.m3u8', async (req, res) => {
    const { sessionId } = req.params;
    const token = String(req.query.token || '');
    if (!getSession(sessionId, token)) {
      res.status(401).end();
      return;
    }

    try {
      await ensureHlsPipeline();
    } catch (err) {
      res.status(502).send(`HLS pipeline failed to start: ${err.message}`);
      return;
    }

    let playlistText;
    try {
      playlistText = readHlsPlaylistText();
    } catch (err) {
      res.status(502).send(`HLS playlist unavailable: ${err.message}`);
      return;
    }

    const publicBase = getPublicBaseUrl(req).replace(/\/$/, '');
    const tokenQ = encodeURIComponent(token);
    const sessionBase = `${publicBase}/api/hls/${encodeURIComponent(sessionId)}/seg`;
    const rewritten = rewritePlaylistLines(playlistText, { sessionBase, tokenQ });

    res.setHeader('Content-Type', PLAYLIST_CT);
    res.setHeader('Access-Control-Allow-Origin', '*');
    setNoStoreHeaders(res);
    res.send(rewritten);
  });

  app.get('/api/hls/:sessionId/seg/:filename', (req, res) => {
    const { sessionId, filename } = req.params;
    const token = String(req.query.token || '');
    if (!getSession(sessionId, token)) {
      res.status(401).end();
      return;
    }
    if (!isHlsFileName(filename)) {
      res.status(400).send('bad segment name');
      return;
    }
    const filePath = getHlsFilePath(filename);
    if (!filePath) {
      // Old segment that has already rolled off the live window. Tell iOS
      // not to keep retrying it.
      res.status(410).end();
      return;
    }

    touchHlsPipeline();

    res.setHeader('Content-Type', SEGMENT_CT);
    res.setHeader('Access-Control-Allow-Origin', '*');
    // init.mp4 is stable for the lifetime of the pipeline, but a pipeline
    // restart re-mints it with a fresh moov; don't let the client cache it
    // longer than a single live window.
    if (filename === 'init.mp4') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    } else {
      // Segments are immutable once written; allow short edge cache so a
      // simultaneous viewer (e.g. another tab) hits the CDN rather than the
      // disk on every fetch.
      res.setHeader('Cache-Control', 'public, max-age=4');
    }

    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) {
        res.status(410).end();
      }
    });
  });
}
