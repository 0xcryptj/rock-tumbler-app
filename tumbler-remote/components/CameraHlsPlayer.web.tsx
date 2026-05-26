import { useEffect, useRef } from 'react';

import { StyleSheet, View } from 'react-native';

import Hls from 'hls.js';

import { isSafariBrowser } from '@/lib/playbackCapabilities';



type Props = {

  playlistUrl: string;

  headers?: Record<string, string>;

  onReady?: () => void;

  onError?: (message: string) => void;

};



/**

 * Live HLS — Safari/iOS uses native video; others use hls.js.

 * Gateway stream.m3u8 returns a ready-to-play media playlist (init + segments rewritten).

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

      video.setAttribute('webkit-playsinline', '');

      video.controls = false;

      video.style.cssText =

        'width:100%;height:100%;object-fit:contain;background:#000;display:block;';

      host.appendChild(video);



      let ready = false;

      const fail = (message: string) => {

        if (!cancelled && !ready) onErrorRef.current?.(message);

      };



      const markReady = () => {

        if (cancelled || ready) return;

        ready = true;

        window.clearTimeout(startTimeout);

        onReadyRef.current?.();

      };



      const startTimeout = window.setTimeout(() => {

        if (!ready) {

          const code = video.error?.code;

          const detail = code ? ` (media error ${code})` : '';

          fail(`Camera slow to start${detail} — tap Retry, or wake camera in Tapo app`);

        }

      }, 25_000);



      const xhrSetup = headersRef.current

        ? (xhr: XMLHttpRequest) => {

            for (const [key, value] of Object.entries(headersRef.current!)) {

              xhr.setRequestHeader(key, value);

            }

          }

        : undefined;



      let hls: Hls | null = null;



      const onVideoProgress = () => markReady();

      video.addEventListener('playing', onVideoProgress);

      video.addEventListener('loadeddata', onVideoProgress);

      video.addEventListener('canplay', onVideoProgress);

      video.addEventListener('error', () => {

        const code = video.error?.code;

        fail(code ? `HLS playback failed (error ${code})` : 'HLS playback failed');

      });



      const useNativeHls = isSafariBrowser() || Boolean(video.canPlayType('application/vnd.apple.mpegurl'));



      if (useNativeHls) {

        video.src = playlistUrl;

        void video.play().catch(() => {

          video.muted = true;

          void video.play().catch(() => fail('Tap Play to allow video (Safari autoplay)'));

        });

      } else if (Hls.isSupported()) {

        hls = new Hls({

          lowLatencyMode: true,

          liveSyncDurationCount: 1,

          liveMaxLatencyDurationCount: 2,

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

        window.clearTimeout(startTimeout);

        fail('This browser cannot play HLS');

      }



      cleanup = () => {

        window.clearTimeout(startTimeout);

        video.removeEventListener('playing', onVideoProgress);

        video.removeEventListener('loadeddata', onVideoProgress);

        video.removeEventListener('canplay', onVideoProgress);

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


