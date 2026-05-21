import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IOSKeypad } from '@/components/IOSKeypad';
import { PinDots } from '@/components/PinDots';
import { XPDesktop } from '@/components/XPDesktop';
import { XPWindow } from '@/components/XPWindow';
import { colors, spacing, typography } from '@/constants/theme';
import { getPasscode } from '@/lib/storage';

const PIN_LENGTH = 6;

export default function PinScreen() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const tryUnlock = useCallback(
    async (code: string) => {
      const expected = await getPasscode();
      if (code === expected) {
        router.replace('/dashboard');
      } else {
        setError(true);
        setPin('');
        setTimeout(() => setError(false), 400);
      }
    },
    [router]
  );

  const onDigit = (digit: string) => {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === PIN_LENGTH) void tryUnlock(next);
  };

  return (
    <XPDesktop>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <XPWindow title="Enter passcode" style={styles.window} bodyStyle={styles.body}>
          <Text style={styles.hint}>Type your 6-digit passcode to continue.</Text>
          <View style={styles.pinArea}>
            <PinDots filled={pin.length} />
            {error ? <Text style={styles.error}>Incorrect passcode.</Text> : null}
          </View>
          <IOSKeypad onDigit={onDigit} onDelete={() => setPin((p) => p.slice(0, -1))} />
        </XPWindow>
      </SafeAreaView>
    </XPDesktop>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.screen,
    justifyContent: 'center',
  },
  window: { maxWidth: 360, width: '100%', alignSelf: 'center' },
  body: { gap: spacing.md },
  hint: { ...typography.body, color: colors.text },
  pinArea: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  error: { ...typography.caption, color: colors.error, fontWeight: '700' },
});
