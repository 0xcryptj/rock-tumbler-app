/**
 * Matches firmware/esp32-tumbler-relay/esp32-tumbler-relay.ino JSON (/health, /start, /stop).
 */
export type Esp32MotorStatus = 'idle' | 'running';

export type Esp32RelayState = {
  ok: boolean;
  status: Esp32MotorStatus;
  deviceId?: string;
  ip?: string;
  relayPin?: number;
  relayPinLabel?: string;
  relayOnLevel?: string;
  gpioLevel?: string;
  relayActiveLow?: boolean;
  warning?: string;
};

export function parseEsp32RelayPayload(raw: Record<string, unknown>): Esp32RelayState | null {
  if (raw.ok !== true) {
    return null;
  }
  const status = raw.status === 'running' ? 'running' : raw.status === 'idle' ? 'idle' : null;
  if (!status) {
    return null;
  }
  return {
    ok: true,
    status,
    deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : undefined,
    ip: typeof raw.ip === 'string' ? raw.ip : undefined,
    relayPin: typeof raw.relayPin === 'number' ? raw.relayPin : undefined,
    relayPinLabel: typeof raw.relayPinLabel === 'string' ? raw.relayPinLabel : undefined,
    relayOnLevel: typeof raw.relayOnLevel === 'string' ? raw.relayOnLevel : undefined,
    gpioLevel: typeof raw.gpioLevel === 'string' ? raw.gpioLevel : undefined,
    relayActiveLow: raw.relayActiveLow === 1 || raw.relayActiveLow === true,
    warning: typeof raw.warning === 'string' ? raw.warning : undefined,
  };
}

export function formatRelaySummary(state: Esp32RelayState): string {
  const pin =
    state.relayPinLabel && state.relayPin !== undefined
      ? `${state.relayPinLabel}/GPIO${state.relayPin}`
      : state.relayPinLabel || (state.relayPin !== undefined ? `GPIO${state.relayPin}` : '');
  const parts = [state.status, pin, state.ip].filter(Boolean);
  return parts.join(' · ');
}
