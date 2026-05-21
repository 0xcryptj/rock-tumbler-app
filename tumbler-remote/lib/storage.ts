import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const SETTINGS_KEY = 'tumbler_settings';
const PASSCODE_KEY = 'tumbler_passcode';

export type BackendSettings = {
  apiBaseUrl: string;
  streamUrl: string;
  deviceId: string;
  apiKey: string;
};

export const defaultSettings: BackendSettings = {
  apiBaseUrl: 'http://192.168.1.100:8080',
  streamUrl: '',
  deviceId: 'tumbler-01',
  apiKey: '',
};

async function useSecureStore(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function loadSettings(): Promise<BackendSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return { ...defaultSettings };
  try {
    return { ...defaultSettings, ...JSON.parse(raw) };
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
