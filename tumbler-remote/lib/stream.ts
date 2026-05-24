import { apiUrl, ENDPOINTS } from '@/lib/endpoints';
import { apiHeaders } from '@/lib/api';
import type { BackendSettings } from './storage';

export type StreamProtocol = 'mp4';

export type StreamSession = {
  sessionId: string;
  playbackUrl: string;
  popoutUrl?: string;
  protocol: StreamProtocol;
  expiresAt: string;
};

export function getPopoutPlayerUrl(session: StreamSession): string {
  return session.popoutUrl || session.playbackUrl;
}

export async function startStreamSession(settings: BackendSettings): Promise<StreamSession> {
  let response: Response;
  try {
    response = await fetch(apiUrl(settings, ENDPOINTS.streamStart), {
      method: 'POST',
      headers: apiHeaders(settings),
      body: JSON.stringify({ deviceId: settings.deviceId }),
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
  return { ...data, protocol: 'mp4' };
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
