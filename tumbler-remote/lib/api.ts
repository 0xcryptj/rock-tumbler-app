import type { BackendSettings } from './storage';

export type TumblerStatus = 'idle' | 'running' | 'pending';

export function apiHeaders(settings: BackendSettings): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
  };
}

/** ESP32 relay — independent of camera stream lifecycle. */
export async function sendTumblerCommand(
  settings: BackendSettings,
  action: 'start' | 'stop'
): Promise<void> {
  const base = settings.apiBaseUrl.replace(/\/$/, '');
  const url = `${base}/api/tumbler/${action}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: apiHeaders(settings),
      body: JSON.stringify({ deviceId: settings.deviceId }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
