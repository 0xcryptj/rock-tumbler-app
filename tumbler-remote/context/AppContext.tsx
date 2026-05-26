import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchEsp32RelayState, sendTumblerCommand } from '@/lib/api';
import { formatRelaySummary, type Esp32RelayState } from '@/lib/esp32';
import { loadSettings, type BackendSettings } from '@/lib/storage';

type AppContextValue = {
  settings: BackendSettings;
  isRunning: boolean;
  relayState: Esp32RelayState | null;
  isPending: boolean;
  toastStage: 'loading' | 'success' | 'stopped' | null;
  toastMessage: string;
  refreshRelayState: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  setSettings: (s: BackendSettings) => void;
  startTumbler: () => Promise<void>;
  stopTumbler: () => Promise<void>;
  clearToast: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<BackendSettings | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [relayState, setRelayState] = useState<Esp32RelayState | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [toastStage, setToastStage] = useState<'loading' | 'success' | 'stopped' | null>(null);
  const [toastMessage, setToastMessage] = useState('');

  const refreshSettings = useCallback(async () => {
    setSettingsState(await loadSettings());
  }, []);

  const refreshRelayState = useCallback(async () => {
    if (!settings) return;
    const state = await fetchEsp32RelayState(settings);
    setRelayState(state);
    if (state) {
      setIsRunning(state.status === 'running');
    }
  }, [settings]);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    if (!settings) return;
    void refreshRelayState();
  }, [settings, refreshRelayState]);

  const clearToast = useCallback(() => {
    setToastStage(null);
    setToastMessage('');
  }, []);

  const runCommand = useCallback(
    async (action: 'start' | 'stop') => {
      if (!settings || isPending) return;
      setIsPending(true);
      setToastStage('loading');
      setToastMessage(action === 'start' ? 'Starting relay (D5)…' : 'Stopping relay…');

      try {
        const result = await sendTumblerCommand(settings, action);
        setRelayState(result);
        setIsRunning(result.status === 'running');
        const summary = formatRelaySummary(result);
        if (action === 'start') {
          setToastStage('success');
          setToastMessage(summary ? `Running — ${summary}` : 'Tumbler started');
        } else {
          setToastStage('stopped');
          setToastMessage(summary ? `Stopped — ${summary}` : 'Tumbler stopped');
        }
      } catch (err) {
        setToastStage('stopped');
        const msg = err instanceof Error ? err.message : 'Could not reach gateway or ESP32';
        setToastMessage(
          msg.includes('gateway') || msg.includes('fetch')
            ? `${msg} — check gateway is running and API URL (LAN or Tailscale) in Settings`
            : msg
        );
        void refreshRelayState();
      } finally {
        setIsPending(false);
        setTimeout(clearToast, 2200);
      }
    },
    [settings, isPending, clearToast, refreshRelayState]
  );

  const value = useMemo<AppContextValue | null>(() => {
    if (!settings) return null;
    return {
      settings,
      isRunning,
      relayState,
      isPending,
      toastStage,
      toastMessage,
      refreshRelayState,
      refreshSettings,
      setSettings: setSettingsState,
      startTumbler: () => runCommand('start'),
      stopTumbler: () => runCommand('stop'),
      clearToast,
    };
  }, [
    settings,
    isRunning,
    relayState,
    isPending,
    toastStage,
    toastMessage,
    refreshRelayState,
    refreshSettings,
    runCommand,
    clearToast,
  ]);

  if (!value) return null;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
