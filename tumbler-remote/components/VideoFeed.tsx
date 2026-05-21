import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { startStreamSession, stopStreamSession, type StreamSession } from '@/lib/stream';
import type { BackendSettings } from '@/lib/storage';
import { colors, spacing, typography, xpRaised, xpSunken } from '@/constants/theme';

type Props = {
  settings: BackendSettings;
  isRunning: boolean;
  style?: StyleProp<ViewStyle>;
};

type FeedState = 'idle' | 'connecting' | 'playing' | 'error';

/**
 * On-demand camera viewer. Does not connect until Play is pressed.
 * Playback URL comes from backend (go2rtc WebRTC/HLS), never raw Tapo RTSP.
 */
export function VideoFeed({ settings, isRunning, style }: Props) {
  const [feedState, setFeedState] = useState<FeedState>('idle');
  const [session, setSession] = useState<StreamSession | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const sessionRef = useRef<StreamSession | null>(null);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
    p.muted = true;
  });

  const releaseStream = useCallback(async () => {
    const active = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    player.pause();
    if (active) {
      try {
        await stopStreamSession(settings, active.sessionId);
      } catch {
        /* backend may already have closed session */
      }
    }
  }, [player, settings]);

  const stopPlayback = useCallback(async () => {
    await releaseStream();
    setFeedState('idle');
    setErrorMessage(null);
    setFullscreen(false);
  }, [releaseStream]);

  const startPlayback = useCallback(async () => {
    setFeedState('connecting');
    setErrorMessage(null);
    try {
      const next = await startStreamSession(settings);
      sessionRef.current = next;
      setSession(next);
      await player.replaceAsync(next.playbackUrl);
      player.play();
      setFeedState('playing');
    } catch (err) {
      sessionRef.current = null;
      setSession(null);
      setFeedState('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not start camera stream'
      );
    }
  }, [player, settings]);

  const togglePlay = useCallback(() => {
    if (feedState === 'playing' || feedState === 'connecting') {
      void stopPlayback();
    } else {
      void startPlayback();
    }
  }, [feedState, startPlayback, stopPlayback]);

  useEffect(() => {
    return () => {
      void releaseStream();
    };
  }, [releaseStream]);

  const openFullscreen = () => {
    if (feedState !== 'playing') void startPlayback();
    setFullscreen(true);
  };

  const badgeLabel =
    feedState === 'playing'
      ? session?.protocol === 'webrtc'
        ? 'LIVE WebRTC'
        : 'LIVE HLS'
      : feedState === 'connecting'
        ? 'CONNECTING'
        : feedState === 'error'
          ? 'ERROR'
          : 'TAPO C120';

  const badgeColor =
    feedState === 'playing' && isRunning
      ? colors.green
      : feedState === 'playing'
        ? colors.orange
        : feedState === 'error'
          ? colors.red
          : colors.disabled;

  return (
    <>
      <View style={[styles.container, style]}>
        <View style={styles.surface}>
          {feedState === 'playing' ? (
            <VideoView style={styles.video} player={player} contentFit="cover" nativeControls={false} />
          ) : (
            <View style={styles.placeholder}>
              {feedState === 'connecting' ? (
                <ActivityIndicator color={colors.selection} size="large" />
              ) : (
                <Pressable onPress={togglePlay}>
                  {({ pressed }) => (
                    <View style={[styles.playButton, xpRaised, pressed && styles.playPressed]}>
                      <Ionicons
                        name={feedState === 'error' ? 'refresh' : 'play'}
                        size={24}
                        color={colors.text}
                      />
                    </View>
                  )}
                </Pressable>
              )}
              <Text style={styles.hint}>
                {feedState === 'error'
                  ? errorMessage ?? 'Stream failed'
                  : feedState === 'connecting'
                    ? 'Starting Tapo C120 via backend…'
                    : 'Press Play for live view'}
              </Text>
              <Text style={styles.subhint}>RTSP stays on your LAN — not exposed to the app</Text>
            </View>
          )}

          {feedState === 'playing' ? (
            <Pressable
              style={({ pressed }) => [styles.stopOverlay, xpRaised, pressed && styles.playPressed]}
              onPress={() => void stopPlayback()}
            >
              <Ionicons name="stop" size={16} color={colors.text} />
              <Text style={styles.stopLabel}>Stop</Text>
            </Pressable>
          ) : null}

          <View style={styles.badge}>
            <View style={[styles.badgeDot, { backgroundColor: badgeColor }]} />
            <Text style={styles.badgeText}>{badgeLabel}</Text>
          </View>

          {feedState === 'playing' ? (
            <Pressable onPress={openFullscreen} accessibilityLabel="Fullscreen">
              {({ pressed }) => (
                <View style={[styles.expandBtn, xpRaised, pressed && styles.playPressed]}>
                  <Ionicons name="expand-outline" size={14} color={colors.text} />
                </View>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>

      <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <StatusBar style="light" />
        <View style={[styles.fullscreen, { width, height }]}>
          {feedState === 'playing' ? (
            <VideoView style={StyleSheet.absoluteFill} player={player} contentFit="contain" nativeControls />
          ) : null}
          <View style={[styles.fullscreenTopBar, { paddingTop: insets.top + spacing.sm }]}>
            <Pressable style={[styles.closeBtn, xpRaised]} onPress={() => setFullscreen(false)}>
              <Ionicons name="contract-outline" size={18} color={colors.text} />
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
  surface: { flex: 1, backgroundColor: colors.videoBg, overflow: 'hidden' },
  video: { ...StyleSheet.absoluteFillObject },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.faceDark,
  },
  playButton: {
    width: 56,
    height: 44,
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
  hint: { ...typography.body, color: colors.text, textAlign: 'center', fontWeight: '700' },
  subhint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  stopOverlay: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.face,
  },
  stopLabel: { ...typography.caption, color: colors.text, fontWeight: '700' },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    ...xpRaised,
    backgroundColor: colors.face,
  },
  badgeDot: { width: 8, height: 8 },
  badgeText: { ...typography.caption, color: colors.text, fontWeight: '700' },
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
  fullscreen: { flex: 1, backgroundColor: '#000' },
  fullscreenTopBar: {
    position: 'absolute',
    top: 0,
    right: spacing.md,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.face,
  },
});
