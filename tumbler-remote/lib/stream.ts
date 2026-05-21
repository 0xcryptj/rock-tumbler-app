import type { BackendSettings, StreamPreference } from './storage';
import { apiHeaders } from './api';

export type StreamProtocol = 'webrtc' | 'hls';

export type StreamSession = {
  sessionId: string;
  /** Tokenized URL safe for the app — never the camera RTSP URI. */
  playbackUrl: string;
  protocol: StreamProtocol;
  expiresAt: string;
};

type StartStreamBody = {
  deviceId: string;
  preference: StreamPreference;
};

type StopStreamBody = {
  sessionId: string;
  deviceId: string;
};

function apiBase(settings: BackendSettings): string {
  return settings.apiBaseUrl.replace(/\/$/, '');
}

/**
 * Ask backend to start go2rtc relay and return a short-lived WebRTC or HLS playback URL.
 * Camera RTSP stays on LAN; only the gateway sees rtsp://user:pass@CAMERA_IP:554/stream1
 */
export async function startStreamSession(settings: BackendSettings): Promise<StreamSession> {
  const response = await fetch(`${apiBase(settings)}/api/stream/start`, {
    method: 'POST',
    headers: apiHeaders(settings),
    body: JSON.stringify({
      deviceId: settings.deviceId,
      preference: settings.streamPreference,
    } satisfies StartStreamBody),
  });

  if (!response.ok) {
    throw new Error(`Stream start failed (${response.status})`);
  }

  const data = (await response.json()) as StreamSession;
  if (!data.playbackUrl || !data.sessionId) {
    throw new Error('Invalid stream session response');
  }
  return data;
}

/** Tell backend to tear down relay / viewer slot when user stops playback. */
export async function stopStreamSession(
  settings: BackendSettings,
  sessionId: string
): Promise<void> {
  const response = await fetch(`${apiBase(settings)}/api/stream/stop`, {
    method: 'POST',
    headers: apiHeaders(settings),
    body: JSON.stringify({
      sessionId,
      deviceId: settings.deviceId,
    } satisfies StopStreamBody),
  });

  if (!response.ok) {
    throw new Error(`Stream stop failed (${response.status})`);
  }
}
