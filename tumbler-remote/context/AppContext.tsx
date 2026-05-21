import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { sendTumblerCommand } from '@/lib/api';
import { loadSettings, type BackendSettings } from '@/lib/storage';

type AppContextValue = {
  settings: BackendSettings;
  isRunning: boolean;
  isPending: boolean;
  toastStage: 'loading' | 'success' | 'stopped' | null;
  toastMessage: string;
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
  const [isPending, setIsPending] = useState(false);
  const [toastStage, setToastStage] = useState<'loading' | 'success' | 'stopped' | null>(null);
  const [toastMessage, setToastMessage] = useState('');

  const refreshSettings = useCallback(async () => {
    setSettingsState(await loadSettings());
  }, []);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  const clearToast = useCallback(() => {
    setToastStage(null);
    setToastMessage('');
  }, []);

  const runCommand = useCallback(
    async (action: 'start' | 'stop') => {
      if (!settings || isPending) return;
      setIsPending(true);
      setToastStage('loading');
      setToastMessage(action === 'start' ? 'Sending command…' : 'Stopping tumbler…');

      try {
        await sendTumblerCommand(settings, action);
        if (action === 'start') {
          setIsRunning(true);
          setToastStage('success');
          setToastMessage('Tumbler started');
        } else {
          setIsRunning(false);
          setToastStage('stopped');
          setToastMessage('Tumbler stopped');
        }
      } catch {
        setToastStage('stopped');
        setToastMessage('Could not reach backend — demo mode');
        if (action === 'start') setIsRunning(true);
        else setIsRunning(false);
      } finally {
        setIsPending(false);
        setTimeout(clearToast, 1800);
      }
    },
    [settings, isPending, clearToast]
  );

  const value = useMemo<AppContextValue | null>(() => {
    if (!settings) return null;
    return {
      settings,
      isRunning,
      isPending,
      toastStage,
      toastMessage,
      refreshSettings,
      setSettings: setSettingsState,
      startTumbler: () => runCommand('start'),
      stopTumbler: () => runCommand('stop'),
      clearToast,
    };
  }, [
    settings,
    isRunning,
    isPending,
    toastStage,
    toastMessage,
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
