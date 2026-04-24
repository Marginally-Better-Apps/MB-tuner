import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTuner } from '@/hooks/useTuner';
import { useSettings } from '@/store/settings';
import { AmbientBackground } from '@/ui/AmbientBackground';
import { NeedleMeter } from '@/ui/NeedleMeter';
import { NoteDisplay } from '@/ui/NoteDisplay';
import { useColors } from '@/theme/ThemeProvider';

const { width } = Dimensions.get('window');
const METER_SIZE = Math.min(width - 48, 340);

export default function TunerScreen() {
  const colors = useColors();
  const router = useRouter();
  const aRef = useSettings((s) => s.aRef);
  const tuner = useTuner();
  const [paused, setPaused] = useState(false);
  // Guards against double-taps while start()/stop() settle the mic pipeline.
  const toggleInFlightRef = useRef(false);

  useEffect(() => {
    tuner.start();
    return () => tuner.stop();
    // `start` / `stop` are stable refs; aRef is applied live inside the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePaused = useCallback(async () => {
    if (toggleInFlightRef.current) return;
    toggleInFlightRef.current = true;
    try {
      if (paused) {
        await tuner.start();
        setPaused(false);
      } else {
        tuner.stop();
        setPaused(true);
      }
    } finally {
      toggleInFlightRef.current = false;
    }
  }, [paused, tuner]);

  const showPermissionPrompt =
    !paused &&
    (tuner.permission === 'Denied' ||
      (tuner.permission === 'Granted' && tuner.error));

  return (
    <SafeAreaView style={styles.root} edges={['top','bottom']}>
      <AmbientBackground />
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.muted }]}>MB Tuner</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.divider },
            pressed && { opacity: 0.7 },
          ]}
          hitSlop={12}
        >
          <Ionicons name="settings-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.main}>
        <NoteDisplay
          name={tuner.note}
          octave={tuner.octave}
          detectedFrequency={tuner.detectedFrequency}
          targetFrequency={tuner.targetFrequency}
          isLive={tuner.isLive || tuner.isHeld}
          idleText={paused ? 'Tuner off' : 'Play a note'}
        />

        <View style={styles.meterSection}>
          <View style={styles.meterWrap}>
            <NeedleMeter
              size={METER_SIZE}
              cents={tuner.cents}
              centerMidi={tuner.midi}
              isLive={tuner.isLive}
              isHeld={tuner.isHeld}
              reduceMotion={tuner.reduceMotion}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={paused ? 'Start tuner' : 'Stop tuner'}
            onPress={togglePaused}
            style={({ pressed }) => [
              styles.tunerToggleButton,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.tunerToggleText, { color: colors.background }]}>
              {paused ? 'Start Tuner' : 'Stop Tuner'}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.muted }]}>
          A = {aRef} Hz
        </Text>
        {showPermissionPrompt ? (
          <Pressable
            onPress={() =>
              Platform.OS === 'ios'
                ? Linking.openURL('app-settings:')
                : Linking.openSettings()
            }
            style={({ pressed }) => [
              styles.permissionBanner,
              { backgroundColor: colors.divider },
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Open system settings to grant microphone access"
          >
            <Ionicons name="mic-off-outline" size={16} color={colors.text} />
            <Text style={[styles.permissionText, { color: colors.text }]}
                  maxFontSizeMultiplier={1.3}>
              Microphone access is needed. Open Settings.
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 13,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 24,
    paddingTop: 8,
    overflow: 'visible',
  },
  meterSection: {
    alignItems: 'center',
    gap: 2,
  },
  meterWrap: { alignItems: 'center', justifyContent: 'center' },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    alignItems: 'center',
    gap: 12,
  },
  footerText: {
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
  },
  tunerToggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tunerToggleText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  permissionText: { fontSize: 14 },
});
