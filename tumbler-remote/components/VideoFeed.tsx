import { useCallback, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography, xpRaised, xpSunken } from '@/constants/theme';

type Props = {
  streamUrl: string;
  isRunning: boolean;
  style?: StyleProp<ViewStyle>;
};

export function VideoFeed({ streamUrl, isRunning, style }: Props) {
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const hasStream = streamUrl.trim().length > 0;

  const player = useVideoPlayer(hasStream ? streamUrl : null, (p) => {
    p.loop = true;
    p.muted = true;
  });

  const togglePlay = useCallback(() => {
    if (!hasStream) return;
    if (playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
    }
  }, [hasStream, playing, player]);

  const openFullscreen = () => {
    if (hasStream && !playing) {
      player.play();
      setPlaying(true);
    }
    setFullscreen(true);
  };

  const closeFullscreen = () => setFullscreen(false);

  const showVideo = hasStream && playing;

  return (
    <>
      <View style={[styles.container, style]}>
        <View style={styles.surface}>
          {showVideo ? (
            <VideoView
              style={styles.video}
              player={player}
              contentFit="cover"
              nativeControls={false}
            />
          ) : (
            <View style={styles.placeholder}>
              <Pressable onPress={togglePlay}>
                {({ pressed }) => (
                  <View style={[styles.playButton, xpRaised, pressed && styles.playPressed]}>
                <Ionicons
                  name={hasStream ? 'play' : 'videocam-off-outline'}
                  size={24}
                  color={colors.text}
                />
                  </View>
                )}
              </Pressable>
              {!hasStream ? (
                <Text style={styles.offlineHint}>Set stream URL in Settings</Text>
              ) : null}
            </View>
          )}

          <View style={styles.badge}>
            <View
              style={[
                styles.badgeDot,
                {
                  backgroundColor:
                    isRunning && playing
                      ? colors.green
                      : hasStream
                        ? colors.orange
                        : colors.secondaryLabel,
                },
              ]}
            />
            <Text style={styles.badgeText}>
              {isRunning && playing ? 'LIVE' : hasStream ? 'READY' : 'OFFLINE'}
            </Text>
          </View>

          <Pressable onPress={openFullscreen} accessibilityLabel="Fullscreen video">
            {({ pressed }) => (
              <View style={[styles.expandBtn, xpRaised, pressed && styles.playPressed]}>
                <Ionicons name="expand-outline" size={14} color={colors.text} />
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <Modal
        visible={fullscreen}
        animationType="fade"
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={closeFullscreen}
      >
        <StatusBar style="light" />
        <View style={[styles.fullscreen, { width, height }]}>
          {showVideo ? (
            <VideoView
              style={StyleSheet.absoluteFill}
              player={player}
              contentFit="contain"
              nativeControls={false}
            />
          ) : (
            <View style={styles.fullscreenPlaceholder}>
              <Pressable style={styles.playButton} onPress={togglePlay}>
                <Ionicons name="play" size={40} color={colors.white} style={{ marginLeft: 4 }} />
              </Pressable>
            </View>
          )}

          <View style={[styles.fullscreenTopBar, { paddingTop: insets.top + spacing.sm }]}>
            <View style={styles.badge}>
              <View
                style={[
                  styles.badgeDot,
                  { backgroundColor: isRunning && playing ? colors.green : colors.secondaryLabel },
                ]}
              />
              <Text style={styles.badgeText}>
                {isRunning && playing ? 'LIVE' : 'Tumbler feed'}
              </Text>
            </View>
            <Pressable
              style={styles.closeBtn}
              onPress={closeFullscreen}
              accessibilityLabel="Close fullscreen"
            >
              <Ionicons name="contract-outline" size={22} color={colors.white} />
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 200,
    overflow: 'hidden',
    backgroundColor: colors.videoBg,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderTopColor: colors.darkShadow,
    borderLeftColor: colors.darkShadow,
    borderBottomColor: colors.highlight,
    borderRightColor: colors.highlight,
  },
  surface: {
    flex: 1,
    backgroundColor: colors.videoBg,
    overflow: 'hidden',
  },
  video: { ...StyleSheet.absoluteFillObject },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.faceDark,
  },
  playButton: {
    width: 48,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.face,
  },
  playPressed: {
    borderTopColor: colors.darkShadow,
    borderLeftColor: colors.darkShadow,
    borderBottomColor: colors.highlight,
    borderRightColor: colors.highlight,
  },
  offlineHint: { ...typography.caption, color: colors.text },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    ...xpRaised,
    backgroundColor: colors.face,
  },
  badgeDot: { width: 8, height: 8, backgroundColor: colors.disabled },
  badgeText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  expandBtn: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.face,
  },
  fullscreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullscreenPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
