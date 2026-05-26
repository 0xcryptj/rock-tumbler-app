/**
 * Client-side API URL resolution — home WiFi (LAN) vs Tailscale remote.
 * The app only talks to the gateway; camera RTSP and ESP32 stay on the home LAN.
 */
import type { BackendSettings } from './storage';

export type ApiEndpointConfig = {
  localUrl: string;
  remoteUrl: string;
  fallbackUrl: string;
  apiKey: string;
};

export function parseApiUrl(value: string, defaultPort = 8080): { host: string; base: string } {
  const raw = String(value || '').trim().replace(/\/$/, '');
  if (!raw) return { host: '', base: '' };
  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`http://${raw}`);
    const port = url.port || String(defaultPort);
    const host = url.hostname.toLowerCase();
    const base = `${url.protocol}//${url.hostname}${port ? `:${port}` : ''}`.replace(/\/$/, '');
    return { host, base };
  } catch {
    return { host: '', base: '' };
  }
}

export function isTailscaleHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h.endsWith('.ts.net')) return true;
  const parts = h.split('.').map(Number);
  return parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

export function isLocalhostUrl(url: string): boolean {
  return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?/i.test(url);
}

/**
 * When the Expo web build is served from the same origin as the gateway
 * (e.g. behind Cloudflare Tunnel at https://tumbler.example.com), prefer the
 * page origin so the app never hardcodes a LAN IP into the production build.
 *
 * Skips Expo/Metro dev ports so dev still uses the configured LAN URL.
 */
export function getDefaultWebOrigin(): string {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') {
    return '';
  }
  const origin = String(window.location.origin || '').replace(/\/$/, '');
  if (!origin || origin === 'null') return '';
  if (/:(8081|19000|19001|19002|19006)$/.test(origin)) return '';
  return origin;
}

const PRIVATE_HOST_RE = /^(https?:\/\/)?(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.0\.0\.1|localhost)/i;

export function getApiEndpointConfig(): ApiEndpointConfig {
  const bundledLocal =
    process.env.EXPO_PUBLIC_LOCAL_API_URL?.trim().replace(/\/$/, '') ||
    process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, '') ||
    '';
  const bundledRemote = process.env.EXPO_PUBLIC_REMOTE_API_URL?.trim().replace(/\/$/, '') || '';
  const webOrigin = getDefaultWebOrigin();

  // CRITICAL — when the bundle runs in a real web origin (not Metro dev),
  // we must NEVER expose a private LAN URL from build-time env. Doing so
  // (a) causes mixed-content "Not secure" warnings on HTTPS pages that load
  // http://10.x sub-resources, and (b) sends users off-LAN to unreachable IPs.
  // The bundled LAN URL is only useful for Metro dev (port 8081/19xxx) and
  // for native iOS/Android builds (where `window` is undefined).
  const suppressPrivate = webOrigin !== '';
  const localUrl = suppressPrivate && bundledLocal && PRIVATE_HOST_RE.test(bundledLocal)
    ? ''
    : bundledLocal;
  const remoteUrl = suppressPrivate && bundledRemote && PRIVATE_HOST_RE.test(bundledRemote)
    ? ''
    : bundledRemote;

  const localIsPrivate = !localUrl || PRIVATE_HOST_RE.test(localUrl);
  const remoteIsPrivate = !remoteUrl || PRIVATE_HOST_RE.test(remoteUrl);
  const fallbackUrl =
    webOrigin && localIsPrivate && remoteIsPrivate
      ? webOrigin
      : localUrl || remoteUrl || webOrigin || '';

  const apiKey = process.env.EXPO_PUBLIC_API_KEY?.trim() || '';

  return { localUrl, remoteUrl, fallbackUrl, apiKey };
}

export function getConfiguredApiUrls(): string[] {
  const { localUrl, remoteUrl, fallbackUrl } = getApiEndpointConfig();
  return [localUrl, remoteUrl, fallbackUrl].filter(Boolean).filter((u, i, a) => a.indexOf(u) === i);
}

export type ReachabilityResult = {
  url: string;
  ok: boolean;
  mode: 'local' | 'remote' | 'custom';
  detail?: string;
};

export async function probeGateway(
  baseUrl: string,
  apiKey: string,
  timeoutMs = 5000
): Promise<ReachabilityResult> {
  const base = baseUrl.replace(/\/$/, '');
  const { localUrl, remoteUrl } = getApiEndpointConfig();
  const mode =
    base === localUrl ? 'local' : base === remoteUrl ? 'remote' : 'custom';

  try {
    const response = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!response.ok) {
      return { url: base, ok: false, mode, detail: `HTTP ${response.status}` };
    }
    const data = (await response.json()) as { ok?: boolean };
    return { url: base, ok: data.ok === true, mode, detail: 'OK' };
  } catch (err) {
    return {
      url: base,
      ok: false,
      mode,
      detail: err instanceof Error ? err.message : 'Unreachable',
    };
  }
}

/**
 * Try local LAN first (fast on home WiFi), then Tailscale remote URL.
 */
export async function resolveBestApiBaseUrl(
  apiKey: string,
  preferredUrl?: string
): Promise<ReachabilityResult | null> {
  const { localUrl, remoteUrl, fallbackUrl } = getApiEndpointConfig();
  const candidates: { url: string; mode: 'local' | 'remote' | 'custom' }[] = [];

  if (preferredUrl) {
    candidates.push({ url: preferredUrl.replace(/\/$/, ''), mode: 'custom' });
  }
  if (localUrl) candidates.push({ url: localUrl, mode: 'local' });
  if (remoteUrl && remoteUrl !== localUrl) {
    candidates.push({ url: remoteUrl, mode: 'remote' });
  }
  if (fallbackUrl && !candidates.some((c) => c.url === fallbackUrl)) {
    candidates.push({ url: fallbackUrl, mode: 'custom' });
  }

  const seen = new Set<string>();
  for (const { url, mode } of candidates) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const result = await probeGateway(url, apiKey);
    if (result.ok) {
      return { ...result, mode };
    }
  }

  return candidates.length
    ? { url: candidates[0].url, ok: false, mode: candidates[0].mode, detail: 'No reachable gateway' }
    : null;
}

export function describeApiMode(url: string): string {
  const { localUrl, remoteUrl } = getApiEndpointConfig();
  const base = url.replace(/\/$/, '');
  if (base === localUrl) return 'Home WiFi (LAN)';
  if (base === remoteUrl) return 'Tailscale (remote)';
  const host = parseApiUrl(base).host;
  if (isTailscaleHost(host)) return 'Tailscale (remote)';
  return 'Custom gateway URL';
}

export function mergeApiSettings(stored: BackendSettings): BackendSettings {
  const cfg = getApiEndpointConfig();
  const webOrigin = getDefaultWebOrigin();
  const bundled: BackendSettings = {
    apiBaseUrl: cfg.fallbackUrl || stored.apiBaseUrl,
    deviceId: process.env.EXPO_PUBLIC_DEVICE_ID?.trim() || stored.deviceId,
    apiKey: cfg.apiKey || stored.apiKey,
    streamPreference: 'auto',
  };
  // Throughout the rest of this function we do `{ ...bundled, ...stored }`,
  // which would let an EMPTY stored.apiKey (legacy clients before API_KEY was
  // enforced) overwrite the new bundled key. Force-clear empties in `stored`
  // so the spread leaves bundled values intact for those fields.
  const sanitizedStored: BackendSettings = {
    ...stored,
    apiBaseUrl: stored.apiBaseUrl || bundled.apiBaseUrl,
    apiKey: stored.apiKey || bundled.apiKey,
    deviceId: stored.deviceId || bundled.deviceId,
  };
  stored = sanitizedStored;

  const storedHost = parseApiUrl(stored.apiBaseUrl).host;
  const isUserRemote = isTailscaleHost(storedHost);
  const bundledLocal = cfg.localUrl && stored.apiBaseUrl === cfg.localUrl;
  const bundledRemote = cfg.remoteUrl && stored.apiBaseUrl === cfg.remoteUrl;

  // When loaded from a public origin (e.g. Cloudflare Tunnel), prefer it over
  // any stored LAN/Tailscale URL — otherwise the browser would try to fetch
  // a private IP that isn't reachable from outside the LAN.
  if (webOrigin && stored.apiBaseUrl !== webOrigin) {
    const isPrivateStored =
      isLocalhostUrl(stored.apiBaseUrl) || isTailscaleHost(storedHost) || !stored.apiBaseUrl;
    const isPrivateLanStored = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(storedHost);
    if (isPrivateStored || isPrivateLanStored) {
      return { ...bundled, ...stored, apiBaseUrl: webOrigin, streamPreference: 'auto' };
    }
  }

  // Do not overwrite an explicit Tailscale URL with a bundled LAN URL.
  if (isUserRemote && cfg.localUrl && stored.apiBaseUrl !== cfg.localUrl) {
    return { ...bundled, ...stored, apiBaseUrl: stored.apiBaseUrl, streamPreference: 'auto' };
  }

  if (isLocalhostUrl(stored.apiBaseUrl) && cfg.fallbackUrl && !isLocalhostUrl(cfg.fallbackUrl)) {
    return { ...bundled, ...stored, apiBaseUrl: cfg.fallbackUrl, streamPreference: 'auto' };
  }

  if (!bundledLocal && !bundledRemote && stored.apiBaseUrl) {
    return { ...bundled, ...stored, streamPreference: 'auto' };
  }

  return { ...bundled, ...stored, streamPreference: 'auto' };
}
