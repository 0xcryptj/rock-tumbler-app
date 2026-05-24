import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@/constants/theme';

type Props = {
  isRunning: boolean;
  isPending: boolean;
  onStart: () => void;
  onStop: () => void;
};

const RAISED_BORDER: ViewStyle = {
  borderTopWidth: 2,
  borderLeftWidth: 2,
  borderBottomWidth: 2,
  borderRightWidth: 2,
};

type MediaButtonProps = {
  kind: 'play' | 'stop';
  label: string;
  disabled: boolean;
  onPress: () => void;
};

function MediaButton({ kind, label, disabled, onPress }: MediaButtonProps) {
  const isPlay = kind === 'play';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.btnOuter,
        disabled && styles.btnOuterDisabled,
        pressed && !disabled && styles.btnOuterPressed,
      ]}
    >
      <View
        style={[
          styles.btnFace,
          RAISED_BORDER,
          isPlay ? styles.playFace : styles.stopFace,
          disabled && styles.btnFaceDisabled,
        ]}
      >
        {isPlay ? (
          <View style={styles.playIconWrap}>
            <Ionicons name="play" size={28} color="#fff" style={styles.playIcon} />
          </View>
        ) : (
          <View style={styles.stopIcon} />
        )}
      </View>
      <Text style={[styles.caption, disabled && styles.captionDisabled]}>{label}</Text>
    </Pressable>
  );
}

export function TumblerControls({ isRunning, isPending, onStart, onStop }: Props) {
  return (
    <View style={styles.row}>
      <MediaButton
        kind="play"
        label="Play"
        disabled={isRunning || isPending}
        onPress={onStart}
      />
      <MediaButton
        kind="stop"
        label="Stop"
        disabled={!isRunning || isPending}
        onPress={onStop}
      />
    </View>
  );
}

const BTN = 52;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: spacing.lg,
    paddingTop: spacing.xs,
  },
  btnOuter: {
    alignItems: 'center',
    gap: 4,
  },
  btnOuterDisabled: {
    opacity: 0.45,
  },
  btnOuterPressed: {
    transform: [{ translateY: 1 }],
  },
  btnFace: {
    width: BTN,
    height: BTN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFaceDisabled: {},
  playFace: {
    backgroundColor: colors.startGreen,
    borderTopColor: '#6FD06F',
    borderLeftColor: '#6FD06F',
    borderBottomColor: colors.startGreenDark,
    borderRightColor: colors.startGreenDark,
  },
  stopFace: {
    backgroundColor: colors.error,
    borderTopColor: '#E85555',
    borderLeftColor: '#E85555',
    borderBottomColor: '#8B0000',
    borderRightColor: '#8B0000',
  },
  playIconWrap: {
    marginLeft: 4,
  },
  playIcon: {},
  stopIcon: {
    width: 18,
    height: 18,
    backgroundColor: '#fff',
  },
  caption: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  captionDisabled: {
    color: colors.textMuted,
  },
});
