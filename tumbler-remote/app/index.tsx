import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppLogo } from '@/components/AppLogo';
import { XPDesktop } from '@/components/XPDesktop';
import { XPWindow } from '@/components/XPWindow';
import { colors, spacing, typography } from '@/constants/theme';

export default function SplashRoute() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/pin'), 2000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <XPDesktop>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <View style={styles.center}>
          <XPWindow title="Tumblr Remote" style={styles.window}>
            <View style={styles.content}>
              <AppLogo size={64} />
              <Text style={styles.title}>Starting…</Text>
              <ActivityIndicator color={colors.selection} />
            </View>
          </XPWindow>
        </View>
      </SafeAreaView>
    </XPDesktop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.screen,
  },
  window: { maxWidth: 280, width: '100%', alignSelf: 'center' },
  content: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: { ...typography.headline, color: colors.text },
});
