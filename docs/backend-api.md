# Backend API contract

**Reference implementation:** [`gateway/`](../gateway/) (Node.js). Run it on your home server in front of go2rtc and the ESP32.

All requests use JSON and optional auth:

```http
Authorization: Bearer <apiKey>
Content-Type: application/json
```

## Tumbler relay (ESP32)

Independent of camera streaming.

### `POST /api/tumbler/start`

**Body**

```json
{ "deviceId": "tumbler-01" }
```

**Response** `200`

```json
{ "status": "running", "deviceId": "tumbler-01" }
```

Gateway forwards to ESP32 over HTTP. The sketch drives GPIO26 to the configured relay-on level
(`LOW` for the common active-low relay modules in this repo).

### `POST /api/tumbler/stop`

Same body shape. GPIO26 LOW — motor off.

## Camera stream (go2rtc-mediated)

### `POST /api/stream/start`

**Body**

```json
{
  "deviceId": "tumbler-01",
  "preference": "auto"
}
```

`preference`: `auto` | `webrtc` | `hls`

- `auto`: prefer WebRTC; fall back to HLS if client or go2rtc cannot offer WebRTC.
- `hls`: return HLS m3u8 URL (recommended for Expo PWA / Safari today).
- `webrtc`: return WebRTC/WHEP URL when available.

**Response** `200`

```json
{
  "sessionId": "sess_abc123",
  "playbackUrl": "https://tumbler.example.com/hls/sess_abc123/index.m3u8?token=…",
  "protocol": "hls",
  "expiresAt": "2026-05-20T12:34:56Z"
}
```

Implementation notes:

- `playbackUrl` must be reachable by the app over HTTPS (or LAN HTTP in dev only).
- Never return `rtsp://…` to the client.
- Bind `sessionId` to user/token; rate-limit starts.

### `POST /api/stream/stop`

**Body**

```json
{
  "sessionId": "sess_abc123",
  "deviceId": "tumbler-01"
}
```

**Response** `204` or `200`

Tear down go2rtc consumer / revoke token.

## Example gateway pseudocode

```text
on POST /api/stream/start:
  verify Bearer token
  src = config.go2rtc_stream  # e.g. tapo_c120
  if preference in (auto, webrtc) and webrtc_available(client):
    return { playbackUrl: whep_url_with_token(), protocol: "webrtc", ... }
  return { playbackUrl: hls_url_with_token(src), protocol: "hls", ... }

on POST /api/stream/stop:
  revoke token(sessionId)
```

## Failure behavior

If the app cannot reach the gateway or ESP32, it reports the backend error and does not fake the
relay state.
