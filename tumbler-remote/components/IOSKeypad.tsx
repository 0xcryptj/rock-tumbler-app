import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, typography, xpRaised } from '@/constants/theme';

const KEYS: { digit: string; letters?: string }[][] = [
  [{ digit: '1' }, { digit: '2' }, { digit: '3' }],
  [{ digit: '4' }, { digit: '5' }, { digit: '6' }],
  [{ digit: '7' }, { digit: '8' }, { digit: '9' }],
  [{ digit: '' }, { digit: '0' }, { digit: 'del' }],
];

type Props = {
  onDigit: (digit: string) => void;
  onDelete: () => void;
};

export function IOSKeypad({ onDigit, onDelete }: Props) {
  const press = (digit: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (digit === 'del') onDelete();
    else if (digit) onDigit(digit);
  };

  return (
    <View style={styles.grid}>
      {KEYS.flat().map((key, index) => {
        if (!key.digit && index === 9) {
          return <View key="empty" style={styles.key} />;
        }
        if (key.digit === 'del') {
          return (
            <Pressable key="del" onPress={() => press('del')}>
              {({ pressed }) => (
                <View style={[styles.key, xpRaised, pressed && styles.pressed]}>
                  <Text style={styles.keyDigit}>←</Text>
                </View>
              )}
            </Pressable>
          );
        }
        if (!key.digit) return <View key={`e-${index}`} style={styles.key} />;

        return (
          <Pressable key={key.digit} onPress={() => press(key.digit)}>
            {({ pressed }) => (
              <View style={[styles.key, xpRaised, pressed && styles.pressed]}>
                <Text style={styles.keyDigit}>{key.digit}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 56 * 3 + 8 * 2,
    gap: 8,
    alignSelf: 'center',
  },
  key: {
    width: 56,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.face,
  },
  pressed: {
    borderTopColor: colors.darkShadow,
    borderLeftColor: colors.darkShadow,
    borderBottomColor: colors.highlight,
    borderRightColor: colors.highlight,
  },
  keyDigit: { ...typography.headline, color: colors.text, fontSize: 16 },
});
