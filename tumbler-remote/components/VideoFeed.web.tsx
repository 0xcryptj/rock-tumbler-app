import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraGatewayPlayer } from '@/components/CameraGatewayPlayer';
import { snapshotImageSource } from '@/lib/cameraThumbnail';
import { openPopoutPlayer } from '@/lib/openPopout';
import {
  getPopoutPlayerUrl,
  startStreamSession,
  stopStreamSession,
  type StreamSession,
} from '@/lib/stream';
import type { BackendSettings } from '@/lib/storage';
import { colors, spacing, typography, xpRaised } from '@/constants/theme';

type Props = {
  settings: BackendSettings;
  isRunning: boolean;
  style?: StyleProp<ViewStyle>;
};

type FeedState = 'idle' | 'connecting' | 'playing' | 'error';

const ASPECT = 16 / 9;
const MAX_HEIGHT_RATIO = 0.38;
const THUMB_REFRESH_MS = 8_000;

function VideoShell({ children }: { children: ReactNode }) {
  return <View style={styles.videoShell}>{children}</View>;
}

function LiveBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={styles.liveBadge}>
      <View style={[styles.liveDot, { backgroundColor: color }]} />
      <Text style={styles.liveBadgeText}>{label}</Text>
    </View>
  );
}

function OverlayIconButton({
  icon,
  onPress,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.overlayBtn, pressed && styles.overlayBtnPressed]}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={20} color="#fff" />
    </Pressable>
  );
}

/** Web: gateway popout player (HTML video) — expo-video cannot play live fragmented MP4 reliably. */
export function VideoFeed({ settings, isRunning, style }: Props) {
  const [feedState, setFeedState] = useState<FeedState>('idle');
  const [session, setSession] = useState<StreamSession | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [thumbKey, setThumbKey] = useState(() => Date.now());
  const [thumbVisible, setThumbVisible] = useState(true);
  const [panelWidth, setPanelWidth] = useState(0);
  const sessionRef = useRef<StreamSession | null>(null);
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();

  const videoHeight =
    panelWidth > 0
      ? Math.min(Math.round(panelWidth / ASPECT), Math.round(winH * MAX_HEIGHT_RATIO))
      : Math.min(Math.round((winW - spacing.screen * 2) / ASPECT), Math.round(winH * MAX_HEIGHT_RATIO));

  useEffect(() => {
    if (feedState !== 'idle') {
      return;
    }
    const timer = setInterval(() => setThumbKey(Date.now()), THUMB_REFRESH_MS);
    return () => clearInterval(timer);
  }, [feedState]);

  const releaseStream = useCallback(async () => {
    const active = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    if (active) {
      try {
        await stopStreamSession(settings, active.sessionId);
      } catch {
        /* ignore */
      }
    }
  }, [settings]);

  const stopPlayback = useCallback(async () => {
    await releaseStream();
    setFeedState('idle');
    setErrorMessage(null);
    setFullscreen(false);
    setThumbKey(Date.now());
    setThumbVisible(true);
  }, [releaseStream]);

  const startPlayback = useCallback(async () => {
    setFeedState('connecting');
    setErrorMessage(null);
    setThumbVisible(false);
    try {
      const next = await startStreamSession(settings);
      sessionRef.current = next;
      setSession(next);
    } catch (err) {
      sessionRef.current = null;
      setSession(null);
      setFeedState('error');
      setThumbVisible(true);
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not start camera — check gateway/.env RTSP_URL'
      );
    }
  }, [settings]);

  const onPlayerReady = useCallback(() => {
    setFeedState('playing');
  }, []);

  const onPlayerError = useCallback((message: string) => {
    setFeedState('error');
    setErrorMessage(message);
    setThumbVisible(true);
  }, []);

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
    if (feedState !== 'playing' && feedState !== 'connecting') {
      void startPlayback();
      return;
    }
    setFullscreen(true);
  };

  const openPlayerInBrowser = () => {
    if (!session) return;
    openPopoutPlayer(getPopoutPlayerUrl(session));
  };

  const playerUrl = session ? getPopoutPlayerUrl(session) : '';

  const isLiveSession = feedState === 'connecting' || feedState === 'playing';
  const badgeLabel =
    feedState === 'playing' ? 'LIVE' : feedState === 'connecting' ? 'CONNECTING' : feedState === 'error' ? 'ERROR' : 'CAMERA';
  const badgeColor =
    feedState === 'playing' && isRunning
      ? colors.green
      : feedState === 'playing'
        ? colors.orange
        : feedState === 'error'
          ? colors.red
          : colors.disabled;

  const renderStreamContent = () => {
    if (isLiveSession && playerUrl) {
      return (
        <>
          <CameraGatewayPlayer
            playerUrl={playerUrl}
            onReady={onPlayerReady}
            onError={onPlayerError}
          />
          {feedState === 'connecting' ? (
            <View style={styles.connectingOverlay}>
              <ActivityIndicator color="#fff" size="large" />
            </View>
          ) : null}
        </>
      );
    }

    return (
      <View style={styles.placeholder}>
        {feedState === 'idle' && thumbVisible ? (
          <Image
            source={snapshotImageSource(settings, thumbKey)}
            style={styles.thumbnail}
            resizeMode="cover"
            onError={() => setThumbVisible(false)}
          />
        ) : null}
        <Pressable onPress={togglePlay} style={styles.playPressable}>
          {({ pressed }) => (
            <View style={[styles.playCircle, pressed && styles.playCirclePressed]}>
              <Ionicons
                name={feedState === 'error' ? 'refresh' : 'play'}
                size={28}
                color="#fff"
              />
            </View>
          )}
        </Pressable>
        {feedState === 'error' ? (
          <Text style={styles.errorHint}>{errorMessage ?? 'Stream failed'}</Text>
        ) : null}
      </View>
    );
  };

  return (
    <>
      <View
        style={[styles.container, style]}
        onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width)}
      >
        <View style={[styles.surface, { height: videoHeight }]}>
          <VideoShell>{renderStreamContent()}</VideoShell>

          <View style={styles.videoOverlayLayer} pointerEvents="box-none">
            <View style={styles.overlayTopLeft} pointerEvents="box-none">
              {isLiveSession ? <LiveBadge label={badgeLabel} color={badgeColor} /> : null}
            </View>
            <View style={styles.overlayBottomRight} pointerEvents="box-none">
              <OverlayIconButton
                icon="expand-outline"
                onPress={openFullscreen}
                accessibilityLabel="Full screen"
              />
            </View>
          </View>
        </View>

        <View style={styles.actionBar}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, xpRaised, pressed && styles.btnPressed]}
            onPress={togglePlay}
          >
            <Ionicons
              name={
                feedState === 'playing' || feedState === 'connecting'
                  ? 'stop'
                  : feedState === 'error'
                    ? 'refresh'
                    : 'play'
              }
              size={18}
              color={colors.text}
            />
            <Text style={styles.actionBtnText}>
              {feedState === 'playing' || feedState === 'connecting'
                ? 'Stop live'
                : feedState === 'error'
                  ? 'Retry'
                  : 'Play live'}
            </Text>
          </Pressable>

          {isLiveSession && session ? (
            <Pressable
              style={({ pressed }) => [styles.actionBtn, xpRaised, pressed && styles.btnPressed]}
              onPress={openPlayerInBrowser}
            >
              <Ionicons name="open-outline" size={18} color={colors.selection} />
              <Text style={[styles.actionBtnText, styles.actionLinkText]}>Pop out</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Modal
        visible={fullscreen}
        animationType="fade"
        presentationStyle="fullScreen"
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
        onRequestClose={() => setFullscreen(false)}
      >
        <StatusBar style="light" hidden />
        <View style={[styles.fullscreenRoot, { width: winW, height: winH }]}>
          <VideoShell>{renderStreamContent()}</VideoShell>
          <View style={[styles.fullscreenOverlay, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
            <OverlayIconButton
              icon="contract-outline"
              onPress={() => setFullscreen(false)}
              accessibilityLabel="Exit full screen"
            />
            {isLiveSession ? <LiveBadge label={badgeLabel} color={badgeColor} /> : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', overflow: 'hidden' },
  surface: {
    width: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
    position: 'relative',
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderTopColor: colors.darkShadow,
    borderLeftColor: colors.darkShadow,
    borderBottomColor: colors.highlight,
    borderRightColor: colors.highlight,
  },
  videoShell: { flex: 1, width: '100%', backgroundColor: '#000' },
  connectingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 1,
  },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },
  thumbnail: { ...StyleSheet.absoluteFillObject },
  playPressable: { zIndex: 1 },
  playCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  playCirclePressed: { backgroundColor: 'rgba(0,0,0,0.75)' },
  errorHint: {
    ...typography.caption,
    color: '#ffb4b4',
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    zIndex: 1,
  },
  videoOverlayLayer: { ...StyleSheet.absoluteFillObject, zIndex: 2 },
  overlayTopLeft: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  overlayBottomRight: { position: 'absolute', bottom: spacing.sm, right: spacing.sm },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveBadgeText: {
    ...typography.caption,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  overlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  overlayBtnPressed: { backgroundColor: 'rgba(0,0,0,0.8)' },
  actionBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.face,
  },
  actionBtnText: { ...typography.caption, color: colors.text, fontWeight: '700' },
  actionLinkText: { color: colors.selection },
  btnPressed: {
    borderTopColor: colors.darkShadow,
    borderLeftColor: colors.darkShadow,
    borderBottomColor: colors.highlight,
    borderRightColor: colors.highlight,
  },
  fullscreenRoot: { flex: 1, backgroundColor: '#000' },
  fullscreenOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 3,
  },
});
