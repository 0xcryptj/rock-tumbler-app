import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

type Props = {
  size?: number;
  spinning?: boolean;
};

export function PixelDrum({ size = 140, spinning = false }: Props) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (spinning) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 3000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      rotation.value = withTiming(0, { duration: 300 });
    }
  }, [spinning, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Svg width={size} height={size} viewBox="0 0 16 16">
        <Rect width={16} height={16} fill="#FFFFFF" />
        <Rect x={5} y={1} width={6} height={1} fill="#000000" />
        <Rect x={3} y={2} width={2} height={1} fill="#000000" />
        <Rect x={11} y={2} width={2} height={1} fill="#000000" />
        <Rect x={2} y={3} width={1} height={2} fill="#000000" />
        <Rect x={13} y={3} width={1} height={2} fill="#000000" />
        <Rect x={1} y={5} width={1} height={6} fill="#000000" />
        <Rect x={14} y={5} width={1} height={6} fill="#000000" />
        <Rect x={2} y={11} width={1} height={2} fill="#000000" />
        <Rect x={13} y={11} width={1} height={2} fill="#000000" />
        <Rect x={3} y={13} width={2} height={1} fill="#000000" />
        <Rect x={11} y={13} width={2} height={1} fill="#000000" />
        <Rect x={5} y={14} width={6} height={1} fill="#000000" />
        <Rect x={3} y={3} width={11} height={11} fill="#1C1C1E" />
        <Rect x={7} y={5} width={2} height={1} fill="#AEAEB2" />
        <Rect x={6} y={6} width={4} height={1} fill="#8E8E93" />
        <Rect x={6} y={7} width={4} height={1} fill="#636366" />
        <Rect x={7} y={8} width={2} height={1} fill="#48484A" />
        <Rect x={7} y={9} width={2} height={1} fill="#3A3A3C" />
      </Svg>
    </Animated.View>
  );
}
