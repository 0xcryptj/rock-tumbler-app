import { useEffect, useState, type ComponentProps } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { XPButton } from '@/components/XPButton';
import { XPDesktop } from '@/components/XPDesktop';
import { XPWindow } from '@/components/XPWindow';
import { colors, spacing, typography, xpRaised, xpSunken } from '@/constants/theme';
import { ConnectionTestsPanel } from '@/components/ConnectionTestsPanel';
import {
  ENDPOINTS,
  EXPO_WEB_PORT,
  GATEWAY_PORT,
  apiUrl,
  getDefaultApiBaseUrl,
  getLanAppPreviewUrl,
} from '@/lib/endpoints';
import type { BackendSettings } from '@/lib/storage';
import { defaultSettings, saveSettings, setPasscode } from '@/lib/storage';

type Props = {
  visible: boolean;
  settings: BackendSettings;
  onClose: () => void;
  onSave: (settings: BackendSettings) => void;
};

export function SettingsModal({ visible, settings, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(settings);
  const [newPasscode, setNewPasscode] = useState('');
  const [showEndpoints, setShowEndpoints] = useState(false);

  useEffect(() => {
    if (visible) setDraft(settings);
  }, [visible, settings]);

  const update = (key: keyof BackendSettings, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    await saveSettings(draft);
    if (newPasscode.length === 6) {
      await setPasscode(newPasscode);
      setNewPasscode('');
    }
    onSave(draft);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <XPDesktop style={styles.backdrop}>
        <SafeAreaView style={styles.safe}>
          <XPWindow title="Settings" style={styles.window} bodyStyle={styles.windowBody}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.form}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              <Field
                label="API base URL (gateway)"
                value={draft.apiBaseUrl}
                onChangeText={(v) => update('apiBaseUrl', v)}
                autoCapitalize="none"
                placeholder={getDefaultApiBaseUrl()}
              />
              <Text style={styles.hint}>
                API = your PC on port {GATEWAY_PORT} ({getDefaultApiBaseUrl()}), not the ESP32 IP. App UI uses
                port {EXPO_WEB_PORT} on the same PC.
              </Text>
              {draft.apiBaseUrl.replace(/\/$/, '') !== getDefaultApiBaseUrl() ? (
                <Text style={styles.warn}>
                  API URL differs from .env ({getDefaultApiBaseUrl()}) — wrong IP causes connection timeout.
                </Text>
              ) : null}

              <ConnectionTestsPanel settings={draft} />
              <Text style={styles.hint}>
                Tumbler relay: gateway POST /api/tumbler/start|stop → ESP32 D5 (GPIO5) at
                10.0.0.100. API URL = your PC on port 8080 (npm run start).
              </Text>

              <Field
                label="Device ID"
                value={draft.deviceId}
                onChangeText={(v) => update('deviceId', v)}
              />

              <Text style={styles.hint}>
                Camera RTSP is configured in gateway/.env only (not in this app). Video: RTSP → MP4.
              </Text>

              <Field
                label="API key (optional)"
                value={draft.apiKey}
                onChangeText={(v) => update('apiKey', v)}
                secureTextEntry
                autoCapitalize="none"
              />

              <Field
                label="New passcode (6 digits)"
                value={newPasscode}
                onChangeText={(v) => setNewPasscode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                secureTextEntry
              />

              <Pressable onPress={() => setShowEndpoints((v) => !v)} style={styles.endpointsToggle}>
                <Text style={styles.endpointsToggleText}>
                  {showEndpoints ? '▾ Hide endpoint URLs' : '▸ Show endpoint URLs'}
                </Text>
              </Pressable>
              {showEndpoints ? (
                <View style={styles.endpointBox}>
                  <Text style={styles.endpointLine}>App: {getLanAppPreviewUrl()}</Text>
                  <Text style={styles.endpointLine}>Health: {apiUrl(draft, ENDPOINTS.health)}</Text>
                  <Text style={styles.endpointLine}>
                    Play: {apiUrl(draft, ENDPOINTS.streamStart)}
                  </Text>
                  <Text style={styles.endpointLine}>
                    Tumbler: {apiUrl(draft, ENDPOINTS.tumblerStart)}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
            <View style={styles.footer}>
              <XPButton label="Cancel" onPress={onClose} style={styles.footerBtn} />
              <XPButton
                label="Reset"
                onPress={() => setDraft({ ...defaultSettings })}
                style={styles.footerBtn}
              />
              <XPButton label="OK" onPress={handleSave} variant="primary" style={styles.footerBtn} />
            </View>
          </XPWindow>
        </SafeAreaView>
      </XPDesktop>
    </Modal>
  );
}

function Field({
  label,
  ...props
}: { label: string } & ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={xpSunken}>
        <TextInput
          style={styles.input}
          placeholderTextColor={colors.disabled}
          {...props}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  safe: {
    flex: 1,
    padding: spacing.sm,
    justifyContent: 'center',
  },
  window: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    maxHeight: '94%',
  },
  windowBody: {
    flex: 1,
    padding: 0,
    minHeight: 0,
  },
  scroll: {
    flexGrow: 1,
    flexShrink: 1,
    maxHeight: 520,
  },
  form: {
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  field: { gap: 2 },
  label: { ...typography.caption, color: colors.text, fontWeight: '700' },
  hint: { ...typography.caption, color: colors.textMuted, fontSize: 11, lineHeight: 14 },
  warn: { ...typography.caption, color: colors.error, fontSize: 11, lineHeight: 14, fontWeight: '700' },
  input: {
    ...typography.body,
    fontSize: 14,
    color: colors.text,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: colors.white,
  },
  streamRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  streamChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.face,
  },
  streamChipSelected: {
    backgroundColor: colors.selection,
    borderTopColor: colors.darkShadow,
    borderLeftColor: colors.darkShadow,
  },
  streamChipText: { ...typography.caption, color: colors.text, fontWeight: '700' },
  streamChipTextOn: { color: colors.white },
  endpointsToggle: { paddingVertical: 4 },
  endpointsToggleText: { ...typography.caption, color: colors.selection, fontWeight: '700' },
  endpointBox: {
    gap: 2,
    padding: 6,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.shadow,
  },
  endpointLine: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: colors.shadow,
    padding: spacing.md,
    backgroundColor: colors.face,
  },
  footerBtn: { minWidth: 64 },
});
