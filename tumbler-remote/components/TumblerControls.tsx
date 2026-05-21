import { StyleSheet, View } from 'react-native';
import { XPButton } from '@/components/XPButton';
import { spacing } from '@/constants/theme';

type Props = {
  isRunning: boolean;
  isPending: boolean;
  onStart: () => void;
  onStop: () => void;
};

export function TumblerControls({ isRunning, isPending, onStart, onStop }: Props) {
  return (
    <View style={styles.row}>
      <XPButton
        label="Start"
        onPress={onStart}
        disabled={isRunning || isPending}
        variant="primary"
        style={styles.btn}
      />
      <XPButton
        label="Stop"
        onPress={onStop}
        disabled={!isRunning || isPending}
        style={styles.btn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  btn: { flex: 1 },
});
