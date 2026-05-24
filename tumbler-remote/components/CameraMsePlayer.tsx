import { View } from 'react-native';

/** Native uses MP4 + expo-video; iframe player is web-only. */
export function CameraMsePlayer(_props: {
  playerUrl: string;
  onReady?: () => void;
  onError?: (message: string) => void;
}) {
  return <View />;
}
