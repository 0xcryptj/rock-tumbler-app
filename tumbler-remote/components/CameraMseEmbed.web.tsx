import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { mountGo2rtcMsePlayer } from '@/lib/go2rtcMsePlayer.web';

type Props = {
  wsUrl: string;
  onReady?: () => void;
  onError?: (message: string) => void;
};

/** go2rtc MSE over WebSocket with live-edge sync (low latency). */
export function CameraMseEmbed({ wsUrl, onReady, onError }: Props) {
  const hostRef = useRef<View | null>(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    const mountPlayer = () => {
      const host = hostRef.current as unknown as HTMLElement | null;
      if (!host) {
        requestAnimationFrame(mountPlayer);
        return;
      }
      if (cancelled) return;

      cleanup = mountGo2rtcMsePlayer(host, {
        wsUrl,
        onReady: () => onReadyRef.current?.(),
        onError: (message) => onErrorRef.current?.(message),
      });
    };

    mountPlayer();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [wsUrl]);

  return <View ref={hostRef} style={styles.fill} collapsable={false} />;
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 0,
  },
});
