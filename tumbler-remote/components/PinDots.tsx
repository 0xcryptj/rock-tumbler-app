import { StyleSheet, View } from 'react-native';
import { colors, xpSunken } from '@/constants/theme';

const PIN_LENGTH = 6;

type Props = { filled: number };

export function PinDots({ filled }: Props) {
  return (
    <View style={[xpSunken, styles.track]}>
      <View style={styles.row}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View key={i} style={[styles.dot, i < filled && styles.dotFilled]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.white,
  },
  row: { flexDirection: 'row', gap: 12 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 0,
    backgroundColor: colors.faceDark,
    borderWidth: 1,
    borderColor: colors.shadow,
  },
  dotFilled: { backgroundColor: colors.text },
});
