import { Platform } from 'react-native';

export type StreamStartPayload = {
  platform: string;
  preference: 'auto' | 'hls' | 'mse';
  browser?: string;
};

/** Native apps — iOS WebKit prefers HLS (same engine as Safari). */
export function prefersHlsPlayback(): boolean {
  return Platform.OS === 'ios';
}

export function isSafariBrowser(): boolean {
  return false;
}

export function isIosBrowser(): boolean {
  return Platform.OS === 'ios';
}

export function getStreamStartPayload(): StreamStartPayload {
  if (Platform.OS === 'ios') {
    return { platform: 'ios', browser: 'safari', preference: 'hls' };
  }
  return { platform: Platform.OS, preference: 'auto' };
}
