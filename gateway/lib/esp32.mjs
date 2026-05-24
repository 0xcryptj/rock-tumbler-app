/**
 * ESP32 relay HTTP client — shared by server.js and diagnostic scripts.
 */
import { parseEnvFile, GATEWAY_ROOT } from './eufy-camera.mjs';

export function getEsp32Config(env = parseEnvFile()) {
  return {
    base: (env.ESP32_BASE || process.env.ESP32_BASE || '').replace(/\/$/, ''),
    deviceId: env.ESP32_DEVICE_ID || process.env.ESP32_DEVICE_ID || 'tumbler-01',
    apiKey: env.ESP32_API_KEY || process.env.ESP32_API_KEY || '',
    expectedRelayPin: Number(
      env.ESP32_EXPECTED_RELAY_PIN || process.env.ESP32_EXPECTED_RELAY_PIN || 5
    ),
    relayInvert: isRelayInvert(env),
  };
}

/** When true, swap start/stop commands and flip status (active-HIGH relay on active-LOW sketch). */
export function isRelayInvert(env = parseEnvFile()) {
  const v = String(env.ESP32_RELAY_INVERT ?? process.env.ESP32_RELAY_INVERT ?? '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function applyRelayInvert(json, env = parseEnvFile()) {
  if (!isRelayInvert(env) || !json || typeof json !== 'object') {
    return json;
  }
  if (json.status === 'running') {
    return { ...json, status: 'idle' };
  }
  if (json.status === 'idle') {
    return { ...json, status: 'running' };
  }
  return json;
}

/**
 * @param {string} path e.g. /health, /start, /stop
 * @param {{ method?: string, body?: object }} [opts]
 */
export async function esp32Request(path, opts = {}) {
  const { base, apiKey } = getEsp32Config();
  if (!base) {
    throw new Error('ESP32_BASE not set in gateway/.env');
  }

  const method = opts.method || 'GET';
  const headers = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  let body;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { ok: response.ok, status: response.status, json, base, url };
}

/** POST /start or /stop — empty body (ESP32 ignores JSON). Honors ESP32_RELAY_INVERT. */
export async function esp32Relay(action) {
  const invert = isRelayInvert();
  const wireAction = invert ? (action === 'start' ? 'stop' : 'start') : action;
  const path = wireAction === 'start' ? '/start' : '/stop';
  const result = await esp32Request(path, { method: 'POST' });
  if (result.json) {
    result.json = applyRelayInvert(result.json);
  }
  return result;
}

export async function esp32Health() {
  const result = await esp32Request('/health');
  if (result.json) {
    result.json = applyRelayInvert(result.json);
  }
  return result;
}

export function formatEsp32Health(json) {
  if (!json || json.ok !== true) {
    return 'unhealthy';
  }
  const gpio = json.gpioLevel ? ` pin=${json.gpioLevel}` : '';
  const mode =
    json.relayActiveLow === 1 || json.relayActiveLow === true
      ? 'active-LOW'
      : json.relayActiveLow === 0 || json.relayActiveLow === false
        ? 'active-HIGH'
        : '';
  const pin =
    json.relayPinLabel && json.relayPin !== undefined
      ? `${json.relayPinLabel}/GPIO${json.relayPin}`
      : json.relayPinLabel || `GPIO${json.relayPin}`;
  return `${json.status} · ${pin} · ${json.relayOnLevel}=ON${gpio}${mode ? ` · ${mode}` : ''} · ${json.ip}`;
}

export function relayPinMismatch(json, expectedPin) {
  return (
    json?.relayPin !== undefined &&
    Number.isFinite(expectedPin) &&
    json.relayPin !== expectedPin
  );
}

export { GATEWAY_ROOT };
