import type { ViewStyle } from 'react-native';

/** Windows XP Luna theme */
export const colors = {
  desktop: '#3A6EA5',
  titleBarTop: '#0058E6',
  titleBarBottom: '#3A93F4',
  titleText: '#FFFFFF',
  windowBorder: '#0054E3',
  face: '#ECE9D8',
  faceDark: '#D4D0C8',
  highlight: '#FFFFFF',
  shadow: '#ACA899',
  darkShadow: '#716F64',
  text: '#000000',
  textMuted: '#444444',
  disabled: '#808080',
  selection: '#316AC5',
  startGreen: '#3C873C',
  startGreenDark: '#2D6B2D',
  error: '#CC0000',
  orange: '#C4A000',
  videoBg: '#000000',
  white: '#FFFFFF',
  /** legacy aliases */
  label: '#000000',
  muted: '#444444',
  faint: '#808080',
  bg: '#3A6EA5',
  bgDeep: '#2A5080',
  surface: '#ECE9D8',
  border: '#0054E3',
  accent: '#0058E6',
  accentDark: '#0046B8',
  green: '#3C873C',
  red: '#CC0000',
  logoPlate: '#D4D0C8',
  background: '#ECE9D8',
  secondaryLabel: '#444444',
  tertiaryLabel: '#808080',
  glassBorder: '#ACA899',
  glassFill: '#ECE9D8',
  glassFillStrong: '#D4D0C8',
  systemGray: '#D4D0C8',
  systemGray2: '#ACA899',
  videoBackground: '#000000',
  overlay: 'rgba(0,0,0,0.5)',
};

export const gradients = {
  titleBar: [colors.titleBarTop, colors.titleBarBottom] as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  screen: 12,
  buttonGap: 8,
};

export const radius = {
  sm: 0,
  md: 0,
  lg: 0,
};

export const typography = {
  largeTitle: { fontSize: 22, fontWeight: '700' as const },
  title: { fontSize: 13, fontWeight: '700' as const },
  headline: { fontSize: 13, fontWeight: '400' as const },
  body: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 11, fontWeight: '400' as const },
  micro: { fontSize: 11, fontWeight: '400' as const },
};

/** Raised XP control (buttons, inputs) */
export const xpRaised: ViewStyle = {
  backgroundColor: colors.face,
  borderTopWidth: 2,
  borderLeftWidth: 2,
  borderBottomWidth: 2,
  borderRightWidth: 2,
  borderTopColor: colors.highlight,
  borderLeftColor: colors.highlight,
  borderBottomColor: colors.darkShadow,
  borderRightColor: colors.darkShadow,
};

/** Sunken XP panel (text fields, video inset) */
export const xpSunken: ViewStyle = {
  backgroundColor: colors.white,
  borderTopWidth: 2,
  borderLeftWidth: 2,
  borderBottomWidth: 2,
  borderRightWidth: 2,
  borderTopColor: colors.darkShadow,
  borderLeftColor: colors.darkShadow,
  borderBottomColor: colors.highlight,
  borderRightColor: colors.highlight,
};

export const panel = {
  backgroundColor: colors.face,
  borderWidth: 2,
  borderColor: colors.windowBorder,
};
