import { useEffect, useState, type ComponentProps } from 'react';
import {
  Modal,
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
          <XPWindow title="Settings" style={styles.window}>
            <ScrollView contentContainerStyle={styles.form}>
              <Field
                label="API base URL"
                value={draft.apiBaseUrl}
                onChangeText={(v) => update('apiBaseUrl', v)}
                autoCapitalize="none"
              />
              <Field
                label="Stream URL"
                value={draft.streamUrl}
                onChangeText={(v) => update('streamUrl', v)}
                autoCapitalize="none"
              />
              <Field
                label="Device ID"
                value={draft.deviceId}
                onChangeText={(v) => update('deviceId', v)}
              />
              <Field
                label="API key"
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
            </ScrollView>
            <View style={styles.footer}>
              <XPButton label="Cancel" onPress={onClose} style={styles.footerBtn} />
              <XPButton label="Reset" onPress={() => setDraft({ ...defaultSettings })} style={styles.footerBtn} />
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
    padding: spacing.screen,
    justifyContent: 'center',
  },
  window: { maxHeight: '90%' },
  form: { gap: spacing.md, paddingBottom: spacing.sm },
  field: { gap: 4 },
  label: { ...typography.body, color: colors.text, fontWeight: '700' },
  input: {
    ...typography.body,
    color: colors.text,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: colors.white,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: colors.shadow,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  footerBtn: { minWidth: 72 },
});
