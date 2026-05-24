# Eufy C220 setup (gateway + app)

**Full guide (official eufy steps + troubleshooting):** [`docs/EUFY-C220-RTSP.md`](../docs/EUFY-C220-RTSP.md)

## Quick start

1. Eufy app → C220 → **Settings → General → Storage → RTSP/NAS** → enable, set RTSP user/pass, copy **Setup Guide** URL.
2. Paste into [`gateway/.env`](.env) as `RTSP_URL=rtsp://IP/live0` (or with user/pass if RTSP security is on).
3. From repo root:

```powershell
npm run verify:camera
npm run reset:stream
```

4. Expo → Settings → API base URL = `PUBLIC_BASE_URL` from `.env` → Connection tests → Play.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run verify:camera` | Test live0/1/2 (reads `.env` fresh) |
| `npm run reset:stream` | Regenerate go2rtc.yaml + restart go2rtc |
| `npm run stream` | go2rtc + gateway |
| `npm run test:stream` | End-to-end HLS check |
