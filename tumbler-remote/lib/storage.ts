import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const SETTINGS_KEY = 'tumbler_settings';
const PASSCODE_KEY = 'tumbler_passcode';

/** Playback protocol requested from backend (never raw RTSP in the app). */
export type StreamPreference = 'auto' | 'hls' | 'webrtc';

export type BackendSettings = {
  /** Home/backend API (go2rtc gateway + ESP32 relay). HTTPS when remote via Cloudflare Tunnel. */
  apiBaseUrl: string;
  deviceId: string;
  apiKey: string;
  /** Prefer WebRTC from go2rtc; HLS fallback when auto or WebRTC unavailable. */
  streamPreference: StreamPreference;
};

export const defaultSettings: BackendSettings = {
  apiBaseUrl: 'https://tumbler.example.com',
  deviceId: 'tumbler-01',
  apiKey: '',
  streamPreference: 'auto',
};

async function useSecureStore(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

function normalizeSettings(raw: Record<string, unknown>): BackendSettings {
  const pref = raw.streamPreference as StreamPreference | undefined;
  const validPref =
    pref === 'hls' || pref === 'webrtc' || pref === 'auto' ? pref : 'auto';

  return {
    apiBaseUrl:
      typeof raw.apiBaseUrl === 'string' && raw.apiBaseUrl
        ? raw.apiBaseUrl
        : defaultSettings.apiBaseUrl,
    deviceId:
      typeof raw.deviceId === 'string' && raw.deviceId
        ? raw.deviceId
        : defaultSettings.deviceId,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
    streamPreference: validPref,
  };
}

export async function loadSettings(): Promise<BackendSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return { ...defaultSettings };
  try {
    return normalizeSettings(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return { ...defaultSettings };
  }
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
