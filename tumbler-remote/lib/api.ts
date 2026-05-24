import { apiUrl, ENDPOINTS } from '@/lib/endpoints';
import {
  formatRelaySummary,
  parseEsp32RelayPayload,
  type Esp32RelayState,
  type Esp32MotorStatus,
} from '@/lib/esp32';
import type { BackendSettings } from './storage';

export type TumblerRelayResponse = Esp32RelayState;

export function apiHeaders(settings: BackendSettings): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
  };
}

async function parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text.slice(0, 200) };
  }
}

async function parseRelayError(response: Response): Promise<string> {
  const data = await parseJsonResponse(response);
  const parts = [data.error, data.detail, data.hint]
    .filter((v): v is string => typeof v === 'string')
    .join(' — ');
  if (parts) {
    return parts;
  }
  return typeof data.raw === 'string' ? data.raw : `Server responded with ${response.status}`;
}

/**
 * ESP32 /health via gateway GET /api/test/esp32 (proxies sketch status JSON).
 */
export async function fetchEsp32RelayState(
  settings: BackendSettings
): Promise<Esp32RelayState | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(apiUrl(settings, ENDPOINTS.testEsp32), {
      method: 'GET',
      headers: apiHeaders(settings),
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const data = await parseJsonResponse(response);
    const fromHealth = parseEsp32RelayPayload({
      ok: data.ok,
      status: data.relayStatus ?? data.status,
      deviceId: data.deviceId,
      ip: data.ip,
      relayPin: data.relayPin,
      relayPinLabel: data.relayPinLabel,
      relayOnLevel: data.relayOnLevel,
      gpioLevel: data.gpioLevel,
      relayActiveLow: data.relayActiveLow,
      warning: data.warning,
    });
    return fromHealth;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** @deprecated use fetchEsp32RelayState */
export async function fetchRelayStatus(
  settings: BackendSettings
): Promise<Esp32MotorStatus | null> {
  const state = await fetchEsp32RelayState(settings);
  return state?.status ?? null;
}

/**
 * POST /api/tumbler/start|stop → gateway → ESP32 POST /start|/stop (sketch v2025, D5/GPIO5).
 */
export async function sendTumblerCommand(
  settings: BackendSettings,
  action: 'start' | 'stop'
): Promise<TumblerRelayResponse> {
  const path = action === 'start' ? ENDPOINTS.tumblerStart : ENDPOINTS.tumblerStop;
  const expectedStatus: Esp32MotorStatus = action === 'start' ? 'running' : 'idle';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(apiUrl(settings, path), {
      method: 'POST',
      headers: apiHeaders(settings),
      body: JSON.stringify({ deviceId: settings.deviceId }),
      signal: controller.signal,
    });

    const data = await parseJsonResponse(response);

    if (!response.ok) {
      throw new Error(await parseRelayError(response));
    }

    const parsed = parseEsp32RelayPayload(data);
    if (!parsed) {
      throw new Error(
        typeof data.error === 'string'
          ? data.error
          : 'ESP32 returned an unexpected response — check gateway and Serial Monitor'
      );
    }

    if (parsed.warning) {
      throw new Error(parsed.warning);
    }

    if (parsed.status !== expectedStatus) {
      throw new Error(
        `ESP32 reports ${parsed.status} (expected ${expectedStatus}). ${formatRelaySummary(parsed)}`
      );
    }

    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}
