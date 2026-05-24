/** @deprecated Video is always RTSP→MP4 via gateway. Kept for import compatibility. */
export type VideoRenderer = 'expo-video';

export function resolveVideoRenderer(): VideoRenderer {
  return 'expo-video';
}

export function rendererLabel(): string {
  return 'LIVE';
}
