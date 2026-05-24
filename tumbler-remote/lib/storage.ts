import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { getBundledSettings } from '@/lib/endpoints';

const SETTINGS_KEY = 'tumbler_settings';
const SETTINGS_VERSION_KEY = 'tumbler_settings_version';
const PASSCODE_KEY = 'tumbler_passcode';

/** Bump when bundled LAN endpoints change — triggers merge + save */
const CURRENT_SETTINGS_VERSION = 9;

/** @deprecated — video is always RTSP→MP4 via gateway */
export type StreamPreference = 'auto';

export type BackendSettings = {
  apiBaseUrl: string;
  deviceId: string;
  apiKey: string;
  streamPreference?: StreamPreference;
};

export const defaultSettings: BackendSettings = getBundledSettings();

async function useSecureStore(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

function normalizeSettings(raw: Record<string, unknown>): BackendSettings {
  const bundled = getBundledSettings();
  return {
    apiBaseUrl:
      typeof raw.apiBaseUrl === 'string' && raw.apiBaseUrl
        ? raw.apiBaseUrl.replace(/\/$/, '')
        : bundled.apiBaseUrl,
    deviceId:
      typeof raw.deviceId === 'string' && raw.deviceId
        ? raw.deviceId
        : bundled.deviceId,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : bundled.apiKey,
    streamPreference: 'auto',
  };
}

function isLocalhostUrl(url: string): boolean {
  return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?/i.test(url);
}

function apiHostPort(url: string): { host: string; port: string } {
  try {
    const u = new URL(url.includes('://') ? url : `http://${url}`);
    return { host: u.hostname.toLowerCase(), port: u.port || '80' };
  } catch {
    return { host: '', port: '' };
  }
}

/** Prefer bundled URL from .env when saved host is stale (wrong subnet, ESP32 IP, localhost). */
function mergeWithBundled(stored: BackendSettings): BackendSettings {
  const bundled = getBundledSettings();
  const storedHp = apiHostPort(stored.apiBaseUrl);
  const bundledHp = apiHostPort(bundled.apiBaseUrl);
  const hostsDiffer =
    bundledHp.host && storedHp.host && bundledHp.host !== storedHp.host;
  const useBundledBase =
    (isLocalhostUrl(stored.apiBaseUrl) && !isLocalhostUrl(bundled.apiBaseUrl)) ||
    (hostsDiffer && !isLocalhostUrl(bundled.apiBaseUrl));

  return {
    ...bundled,
    ...stored,
    apiBaseUrl: useBundledBase ? bundled.apiBaseUrl : stored.apiBaseUrl,
    streamPreference: 'auto',
  };
}

export async function loadSettings(): Promise<BackendSettings> {
  const bundled = getBundledSettings();
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  const versionRaw = await AsyncStorage.getItem(SETTINGS_VERSION_KEY);
  const version = versionRaw ? Number(versionRaw) : 0;

  if (!raw) {
    await saveSettings(bundled);
    await AsyncStorage.setItem(SETTINGS_VERSION_KEY, String(CURRENT_SETTINGS_VERSION));
    return bundled;
  }

  let settings: BackendSettings;
  try {
    settings = normalizeSettings(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    settings = bundled;
  }

  let merged = mergeWithBundled(settings);
  if (version < 6 && apiHostPort(settings.apiBaseUrl).host !== apiHostPort(bundled.apiBaseUrl).host) {
    merged = { ...merged, apiBaseUrl: bundled.apiBaseUrl };
  }
  const needsSave =
    version < CURRENT_SETTINGS_VERSION ||
    merged.apiBaseUrl !== settings.apiBaseUrl ||
    JSON.stringify(merged) !== JSON.stringify(settings);

  if (needsSave) {
    await saveSettings(merged);
    await AsyncStorage.setItem(SETTINGS_VERSION_KEY, String(CURRENT_SETTINGS_VERSION));
    return merged;
  }

  return settings;
}

export async function saveSettings(settings: BackendSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function getPasscode(): Promise<string> {
  if (await useSecureStore()) {
    const stored = await SecureStore.getItemAsync(PASSCODE_KEY);
    return stored ?? '123456';
  }
  const stored = await AsyncStorage.getItem(PASSCODE_KEY);
  return stored ?? '123456';
}

export async function setPasscode(code: string): Promise<void> {
  if (await useSecureStore()) {
    await SecureStore.setItemAsync(PASSCODE_KEY, code);
    return;
  }
  await AsyncStorage.setItem(PASSCODE_KEY, code);
}
