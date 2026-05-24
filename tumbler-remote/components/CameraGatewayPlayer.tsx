import { View } from 'react-native';

/** Native builds use HLS/MP4 + expo-video; gateway iframe player is web-only. */
export function CameraGatewayPlayer(_props: {
  playerUrl: string;
  onReady?: () => void;
  onError?: (message: string) => void;
}) {
  return <View />;
}
