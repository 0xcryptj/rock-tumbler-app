import { View, type ViewStyle } from 'react-native';

type Props = {
  /** Flex grow factor (default 1). Use 0 for fixed-gap spacers with minHeight. */
  flex?: number;
  minHeight?: number;
  style?: ViewStyle;
};

/** Flexible layout spacer — pushes siblings apart in column/row flex containers. */
export function Spacer({ flex = 1, minHeight, style }: Props) {
  return <View style={[{ flex, minHeight }, style]} />;
}
