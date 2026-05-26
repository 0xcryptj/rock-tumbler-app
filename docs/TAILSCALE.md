# Tailscale remote access

Private encrypted access to the rock tumbler gateway **without** port forwarding, ngrok, or exposing RTSP/ESP32 to the public internet.

## Architecture

```
Phone (Expo app + Tailscale client)
    ↓  HTTPS/HTTP to gateway :8080 only
Tailscale mesh (WireGuard)
    ↓
Gateway PC (Node.js + go2rtc + Tailscale)
    ↓  home LAN only
├── RTSP camera (:554)
└── ESP32 relay (:80)
```

| Device | Tailscale? | Internet exposure |
|--------|------------|-------------------|
| Phone | Yes (Tailscale app) | No direct camera/ESP32 access |
| Gateway PC | Yes (only host that needs it) | API :8080 on tailnet only |
| IP camera | No | LAN only |
| ESP32 | No | LAN only |
| go2rtc | No | `127.0.0.1:1984` only |

## Quick setup

### 1. Gateway host (Windows or Raspberry Pi)

1. Install [Tailscale](https://tailscale.com/download) and sign in.
2. Copy env templates:
   ```bash
   cp gateway/.env.example gateway/.env
   cp tumbler-remote/.env.example tumbler-remote/.env
   ```
3. Set camera/ESP32 **LAN** addresses in `gateway/.env` (unchanged).
4. Sync URLs:
   ```bash
   npm run sync:lan        # LOCAL_API_URL from WiFi IP
   npm run sync:tailscale  # REMOTE_API_URL from Tailscale IP/MagicDNS
   ```
5. Generate a strong shared secret:
   ```bash
   # Example (PowerShell): [guid]::NewGuid().ToString("N")
   ```
   Set `API_KEY` in `gateway/.env` and `EXPO_PUBLIC_API_KEY` in `tumbler-remote/.env`.
6. Start backend:
   ```bash
   npm run start
   ```
   Confirm startup logs show Tailscale active and `SECURITY: API key enforcement enabled`.

### 2. Phone

1. Install Tailscale and join the **same tailnet** as the gateway.
2. Build/run the Expo app with matching `.env` (or set URLs in Settings).
3. On **home WiFi**: app tries `EXPO_PUBLIC_LOCAL_API_URL` first.
4. On **cellular/away**: app falls back to `EXPO_PUBLIC_REMOTE_API_URL`.

## Environment variables

### Gateway (`gateway/.env`)

| Variable | Purpose |
|----------|---------|
| `LOCAL_API_URL` | Home WiFi URL, e.g. `http://192.168.1.50:8080` |
| `REMOTE_API_URL` | Tailscale URL, e.g. `http://100.64.0.5:8080` or `http://gateway.tail12345.ts.net:8080` |
| `PUBLIC_BASE_URL` | Optional fixed base for stream `playbackUrl`. **Leave empty** to auto-match how the client connected (best for LAN + Tailscale). |
| `TAILSCALE_HOSTNAME` | MagicDNS name (set by `npm run sync:tailscale`) |
| `API_KEY` | Bearer token for all control routes |
| `REQUIRE_API_KEY` | `true` / `false` — defaults to `true` when Tailscale is detected |
| `STREAM_SESSION_MINUTES` | Stream token lifetime (use `15`–`30` for remote) |

Camera/ESP32 vars (`RTSP_URL`, `ESP32_BASE`, `GO2RTC_BASE`) stay **LAN/localhost** — do not point them at Tailscale.

### Expo app (`tumbler-remote/.env`)

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_LOCAL_API_URL` | Home WiFi gateway |
| `EXPO_PUBLIC_REMOTE_API_URL` | Tailscale gateway |
| `EXPO_PUBLIC_API_BASE_URL` | Fallback if only one URL is used |
| `EXPO_PUBLIC_API_KEY` | Must match `gateway` `API_KEY` |

## Security

- **API key**: Required automatically when Tailscale is active on the gateway. All `/api/*` control routes and `/api/camera/snapshot.jpg` require `Authorization: Bearer <API_KEY>`.
- **Stream tokens**: `POST /api/stream/start` returns short-lived `?token=` URLs; no RTSP on the phone.
- **No WAN exposure**: Do not forward ports 554, 8554, or ESP32 HTTP. Only join devices to your tailnet.
- **Firewall (Windows)**: Allow Node on Private networks; block Public profile for port 8080 unless you intend tailnet-only access.

## Playback URLs (important)

When `PUBLIC_BASE_URL` is empty, the gateway builds `playbackUrl` from the client `Host` header. That means:

- Phone on LAN hitting `http://192.168.x.x:8080` → stream URLs use LAN IP.
- Phone on Tailscale hitting `http://100.x.x.x:8080` → stream URLs use Tailscale IP.

If you set a fixed `PUBLIC_BASE_URL` to LAN only, **remote Tailscale clients will get broken video URLs**. Prefer leaving it empty for dual-mode.

## Deployment checklist

### Windows gateway PC

- [ ] Tailscale installed, logged in, “Connected”
- [ ] `npm run sync:lan` and `npm run sync:tailscale`
- [ ] `API_KEY` set (32+ random characters)
- [ ] `gateway/.env`: `ESP32_BASE`, `RTSP_URL` = LAN addresses
- [ ] `GO2RTC_BASE=http://127.0.0.1:1984` (unchanged)
- [ ] `npm run start` — startup shows Tailscale + API key OK
- [ ] `npm run test` — all checks pass (Tailscale row OK when configured)
- [ ] Phone on Tailscale: Settings → connection tests pass
- [ ] Play video remotely; start/stop tumbler

### Raspberry Pi gateway

- [ ] Install Tailscale: `curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`
- [ ] Optional: enable MagicDNS in [Tailscale admin console](https://login.tailscale.com/admin/dns)
- [ ] Clone repo, `npm install`, copy `.env` files
- [ ] `npm run sync:lan` / `npm run sync:tailscale`
- [ ] systemd service for `npm run gateway` (see `gateway/README.md`)
- [ ] Same API key and tests as Windows

### Phone

- [ ] Tailscale app running (VPN icon on iOS/Android)
- [ ] `EXPO_PUBLIC_API_KEY` matches gateway
- [ ] Connection tests pass on WiFi and on cellular (Tailscale)

## Best practices

### MagicDNS

Enable MagicDNS in the tailnet admin panel so `REMOTE_API_URL` can use `http://your-pc-name.tailxxxxx.ts.net:8080` instead of remembering `100.x` IPs. Run `npm run sync:tailscale` after enabling.

### Subnet routers (advanced)

If the gateway Pi is **not** on the same subnet as the camera/ESP32, advertise the home LAN with a [subnet router](https://tailscale.com/kb/1019/subnets):

- Only the router device needs Tailscale subnet routes.
- Camera and ESP32 still have no Tailscale client.
- Prefer one always-on Pi on the home LAN as gateway + optional subnet router.

### HTTPS reverse proxy (later)

Tailscale provides encrypted transport between devices. For an extra HTTPS layer (e.g. custom domain):

- Run Caddy/nginx on the gateway **bound to Tailscale IP only** (not `0.0.0.0` on WAN).
- Set `PUBLIC_BASE_URL=https://gateway.tailnet-name.ts.net` and `trust proxy` (already enabled).
- Keep `API_KEY` required.

Do **not** expose go2rtc or RTSP through the proxy.

### ACLs (recommended for production)

In Tailscale ACLs, restrict who can reach the gateway:

```json
"grants": [
  { "src": ["autogroup:member"], "dst": ["tag:tumbler-gateway:8080"], "ip": ["*"] }
]
```

Tag the gateway machine `tag:tumbler-gateway` in the admin console.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `401 unauthorized` | Set matching `API_KEY` / `EXPO_PUBLIC_API_KEY` |
| `503 API_KEY required` | Add `API_KEY` to `gateway/.env` and restart |
| Video plays on WiFi, not remote | Clear `PUBLIC_BASE_URL` or set it to Tailscale URL; reconnect via remote API URL |
| Tailscale check fails | Sign in on gateway host; run `tailscale status` |
| ESP32 works locally, not remote | Normal if gateway is down; remote path is still gateway → ESP32 on LAN |
| App overwrites Tailscale URL | Update app; v10 settings preserve Tailscale hosts |

## What we deliberately avoid

- Public port forwarding / DMZ
- ngrok or similar public tunnels
- RTSP or ESP32 exposed on WAN
- Tailscale on camera or ESP32 (unnecessary)

## Related docs

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system overview
- [`backend-api.md`](backend-api.md) — HTTP API
- [`gateway/README.md`](../gateway/README.md) — install on home server
