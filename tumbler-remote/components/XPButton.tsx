import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, typography, xpRaised } from '@/constants/theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary';
  style?: StyleProp<ViewStyle>;
  icon?: ReactNode;
};

export function XPButton({ label, onPress, disabled, variant = 'default', style, icon }: Props) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={style}>
      {({ pressed }) => (
        <View
          style={[
            styles.btn,
            xpRaised,
            variant === 'primary' && styles.primary,
            disabled && styles.disabled,
            pressed && !disabled && styles.pressed,
          ]}
        >
          {icon}
          <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 28,
    paddingHorizontal: 16,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primary: {
    backgroundColor: colors.startGreen,
    borderTopColor: '#5CB85C',
    borderLeftColor: '#5CB85C',
    borderBottomColor: colors.startGreenDark,
    borderRightColor: colors.startGreenDark,
  },
  pressed: {
    borderTopColor: colors.darkShadow,
    borderLeftColor: colors.darkShadow,
    borderBottomColor: colors.highlight,
    borderRightColor: colors.highlight,
    paddingTop: 7,
    paddingLeft: 17,
    paddingBottom: 5,
    paddingRight: 15,
  },
  disabled: {
    backgroundColor: colors.faceDark,
    opacity: 0.7,
  },
  label: {
    ...typography.body,
    color: colors.text,
    fontWeight: '400',
  },
  labelDisabled: { color: colors.disabled },
});
