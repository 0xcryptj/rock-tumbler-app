import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

const CODECS = ['avc1.640029', 'avc1.64002A', 'avc1.640033', 'mp4a.40.2', 'mp4a.40.5'];

type Props = {
  wsUrl: string;
  onReady?: () => void;
  onError?: (message: string) => void;
};

function supportedCodecs(): string {
  return CODECS.filter((c) => MediaSource.isTypeSupported(`video/mp4; codecs="${c}"`)).join();
}

/**
 * go2rtc MSE over WebSocket — mirrors gateway msePlayerHtml (proven in Pop out tab).
 * Effect depends only on wsUrl; callbacks use refs so parent re-renders do not tear down the socket.
 */
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

      host.replaceChildren();

      const video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.style.cssText =
        'width:100%;height:100%;object-fit:contain;background:#000;display:block;';
      host.appendChild(video);

      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      let ms: MediaSource;
      let sb: SourceBuffer | null = null;
      const buf = new Uint8Array(2 * 1024 * 1024);
      let bufLen = 0;
      let gotFrame = false;
      let objectUrl = '';

      const fail = (message: string) => {
        if (cancelled || gotFrame) return;
        onErrorRef.current?.(message);
      };

      const startTimeout = window.setTimeout(() => {
        if (!gotFrame) {
          fail('No video — confirm gateway + go2rtc running, Tapo live view on');
          ws.close();
        }
      }, 15_000);

      const markReady = () => {
        if (gotFrame) return;
        gotFrame = true;
        window.clearTimeout(startTimeout);
        onReadyRef.current?.();
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          const msg = JSON.parse(ev.data) as { type?: string; value?: string };
          if (msg.type !== 'mse' || sb) return;
          sb = ms.addSourceBuffer(msg.value!);
          sb.mode = 'segments';
          sb.addEventListener('updateend', () => {
            if (sb && !sb.updating && bufLen > 0) {
              try {
                sb.appendBuffer(buf.slice(0, bufLen));
                bufLen = 0;
              } catch {
                /* wait for next updateend */
              }
            }
            if (!gotFrame && video.readyState >= 2) {
              markReady();
            }
          });
          return;
        }
        if (!sb) return;
        if (sb.updating || bufLen > 0) {
          const chunk = new Uint8Array(ev.data as ArrayBuffer);
          if (bufLen + chunk.byteLength > buf.length) {
            fail('Stream buffer overflow — press Stop then Play');
            ws.close();
            return;
          }
          buf.set(chunk, bufLen);
          bufLen += chunk.byteLength;
        } else {
          try {
            sb.appendBuffer(ev.data as ArrayBuffer);
          } catch {
            /* wait for updateend */
          }
        }
      };

      ws.onerror = () => {
        fail(`WebSocket failed — check API URL (${wsUrl.replace(/^wss?:\/\//, '').split('/')[0]})`);
      };

      ws.onclose = (ev) => {
        if (!gotFrame && ev.code !== 1000) {
          fail('Stream closed — press Play again');
        }
      };

      ms = new MediaSource();
      objectUrl = URL.createObjectURL(ms);
      video.src = objectUrl;
      ms.addEventListener(
        'sourceopen',
        () => {
          ws.send(JSON.stringify({ type: 'mse', value: supportedCodecs() }));
        },
        { once: true }
      );

      video.play().catch(() => {
        video.muted = true;
        void video.play();
      });

      cleanup = () => {
        window.clearTimeout(startTimeout);
        ws.onclose = null;
        ws.close();
        video.pause();
        video.removeAttribute('src');
        video.load();
        host.replaceChildren();
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      };
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
