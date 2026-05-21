import { StyleSheet, View, type ViewProps } from 'react-native';
import { colors } from '@/constants/theme';

export function XPDesktop({ children, style, ...props }: ViewProps) {
  return (
    <View style={[styles.desktop, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  desktop: {
    flex: 1,
    backgroundColor: colors.desktop,
  },
});
