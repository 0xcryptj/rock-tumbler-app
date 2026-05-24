/**
 * Quick check: RTSP camera -> gateway -> Expo playback URL.
 * Run: node scripts/test-stream.mjs
 */
import 'dotenv/config';

const GATEWAY = (process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');

async function main() {
  console.log('1. gateway health...');
  try {
    const response = await fetch(`${GATEWAY}/health`);
    console.log(response.ok ? `   ${JSON.stringify(await response.json())}` : `   ${response.status}`);
  } catch (err) {
    console.log('   FAIL - npm start in gateway:', err.message);
    process.exit(1);
  }

  console.log('2. camera RTSP probe...');
  const camera = await fetch(`${GATEWAY}/api/test/camera`);
  const cameraJson = await camera.json().catch(() => ({}));
  if (!camera.ok || cameraJson.ok !== true) {
    console.log(`   FAIL ${camera.status} ${JSON.stringify(cameraJson)}`);
    process.exit(1);
  }
  console.log(`   OK ${cameraJson.detail || ''}`);

  console.log('3. stream session...');
  const start = await fetch(`${GATEWAY}/api/stream/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: 'tumbler-01', preference: 'auto', platform: 'web' }),
  });
  const session = await start.json();
  if (!start.ok) {
    console.log(`   FAIL ${start.status} ${JSON.stringify(session)}`);
    process.exit(1);
  }
  console.log(`   playbackUrl: ${session.playbackUrl}`);
  console.log(`   protocol: ${session.protocol}`);

  console.log('4. playback bytes...');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const playback = await fetch(session.playbackUrl, { signal: controller.signal });
    const reader = playback.body?.getReader();
    const first = reader ? await reader.read() : null;
    if (playback.ok && first?.value?.byteLength > 0) {
      console.log(`   OK received ${first.value.byteLength} bytes`);
    } else {
      console.log(`   FAIL ${playback.status}`);
      process.exit(1);
    }
    await reader?.cancel();
  } finally {
    clearTimeout(timeout);
    await fetch(`${GATEWAY}/api/stream/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.sessionId, deviceId: 'tumbler-01' }),
    }).catch(() => {});
  }
}

main();
