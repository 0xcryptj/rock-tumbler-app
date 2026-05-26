import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { getBundledSettings } from '@/lib/endpoints';
import { isLocalhostUrl, mergeApiSettings, resolveBestApiBaseUrl } from '@/lib/network';

const SETTINGS_KEY = 'tumbler_settings';
const SETTINGS_VERSION_KEY = 'tumbler_settings_version';
const PASSCODE_KEY = 'tumbler_passcode';

/** Bump when bundled endpoint config changes — triggers merge + save */
const CURRENT_SETTINGS_VERSION = 13;

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
  // For every field, fall back to the bundled value when the stored value is
  // empty/missing. Critical for apiKey: when the operator rotates API_KEY in
  // gateway/.env + EXPO_PUBLIC_API_KEY, clients with an empty stored apiKey
  // must adopt the new bundled key — otherwise every control request 401s.
  return {
    apiBaseUrl:
      typeof raw.apiBaseUrl === 'string' && raw.apiBaseUrl
        ? raw.apiBaseUrl.replace(/\/$/, '')
        : bundled.apiBaseUrl,
    deviceId:
      typeof raw.deviceId === 'string' && raw.deviceId
        ? raw.deviceId
        : bundled.deviceId,
    apiKey:
      typeof raw.apiKey === 'string' && raw.apiKey
        ? raw.apiKey
        : bundled.apiKey,
    streamPreference: 'auto',
  };
}

export async function loadSettings(): Promise<BackendSettings> {
  const bundled = getBundledSettings();
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  const versionRaw = await AsyncStorage.getItem(SETTINGS_VERSION_KEY);
  const version = versionRaw ? Number(versionRaw) : 0;

  if (!raw) {
    const resolved = await resolveBestApiBaseUrl(bundled.apiKey);
    const initial = resolved?.ok
      ? { ...bundled, apiBaseUrl: resolved.url }
      : bundled;
    await saveSettings(initial);
    await AsyncStorage.setItem(SETTINGS_VERSION_KEY, String(CURRENT_SETTINGS_VERSION));
    return initial;
  }

  let settings: BackendSettings;
  try {
    settings = normalizeSettings(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    settings = bundled;
  }

  let merged = mergeApiSettings(settings);

  if (version < CURRENT_SETTINGS_VERSION) {
    const resolved = await resolveBestApiBaseUrl(merged.apiKey, merged.apiBaseUrl);
    if (resolved?.ok && resolved.url !== merged.apiBaseUrl) {
      merged = { ...merged, apiBaseUrl: resolved.url };
    }
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

export { isLocalhostUrl };
