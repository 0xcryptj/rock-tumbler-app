import { View } from 'react-native';

/** Native uses expo-video + HLS; hls.js player is web-only. */
export function CameraHlsPlayer(_props: {
  playlistUrl: string;
  headers?: Record<string, string>;
  onReady?: () => void;
  onError?: (message: string) => void;
}) {
  return <View />;
}
