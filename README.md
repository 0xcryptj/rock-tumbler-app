# Rock Tumbler Remote

Monorepo for a Wi‑Fi rock tumbler project: mobile remote app, design assets, and hardware (KiCad).

## Repository layout

| Path | Description |
|------|-------------|
| [`tumbler-remote/`](tumbler-remote/) | **Expo SDK 55** iOS app — passcode gate, live video, start/stop controls |
| [`app assets/`](app%20assets/) | Logo and UI mockups |
| [`circuits/`](circuits/) | KiCad hardware files |

## Mobile app (`tumbler-remote`)

Windows XP–themed remote control UI:

1. **Splash** — loading window  
2. **Passcode** — 6-digit PIN (default `123456`)  
3. **Dashboard** — video feed, status, Start/Stop, settings  

### Quick start

```bash
cd tumbler-remote
npm install
npx expo start
```

- **Web preview:** `npx expo start --web` → http://localhost:8081  
- **iOS device/simulator:** `npx expo run:ios`  

### Backend settings (future)

Configure in the app **Settings** dialog:

- API base URL — `POST /api/tumbler/start` and `/stop`  
- Stream URL — RTSP/HTTP for `expo-video`  
- Device ID and optional API key  

If the backend is unreachable, the app runs in **demo mode** (local state only).

### Tech stack

- Expo SDK 55, React 19.2, React Native 0.83  
- `expo-router`, `expo-video`, `expo-secure-store`  
- TypeScript  

See [`tumbler-remote/README.md`](tumbler-remote/README.md) for more app-specific notes.

## License

Private project — all rights reserved unless otherwise noted.
