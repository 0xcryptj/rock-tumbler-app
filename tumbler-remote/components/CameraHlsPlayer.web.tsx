import Hls from 'hls.js';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  playlistUrl: string;
  headers?: Record<string, string>;
  onReady?: () => void;
  onError?: (message: string) => void;
};

/**
 * Live HLS via hls.js (standard browser approach — same tech as most IP camera web viewers).
 */
export function CameraHlsPlayer({ playlistUrl, headers, onReady, onError }: Props) {
  const hostRef = useRef<View | null>(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  const headersRef = useRef(headers);
  headersRef.current = headers;

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
      video.controls = false;
      video.style.cssText =
        'width:100%;height:100%;object-fit:contain;background:#000;display:block;';
      host.appendChild(video);

      const fail = (message: string) => {
        if (!cancelled) onErrorRef.current?.(message);
      };

      const markReady = () => {
        if (!cancelled) onReadyRef.current?.();
      };

      const startTimeout = window.setTimeout(() => {
        fail('Camera slow to start — check gateway + go2rtc, then Stop → Play');
      }, 20_000);

      const clearStartTimeout = () => window.clearTimeout(startTimeout);

      const xhrSetup = headersRef.current
        ? (xhr: XMLHttpRequest) => {
            for (const [key, value] of Object.entries(headersRef.current!)) {
              xhr.setRequestHeader(key, value);
            }
          }
        : undefined;

      let hls: Hls | null = null;

      const onPlaying = () => {
        clearStartTimeout();
        markReady();
      };

      video.addEventListener('playing', onPlaying, { once: true });

      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playlistUrl;
        void video.play().catch(() => {
          video.muted = true;
          void video.play();
        });
      } else if (Hls.isSupported()) {
        hls = new Hls({
          lowLatencyMode: true,
          liveSyncDurationCount: 3,
          maxLiveSyncPlaybackRate: 1.5,
          xhrSetup,
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            fail(data.details || 'HLS playback failed');
          }
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          void video.play().catch(() => {
            video.muted = true;
            void video.play();
          });
        });
        hls.loadSource(playlistUrl);
        hls.attachMedia(video);
      } else {
        clearStartTimeout();
        fail('This browser cannot play HLS — try Chrome or Safari');
        return;
      }

      cleanup = () => {
        clearStartTimeout();
        video.removeEventListener('playing', onPlaying);
        video.pause();
        video.removeAttribute('src');
        video.load();
        hls?.destroy();
        host.replaceChildren();
      };
    };

    mountPlayer();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [playlistUrl]);

  return <View ref={hostRef} style={styles.fill} collapsable={false} />;
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
});
