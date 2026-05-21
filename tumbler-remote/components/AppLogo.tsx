import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import { images } from '@/constants/assets';
import { colors, xpRaised } from '@/constants/theme';

type Props = {
  size?: number;
  style?: StyleProp<ImageStyle>;
};

export function AppLogo({ size = 48, style }: Props) {
  return (
    <View style={[xpRaised, styles.plate, { width: size, height: size }]}>
      <Image
        source={images.logo}
        style={[styles.image, { width: size - 8, height: size - 8 }, style]}
        resizeMode="contain"
        accessibilityLabel="Tumblr app logo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.face,
  },
  image: {},
});
