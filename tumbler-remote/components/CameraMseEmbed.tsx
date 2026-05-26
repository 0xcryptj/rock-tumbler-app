import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

type Props = {
  /** Pop-out MSE player page from gateway (includes live-edge sync). */
  playerUrl: string;
  onReady?: () => void;
  onError?: (message: string) => void;
};

/** Native: gateway MSE player in WebView (same low-latency path as web). */
export function CameraMseEmbed({ playerUrl, onReady, onError }: Props) {
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const readyRef = useRef(false);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    readyRef.current = false;
    const failTimer = setTimeout(() => {
      if (!readyRef.current) {
        onErrorRef.current?.('No video — wake the camera in the Tapo app, then tap Play again');
      }
    }, 18_000);
    return () => clearTimeout(failTimer);
  }, [playerUrl]);

  return (
    <View style={styles.fill} collapsable={false}>
      <WebView
        source={{ uri: playerUrl }}
        style={styles.webview}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        originWhitelist={['*']}
        onMessage={(event) => {
          if (event.nativeEvent.data === 'ready') {
            readyRef.current = true;
            onReadyRef.current?.();
          }
        }}
        onError={() => onErrorRef.current?.('Camera player failed to load')}
        onHttpError={() => onErrorRef.current?.('Camera player failed to load')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 0,
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
});
