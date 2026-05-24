import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  /** Gateway /api/mse/.../player page (same player as go2rtc web UI). */
  playerUrl: string;
  onReady?: () => void;
  onError?: (message: string) => void;
};

/**
 * Web: embed gateway MSE player in an iframe (avoids duplicate DOM ids + Strict Mode WS teardown).
 */
export function CameraMsePlayer({ playerUrl, onReady, onError }: Props) {
  const readyRef = useRef(false);
  const failTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    readyRef.current = false;
    failTimerRef.current = window.setTimeout(() => {
      if (!readyRef.current) {
        onError?.(
          'No video — wake camera in its app, test http://127.0.0.1:1984 stream tumbler_cam, then Play again'
        );
      }
    }, 25_000);
    return () => {
      if (failTimerRef.current) {
        window.clearTimeout(failTimerRef.current);
      }
    };
  }, [playerUrl, onError]);

  const handleLoad = () => {
    readyRef.current = true;
    if (failTimerRef.current) {
      window.clearTimeout(failTimerRef.current);
    }
    onReady?.();
  };

  return (
    <View style={styles.fill} collapsable={false}>
      <iframe
        src={playerUrl}
        title="Tumbler camera"
        style={styles.iframe as object}
        allow="autoplay; fullscreen"
        onLoad={handleLoad}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 0,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iframe: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    border: 'none',
    backgroundColor: '#000',
    objectFit: 'contain',
  },
});
