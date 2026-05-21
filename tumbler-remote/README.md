# Tumblr Remote (Expo)

Expo app to remotely control a rock tumbler.

## Run

```bash
npm install
npx expo start
```

| Command | Purpose |
|---------|---------|
| `npx expo start --web` | Browser preview at http://localhost:8081 |
| `npx expo run:ios` | Native iOS build |

**Default passcode:** `123456`

## Features

- XP-style UI (desktop blue, title bars, beveled controls)
- Fullscreen video feed
- Start / Stop with backend API stub
- Settings for API URL, stream URL, device ID, passcode

## API (planned)

```http
POST {baseUrl}/api/tumbler/start
POST {baseUrl}/api/tumbler/stop
Content-Type: application/json

{ "deviceId": "tumbler-01" }
```

Optional header: `Authorization: Bearer {apiKey}`
