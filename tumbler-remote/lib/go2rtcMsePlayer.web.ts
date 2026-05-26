/** go2rtc-style MSE player — chases the live edge instead of building a multi-second buffer. Web-only. */

const CODECS = ['avc1.640029', 'avc1.64002A', 'avc1.640033', 'mp4a.40.2', 'mp4a.40.5'];

/** Seconds of media kept in the SourceBuffer behind the live edge. */
export const MSE_LIVE_WINDOW_SEC = 2;

export type Go2rtcMsePlayerOptions = {
  wsUrl: string;
  liveWindowSec?: number;
  onReady?: () => void;
  onError?: (message: string) => void;
  startTimeoutMs?: number;
};

export function browserSupportsMse(): boolean {
  if (typeof window === 'undefined') return false;
  return 'MediaSource' in window || 'ManagedMediaSource' in window;
}

function supportedCodecs(): string {
  const probe = window.MediaSource?.isTypeSupported.bind(window.MediaSource);
  if (!probe) return CODECS.join();
  return CODECS.filter((c) => probe(`video/mp4; codecs="${c}"`)).join();
}

function sendMseRequest(ws: WebSocket) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'mse', value: supportedCodecs() }));
}

export function mountGo2rtcMsePlayer(
  host: HTMLElement,
  { wsUrl, liveWindowSec = MSE_LIVE_WINDOW_SEC, onReady, onError, startTimeoutMs = 15_000 }: Go2rtcMsePlayerOptions
): () => void {
  if (!browserSupportsMse()) {
    onError?.('MSE not supported in this browser — use HLS fallback');
    return () => {};
  }

  host.replaceChildren();

  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
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
    if (gotFrame) return;
    onError?.(message);
  };

  const startTimeout = window.setTimeout(() => {
    if (!gotFrame) {
      fail('No video — wake the camera in the Tapo app, then tap Play again');
      ws.close();
    }
  }, startTimeoutMs);

  const markReady = () => {
    if (gotFrame) return;
    gotFrame = true;
    window.clearTimeout(startTimeout);
    onReady?.();
    if (typeof (window as unknown as { ReactNativeWebView?: { postMessage: (msg: string) => void } }).ReactNativeWebView?.postMessage === 'function') {
      (window as unknown as { ReactNativeWebView: { postMessage: (msg: string) => void } }).ReactNativeWebView.postMessage('ready');
    }
  };

  const trimToLiveEdge = () => {
    if (!sb || sb.updating || !sb.buffered.length) return;

    const end = sb.buffered.end(sb.buffered.length - 1);
    const liveStart = Math.max(sb.buffered.start(0), end - liveWindowSec);
    const bufferStart = sb.buffered.start(0);

    if (liveStart > bufferStart + 0.05) {
      try {
        sb.remove(bufferStart, liveStart);
      } catch {
        /* wait for next updateend */
      }
      try {
        ms.setLiveSeekableRange(liveStart, end);
      } catch {
        /* optional API */
      }
    }

    if (video.currentTime < liveStart) {
      video.currentTime = liveStart;
    }

    const gap = end - video.currentTime;
    if (gap > 0.15) {
      video.playbackRate = Math.min(3, Math.max(1.25, gap));
    } else if (gap > 0.04) {
      video.playbackRate = 1.05;
    } else {
      video.playbackRate = 1;
    }

    if (!gotFrame && video.readyState >= 2) {
      markReady();
    }
  };

  const bindSourceOpen = () => {
    ms.addEventListener(
      'sourceopen',
      () => {
        sendMseRequest(ws);
      },
      { once: true }
    );
  };

  const startMsePipeline = () => {
    ms = new MediaSource();
    objectUrl = URL.createObjectURL(ms);
    video.src = objectUrl;
    bindSourceOpen();
    video.addEventListener('playing', () => markReady(), { once: true });
    video.play().catch(() => {
      video.muted = true;
      void video.play();
    });
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
        trimToLiveEdge();
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

  ws.addEventListener(
    'open',
    () => {
      startMsePipeline();
    },
    { once: true }
  );

  return () => {
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
}
