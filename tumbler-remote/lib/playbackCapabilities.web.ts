import { Platform } from 'react-native';
import { browserSupportsMse } from '@/lib/go2rtcMsePlayer.web';

export type StreamStartPayload = {
  platform: string;
  preference: 'auto' | 'hls' | 'mse';
  browser?: string;
};

/** True for Safari and WebKit-based in-app browsers (excludes Chrome/Firefox/Edge on iOS). */
export function isSafariBrowser(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /Safari/i.test(userAgent) && !/Chrome|Chromium|CriOS|Edg|OPR|FxiOS|SamsungBrowser/i.test(userAgent);
}

/** iPhone, iPad, iPod, or iPadOS reporting as Mac with touch. */
export function isIosBrowser(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return true;
  }
  if (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
    return true;
  }
  return false;
}

/**
 * Safari / iOS should use native HLS — MSE is missing or unreliable (Shortcuts, Add to Home Screen, iPhone Safari).
 */
export function prefersHlsPlayback(): boolean {
  if (Platform.OS !== 'web') {
    return false;
  }
  if (isSafariBrowser() || isIosBrowser()) {
    return true;
  }
  return !browserSupportsMse();
}

export function getStreamStartPayload(): StreamStartPayload {
  if (Platform.OS !== 'web') {
    return { platform: Platform.OS, preference: 'auto' };
  }

  if (isSafariBrowser() || isIosBrowser()) {
    return { platform: 'web', browser: 'safari', preference: 'hls' };
  }

  return { platform: 'web', browser: 'default', preference: 'auto' };
}
