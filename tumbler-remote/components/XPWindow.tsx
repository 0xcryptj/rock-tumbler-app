import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, spacing, typography } from '@/constants/theme';

type Props = {
  title: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
};

export function XPWindow({ title, children, style, bodyStyle }: Props) {
  return (
    <View style={[styles.frame, style]}>
      <LinearGradient colors={[...gradients.titleBar]} style={styles.titleBar}>
        <Text style={styles.titleText} numberOfLines={1}>
          {title}
        </Text>
      </LinearGradient>
      <View style={[styles.body, bodyStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 2,
    borderColor: colors.windowBorder,
    overflow: 'hidden',
  },
  titleBar: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    minHeight: 28,
    justifyContent: 'center',
  },
  titleText: {
    ...typography.title,
    color: colors.titleText,
    fontWeight: '700',
  },
  body: {
    backgroundColor: colors.face,
    padding: spacing.md,
  },
});
