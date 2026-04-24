import { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useColors } from '@/theme/ThemeProvider';
import type { NoteName } from '@/tuning/notes';

type Props = {
  name: NoteName | null;
  octave: number | null;
  /** Smoothed Hz from the mic (what you are playing). */
  detectedFrequency: number;
  /** Equal-tempered reference Hz for the displayed note. */
  targetFrequency: number | null;
  isLive: boolean;
  idleText?: string;
};

// Prefer unicode sharp glyph for typographic density.
const prettify = (n: NoteName) => n.replace('#', '\u266F');

export function NoteDisplay({
  name,
  octave,
  detectedFrequency,
  targetFrequency,
  isLive,
  idleText = 'Play a note',
}: Props) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = 0.92;
    scale.value = withSpring(1, { damping: 18, stiffness: 220 });
    opacity.value = withTiming(name ? 1 : 0.35, { duration: 180 });
  }, [name, opacity, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const display = name ? prettify(name) : idleText;
  const targetValue =
    name && targetFrequency != null && targetFrequency > 0
      ? `${targetFrequency.toFixed(1)} Hz`
      : null;
  const showLiveHz = detectedFrequency > 0;
  const liveValue = showLiveHz ? `${detectedFrequency.toFixed(1)} Hz` : '';

  const a11y = name
    ? `${targetValue ? `target ${targetValue}, ` : ''}${name}${
        octave != null ? ` ${octave}` : ''
      }${showLiveHz ? `, ${liveValue} measured` : ''}`
    : 'Listening';

  return (
    <View style={styles.wrap} accessible accessibilityLabel={a11y}>
      <Animated.View style={[styles.animOuter, animStyle]}>
        <View style={styles.noteColumn}>
          <View
            style={[
              styles.labeledHz,
              styles.targetAboveNote,
              !targetValue && styles.targetHidden,
            ]}
          >
            <Text style={[styles.hzTag, { color: colors.muted }]}>Target</Text>
            <Text
              style={[styles.targetHz, { color: colors.text }]}
              maxFontSizeMultiplier={1.25}
            >
              {targetValue ?? ''}
            </Text>
          </View>
          <View style={styles.noteRow}>
            <Text
              style={[
                styles.note,
                !name && styles.notePlaceholder,
                { color: name ? (isLive ? colors.text : colors.muted) : colors.text },
              ]}
              maxFontSizeMultiplier={1.3}
              numberOfLines={!name ? 1 : undefined}
              ellipsizeMode="clip"
            >
              {display}
            </Text>
            {octave !== null ? (
              <Text
                style={[styles.octaveSub, { color: colors.muted }]}
                maxFontSizeMultiplier={1.3}
              >
                {octave}
              </Text>
            ) : null}
          </View>
        </View>
      </Animated.View>
      <Text
        style={[styles.liveHz, styles.liveHzRow, { color: colors.text }]}
        maxFontSizeMultiplier={1.4}
      >
        {liveValue}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    overflow: 'visible',
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  animOuter: {
    overflow: 'visible',
    paddingVertical: 12,
  },
  noteColumn: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
    minHeight: 182,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    overflow: 'visible',
    minHeight: 152,
  },
  note: {
    fontSize: 128,
    fontWeight: '300',
    letterSpacing: -2,
    lineHeight: 152,
    includeFontPadding: false,
    ...Platform.select({
      ios: { fontFamily: 'Avenir Next' },
      default: {},
    }),
  },
  notePlaceholder: {
    fontSize: 34,
    letterSpacing: 0,
    lineHeight: 44,
    fontWeight: '500',
    textTransform: 'uppercase',
    textAlign: 'center',
    width: '100%',
  },
  /** Octave digit as subscript: same row as the letter, smaller, baseline-aligned low. */
  octaveSub: {
    fontSize: 40,
    fontWeight: '400',
    marginLeft: 4,
    marginBottom: 20,
    lineHeight: 44,
    fontVariant: ['tabular-nums'],
    ...Platform.select({
      ios: { fontFamily: 'Avenir Next' },
      default: {},
    }),
  },
  labeledHz: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    flexWrap: 'wrap',
    columnGap: 6,
    rowGap: 2,
  },
  targetAboveNote: {
    minHeight: 24,
    marginBottom: 6,
  },
  targetHidden: {
    opacity: 0,
  },
  liveHzRow: {
    marginTop: 10,
    minHeight: 20,
  },
  hzTag: {
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  targetHz: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.2,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
    ...Platform.select({
      ios: { fontFamily: 'Avenir Next' },
      default: {},
    }),
  },
  liveHz: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
    ...Platform.select({
      ios: { fontFamily: 'Avenir Next' },
      default: {},
    }),
  },
});
