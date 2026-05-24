import { View } from 'react-native';

/** Native builds use MP4 + expo-video; MSE embed is web-only. */
export function CameraMseEmbed(_props: {
  wsUrl: string;
  onReady?: () => void;
  onError?: (message: string) => void;
}) {
  return <View />;
}
