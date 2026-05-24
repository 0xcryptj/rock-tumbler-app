import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  playerUrl: string;
  onReady?: () => void;
  onError?: (message: string) => void;
};

/**
 * Embeds the gateway HTML player (native <video> + fragmented MP4).
 * expo-video on web cannot play this stream reliably; this path matches Pop out.
 */
export function CameraGatewayPlayer({ playerUrl, onReady, onError }: Props) {
  const hostRef = useRef<View | null>(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const readyRef = useRef(false);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    readyRef.current = false;

    const failTimer = window.setTimeout(() => {
      if (!readyRef.current) {
        onErrorRef.current?.(
          'No video — wake the camera in the Tapo app, then tap Play again'
        );
      }
    }, 25_000);

    const mountPlayer = () => {
      const host = hostRef.current as unknown as HTMLElement | null;
      if (!host) {
        requestAnimationFrame(mountPlayer);
        return;
      }
      if (cancelled) return;

      host.replaceChildren();

      const iframe = document.createElement('iframe');
      iframe.src = playerUrl;
      iframe.setAttribute('allow', 'autoplay; fullscreen');
      iframe.setAttribute('title', 'Live camera');
      iframe.style.cssText = 'width:100%;height:100%;border:0;background:#000;display:block;';
      iframe.onload = () => {
        readyRef.current = true;
        window.clearTimeout(failTimer);
        onReadyRef.current?.();
      };
      iframe.onerror = () => {
        window.clearTimeout(failTimer);
        onErrorRef.current?.('Camera player failed to load');
      };
      host.appendChild(iframe);

      cleanup = () => {
        host.replaceChildren();
      };
    };

    mountPlayer();

    return () => {
      cancelled = true;
      window.clearTimeout(failTimer);
      cleanup?.();
    };
  }, [playerUrl]);

  return <View ref={hostRef} style={styles.fill} collapsable={false} />;
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 0,
  },
});
