import type { BackendSettings } from './storage';

/** Gateway HTTP paths (home server on LAN :8080) */
export const ENDPOINTS = {
  health: '/health',
  tumblerStart: '/api/tumbler/start',
  tumblerStop: '/api/tumbler/stop',
  streamStart: '/api/stream/start',
  streamStop: '/api/stream/stop',
  testEsp32: '/api/test/esp32',
  testCamera: '/api/test/camera',
  testAll: '/api/test/all',
  cameraSnapshot: '/api/camera/snapshot.jpg',
} as const;

export type EndpointKey = keyof typeof ENDPOINTS;

export function getDefaultApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  return 'http://10.0.0.30:8080';
}

export const EXPO_WEB_PORT = 8081;
export const GATEWAY_PORT = 8080;

/** Built-in defaults from .env — saved to device storage on first launch */
export function getBundledSettings(): BackendSettings {
  return {
    apiBaseUrl: getDefaultApiBaseUrl(),
    deviceId: process.env.EXPO_PUBLIC_DEVICE_ID?.trim() || 'tumbler-01',
    apiKey: process.env.EXPO_PUBLIC_API_KEY?.trim() || '',
    streamPreference: 'auto',
  };
}

export function apiUrl(settings: BackendSettings, path: string): string {
  const base = settings.apiBaseUrl.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Expo dev app URL on LAN (port 8081) — for display only */
export function getLanAppPreviewUrl(): string {
  const base = getDefaultApiBaseUrl();
  const host = base.replace(/^https?:\/\//, '').replace(/:8080$/, '');
  return `http://${host}:${EXPO_WEB_PORT}`;
}
