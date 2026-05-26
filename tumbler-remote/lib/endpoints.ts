import type { BackendSettings } from './storage';
import { getApiEndpointConfig } from './network';

/** Gateway HTTP paths (home server on LAN or Tailscale :8080) */
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
  const cfg = getApiEndpointConfig();
  return cfg.fallbackUrl;
}

export const EXPO_WEB_PORT = 8081;
export const GATEWAY_PORT = 8080;

/** Built-in defaults from .env — saved to device storage on first launch */
export function getBundledSettings(): BackendSettings {
  const cfg = getApiEndpointConfig();
  return {
    apiBaseUrl: cfg.fallbackUrl,
    deviceId: process.env.EXPO_PUBLIC_DEVICE_ID?.trim() || 'tumbler-01',
    apiKey: cfg.apiKey,
    streamPreference: 'auto',
  };
}

export function apiUrl(settings: BackendSettings, path: string): string {
  const base = settings.apiBaseUrl.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Expo dev app URL on LAN (port 8081) — for display only */
export function getLanAppPreviewUrl(apiBaseUrl?: string): string {
  const base = (apiBaseUrl || getDefaultApiBaseUrl()).replace(/\/$/, '');
  const host = base.replace(/^https?:\/\//, '').replace(/:8080$/, '');
  return `http://${host}:${EXPO_WEB_PORT}`;
}

export function getLocalApiUrl(): string {
  return getApiEndpointConfig().localUrl;
}

export function getRemoteApiUrl(): string {
  return getApiEndpointConfig().remoteUrl;
}
