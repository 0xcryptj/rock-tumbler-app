import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppLogo } from '@/components/AppLogo';
import { SettingsModal } from '@/components/SettingsModal';
import { Toast } from '@/components/Toast';
import { TumblerControls } from '@/components/TumblerControls';
import { VideoFeed } from '@/components/VideoFeed';
import { XPDesktop } from '@/components/XPDesktop';
import { XPWindow } from '@/components/XPWindow';
import { colors, spacing, typography, xpRaised } from '@/constants/theme';
import { useApp } from '@/context/AppContext';

export default function DashboardScreen() {
  const {
    settings,
    isRunning,
    relayState,
    isPending,
    toastStage,
    toastMessage,
    setSettings,
    startTumbler,
    stopTumbler,
  } = useApp();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <XPDesktop>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <Toast stage={toastStage} message={toastMessage} />

        <XPWindow title="Tumblr Remote" style={styles.window} bodyStyle={styles.body}>
          <View style={styles.toolbar}>
            <View style={styles.brand}>
              <AppLogo size={32} />
              <View>
                <Text style={styles.statusLabel}>Status:</Text>
                <Text style={[styles.statusValue, isRunning && styles.statusRunning]}>
                  {isRunning ? 'Running' : 'Stopped'}
                </Text>
                {relayState ? (
                  <Text style={styles.relayDetail}>
                    {relayState.relayPinLabel ?? 'D5'}/GPIO{relayState.relayPin ?? 5}
                    {relayState.ip ? ` · ${relayState.ip}` : ''}
                  </Text>
                ) : null}
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.settingsBtn, xpRaised, pressed && styles.btnPressed]}
              onPress={() => setSettingsOpen(true)}
              accessibilityLabel="Settings"
            >
              <Ionicons name="settings-outline" size={18} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.videoWrap}>
            <VideoFeed settings={settings} isRunning={isRunning} style={styles.video} />
          </View>

          <TumblerControls
            isRunning={isRunning}
            isPending={isPending}
            onStart={() => void startTumbler()}
            onStop={() => void stopTumbler()}
          />
        </XPWindow>

        <SettingsModal
          visible={settingsOpen}
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={setSettings}
        />
      </SafeAreaView>
    </XPDesktop>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.screen,
  },
  window: { flex: 1, width: '100%' },
  body: { flex: 1, gap: spacing.md },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusLabel: { ...typography.caption, color: colors.textMuted },
  statusValue: { ...typography.headline, color: colors.text, fontWeight: '700' },
  statusRunning: { color: colors.startGreen },
  relayDetail: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  settingsBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    borderTopColor: colors.darkShadow,
    borderLeftColor: colors.darkShadow,
    borderBottomColor: colors.highlight,
    borderRightColor: colors.highlight,
  },
  videoWrap: { width: '100%' },
  video: { width: '100%' },
});
