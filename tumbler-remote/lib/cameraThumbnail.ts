import { apiHeaders } from '@/lib/api';
import { apiUrl, ENDPOINTS } from '@/lib/endpoints';
import type { BackendSettings } from '@/lib/storage';

/** Snapshot URL for idle preview (go2rtc frame.jpeg or ffmpeg fallback on gateway). */
export function snapshotUrl(settings: BackendSettings, cacheBust = Date.now()): string {
  return `${apiUrl(settings, ENDPOINTS.cameraSnapshot)}?t=${cacheBust}`;
}

export function snapshotImageSource(settings: BackendSettings, cacheBust = Date.now()) {
  const uri = snapshotUrl(settings, cacheBust);
  const headers = apiHeaders(settings);
  return {
    uri,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };
}
