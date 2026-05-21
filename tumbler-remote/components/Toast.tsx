import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, typography, xpRaised } from '@/constants/theme';

export type ToastStage = 'loading' | 'success' | 'stopped' | null;

type Props = {
  stage: ToastStage;
  message: string;
};

export function Toast({ stage, message }: Props) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(stage ? 1 : 0, { duration: 200 });
  }, [stage, opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!stage) return null;

  return (
    <Animated.View style={[styles.wrap, animStyle]} pointerEvents="none">
      <View style={[xpRaised, styles.toast]}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 48,
    alignSelf: 'center',
    zIndex: 100,
  },
  toast: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.face,
  },
  text: { ...typography.body, color: colors.text, fontWeight: '700' },
});
