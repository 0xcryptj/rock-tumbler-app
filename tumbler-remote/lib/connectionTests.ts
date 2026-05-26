import { Platform } from 'react-native';
import { apiUrl, ENDPOINTS } from '@/lib/endpoints';
import { apiHeaders } from './api';
import type { BackendSettings } from './storage';

export type TestStatus = 'idle' | 'running' | 'pass' | 'fail' | 'skip';

export type ConnectionTestId = 'gateway' | 'esp32' | 'camera';

export type ConnectionTestResult = {
  id: ConnectionTestId;
  label: string;
  status: TestStatus;
  detail: string;
};

type SystemCheckRow = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

const ALL_TESTS_TIMEOUT_MS = 120_000;

function result(
  id: ConnectionTestId,
  label: string,
  status: TestStatus,
  detail: string
): ConnectionTestResult {
  return { id, label, status, detail };
}

function mapGateway(checks: SystemCheckRow[]): ConnectionTestResult {
  const label = 'Gateway :8080';
  const gateway = checks.find((c) => c.id === 'gateway');
  const go2rtc = checks.find((c) => c.id === 'go2rtc');
  if (!gateway?.ok) {
    return result('gateway', label, 'fail', gateway?.detail || 'Backend not running — npm run start on PC');
  }
  if (!go2rtc?.ok) {
    return result('gateway', label, 'fail', go2rtc?.detail || 'go2rtc not ready');
  }
  return result('gateway', label, 'pass', `${gateway.detail} · ${go2rtc.detail}`);
}

function mapEsp32(checks: SystemCheckRow[]): ConnectionTestResult {
  const label = 'ESP32 relay';
  const esp = checks.find((c) => c.id === 'esp32');
  const cycle = checks.find((c) => c.id === 'esp32-cycle');
  if (!esp?.ok) {
    return result('esp32', label, 'fail', esp?.detail || 'ESP32 unreachable');
  }
  if (!cycle?.ok) {
    return result('esp32', label, 'fail', cycle?.detail || 'Start/stop failed');
  }
  return result('esp32', label, 'pass', `${esp.detail} · ${cycle.detail}`);
}

function mapCamera(
  checks: SystemCheckRow[],
  cameraLabel = 'Camera'
): ConnectionTestResult {
  const label = `${cameraLabel} (RTSP)`;
  const cam = checks.find((c) => c.id === 'camera');
  if (!cam) {
    return result('camera', label, 'skip', 'Camera check not run');
  }
  return result('camera', label, cam.ok ? 'pass' : 'fail', cam.detail);
}

export async function runConnectionTests(
  settings: BackendSettings,
  onUpdate?: (results: ConnectionTestResult[]) => void
): Promise<ConnectionTestResult[]> {
  const labels: Record<ConnectionTestId, string> = {
    gateway: 'Gateway :8080',
    esp32: 'ESP32 relay',
    camera: 'Camera (RTSP)',
  };

  let results: ConnectionTestResult[] = (['gateway', 'esp32', 'camera'] as ConnectionTestId[]).map(
    (id) => result(id, labels[id], 'running', 'Testing…')
  );
  const push = () => onUpdate?.([...results]);

  push();

  const base = settings.apiBaseUrl.trim();
  if (!base) {
    return (['gateway', 'esp32', 'camera'] as ConnectionTestId[]).map((id) =>
      result(id, labels[id], 'fail', id === 'gateway' ? 'Set API base URL' : 'Fix gateway URL first')
    );
  }

  if (/localhost|127\.0\.0\.1/i.test(base) && Platform.OS !== 'web') {
    return [
      result('gateway', labels.gateway, 'fail', 'Use gateway LAN or Tailscale URL, not localhost'),
      result('esp32', labels.esp32, 'skip', 'Fix gateway URL first'),
      result('camera', labels.camera, 'skip', 'Fix gateway URL first'),
    ];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ALL_TESTS_TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl(settings, ENDPOINTS.testAll), {
      headers: apiHeaders(settings),
      signal: controller.signal,
    });
    const data = (await response.json()) as {
      ok?: boolean;
      checks?: SystemCheckRow[];
      cameraLabel?: string;
      error?: string;
    };
    const checks = Array.isArray(data.checks) ? data.checks : [];
    const cameraLabel =
      typeof data.cameraLabel === 'string' && data.cameraLabel ? data.cameraLabel : 'Camera';

    if (!response.ok && checks.length === 0) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    results = [
      mapGateway(checks),
      checks.find((c) => c.id === 'gateway')?.ok ? mapEsp32(checks) : result('esp32', labels.esp32, 'skip', 'Fix gateway first'),
      checks.find((c) => c.id === 'gateway')?.ok
        ? mapCamera(checks, cameraLabel)
        : result('camera', `${cameraLabel} (RTSP)`, 'skip', 'Fix gateway first'),
    ];
    push();
    return results;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Test failed';
    const detail = msg.includes('abort')
      ? 'Timeout — is the gateway running (npm run start)?'
      : msg.includes('Failed to fetch') || msg.includes('Network')
        ? 'Cannot reach gateway — check LAN or Tailscale URL in Settings'
        : msg;
    return [
      result('gateway', labels.gateway, 'fail', detail),
      result('esp32', labels.esp32, 'skip', 'Backend unreachable'),
      result('camera', labels.camera, 'skip', 'Backend unreachable'),
    ];
  } finally {
    clearTimeout(timeout);
  }
}
