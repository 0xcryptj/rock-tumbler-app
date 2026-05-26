#!/usr/bin/env node
/**
 * End-to-end Safari HLS path test. Spins up a session, fetches the playlist,
 * walks the EXT-X-MAP and one media segment to confirm the gateway's
 * ffmpeg-driven HLS pipeline (gateway/lib/hls-stream.mjs) is healthy.
 *
 * Run: node scripts/test-safari-hls.mjs
 */
import 'dotenv/config';

const G = (process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');

function fail(label, detail) {
  console.error(`FAIL ${label}: ${detail}`);
  process.exit(1);
}

async function testHls() {
  const start = await fetch(`${G}/api/stream/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: 'test', browser: 'safari', preference: 'hls' }),
  });
  const session = await start.json();
  if (!start.ok) fail('stream/start', `${start.status} ${JSON.stringify(session)}`);
  console.log('session:', { protocol: session.protocol, sessionId: session.sessionId });
  if (session.protocol !== 'hls') {
    fail('stream/start', `expected protocol=hls, got ${session.protocol}`);
  }
  const playlistUrl = session.playbackUrl;
  console.log('playlist:', playlistUrl);

  const pl = await fetch(playlistUrl);
  const plText = await pl.text();
  if (!pl.ok) fail('playlist', `${pl.status} ${plText.slice(0, 200)}`);
  console.log('--- playlist ---');
  console.log(plText.trim());
  console.log('--- /playlist ---');

  for (const tag of ['#EXTM3U', '#EXT-X-VERSION', '#EXT-X-TARGETDURATION', '#EXT-X-MEDIA-SEQUENCE', '#EXT-X-MAP', '#EXTINF']) {
    if (!plText.includes(tag)) fail('playlist', `missing ${tag}`);
  }

  const mapMatch = plText.match(/#EXT-X-MAP:URI="([^"]+)"/);
  if (!mapMatch) fail('playlist', 'no #EXT-X-MAP URI');
  const initUrl = mapMatch[1];
  console.log('init.mp4 url:', initUrl);
  const init = await fetch(initUrl);
  const initBuf = await init.arrayBuffer();
  console.log('init.mp4:', init.status, initBuf.byteLength, 'bytes,', init.headers.get('content-type'));
  if (!init.ok || initBuf.byteLength < 200) {
    fail('init.mp4', `bad init segment (${init.status}, ${initBuf.byteLength} bytes)`);
  }

  const segLine = plText.split('\n').find((l) => l.trim().startsWith('http') && !l.includes('.m3u8'));
  if (!segLine) fail('playlist', 'no media segment URL');
  const segUrl = segLine.trim();
  console.log('segment url:', segUrl);
  const seg = await fetch(segUrl);
  const segBuf = await seg.arrayBuffer();
  console.log('segment:', seg.status, segBuf.byteLength, 'bytes,', seg.headers.get('content-type'));
  if (!seg.ok || segBuf.byteLength < 4_000) {
    fail('segment', `segment too small / failed (${seg.status}, ${segBuf.byteLength} bytes)`);
  }

  await fetch(`${G}/api/stream/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: session.sessionId }),
  }).catch(() => {});

  console.log('\nPASS — playlist + init + segment all OK');
}

await testHls();
