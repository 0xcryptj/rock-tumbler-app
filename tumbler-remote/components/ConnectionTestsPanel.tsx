import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { XPButton } from '@/components/XPButton';
import {
  runConnectionTests,
  type ConnectionTestResult,
  type TestStatus,
} from '@/lib/connectionTests';
import type { BackendSettings } from '@/lib/storage';
import { colors, spacing, typography, xpSunken } from '@/constants/theme';

type Props = {
  settings: BackendSettings;
};

const STATUS_COLOR: Record<TestStatus, string> = {
  idle: colors.disabled,
  running: colors.selection,
  pass: colors.startGreen,
  fail: colors.error,
  skip: colors.orange,
};

const STATUS_ICON: Record<TestStatus, string> = {
  idle: '○',
  running: '…',
  pass: '✓',
  fail: '✗',
  skip: '–',
};

export function ConnectionTestsPanel({ settings }: Props) {
  const [results, setResults] = useState<ConnectionTestResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setResults(null);
    try {
      await runConnectionTests(settings, setResults);
    } finally {
      setRunning(false);
    }
  }, [settings]);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Connection tests</Text>
        <XPButton
          label={running ? '…' : 'Run'}
          onPress={() => void handleRun()}
          disabled={running || !settings.apiBaseUrl.trim()}
          variant="primary"
          style={styles.runBtn}
        />
      </View>
      {running && !results ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.selection} size="small" />
          <Text style={styles.loadingText}>Gateway → ESP32 → camera (up to ~90s)</Text>
        </View>
      ) : null}
      {results?.map((row) => (
        <TestRow key={row.id} row={row} />
      ))}
    </View>
  );
}

function TestRow({ row }: { row: ConnectionTestResult }) {
  return (
    <View style={[styles.row, xpSunken]}>
      <Text style={[styles.icon, { color: STATUS_COLOR[row.status] }]}>{STATUS_ICON[row.status]}</Text>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {row.label}
        </Text>
        <Text style={styles.rowDetail} numberOfLines={3}>
          {row.detail}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    padding: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.shadow,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heading: { ...typography.body, fontWeight: '700', color: colors.text, flex: 1 },
  runBtn: { minWidth: 56, paddingHorizontal: 8 },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  loadingText: { ...typography.caption, color: colors.textMuted, flex: 1 },
  row: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: colors.face,
  },
  icon: { fontSize: 14, fontWeight: '700', width: 14, lineHeight: 18 },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { ...typography.caption, fontWeight: '700', color: colors.text },
  rowDetail: { ...typography.caption, color: colors.textMuted, fontSize: 11, lineHeight: 14 },
});
