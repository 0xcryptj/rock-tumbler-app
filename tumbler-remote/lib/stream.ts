import { apiUrl, ENDPOINTS } from '@/lib/endpoints';import { apiHeaders } from '@/lib/api';
import { getStreamStartPayload } from '@/lib/playbackCapabilities';
import type { BackendSettings } from './storage';

export type StreamProtocol = 'mse' | 'hls' | 'mp4';

export type StreamSession = {
  sessionId: string;
  playbackUrl: string;
  wsUrl?: string;
  popoutUrl?: string;
  protocol: StreamProtocol;
  expiresAt: string;
};

export function extractSessionToken(session: StreamSession): string | null {
  try {
    const raw = (session.wsUrl || session.playbackUrl).replace(/^ws/i, 'http');
    return new URL(raw).searchParams.get('token');
  } catch {
    return null;
  }
}

export function getHlsPlaybackUrl(session: StreamSession, settings: BackendSettings): string {
  if (session.protocol === 'hls') {
    return session.playbackUrl;
  }
  const token = extractSessionToken(session);
  if (!token) {
    throw new Error('Missing stream session token');
  }
  return apiUrl(
    settings,
    `/api/hls/${session.sessionId}/stream.m3u8?token=${encodeURIComponent(token)}&mp4`
  );
}

export function getHlsPopoutUrl(session: StreamSession, settings: BackendSettings): string {
  const token = extractSessionToken(session);
  if (!token) {
    throw new Error('Missing stream session token');
  }
  return apiUrl(settings, `/api/player/${session.sessionId}/hls?token=${encodeURIComponent(token)}`);
}

/** Pop-out or embedded player URL for the session's protocol. */
export function getPopoutPlayerUrl(session: StreamSession, settings?: BackendSettings): string {
  if (session.protocol === 'hls' && settings) {
    return getHlsPopoutUrl(session, settings);
  }
  if (session.popoutUrl) {
    return session.popoutUrl;
  }
  if (settings) {
    const token = extractSessionToken(session);
    if (token) {
      return apiUrl(settings, `/api/player/${session.sessionId}/live?token=${encodeURIComponent(token)}`);
    }
  }
  return session.playbackUrl;
}

export async function startStreamSession(settings: BackendSettings): Promise<StreamSession> {
  let response: Response;
  try {
    response = await fetch(apiUrl(settings, ENDPOINTS.streamStart), {
      method: 'POST',
      headers: apiHeaders(settings),
      body: JSON.stringify({
        deviceId: settings.deviceId,
        ...getStreamStartPayload(),
      }),
    });
  } catch (err) {
    if (err instanceof TypeError && /fetch/i.test(err.message)) {
      throw new Error(
        `Cannot reach gateway at ${settings.apiBaseUrl} — same Wi‑Fi, npm run start, Settings → API URL`
      );
    }
    throw err;
  }

  if (!response.ok) {
    let detail = '';
    try {
      const err = (await response.json()) as { error?: string; detail?: string; hint?: string };
      detail = [err.error, err.detail, err.hint].filter(Boolean).join(' — ');
    } catch {
      detail = await response.text();
    }
    throw new Error(detail || `Stream start failed (${response.status})`);
  }

  const data = (await response.json()) as StreamSession;
  if (!data.playbackUrl || !data.sessionId) {
    throw new Error('Invalid stream session response');
  }
  return data;
}

export async function stopStreamSession(
  settings: BackendSettings,
  sessionId: string
): Promise<void> {
  const response = await fetch(apiUrl(settings, ENDPOINTS.streamStop), {
    method: 'POST',
    headers: apiHeaders(settings),
    body: JSON.stringify({ sessionId, deviceId: settings.deviceId }),
  });

  if (!response.ok) {
    throw new Error(`Stream stop failed (${response.status})`);
  }
}
