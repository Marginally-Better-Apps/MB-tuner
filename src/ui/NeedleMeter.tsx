import {
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useColors } from '@/theme/ThemeProvider';
import { IN_TUNE_CENTS } from '@/tuning/constants';
import { neighborNoteLabels } from '@/tuning/notes';

type Props = {
  size: number;
  cents: number;
  /** Rounded MIDI of the centered note; used for chromatic neighbor labels. */
  centerMidi: number | null;
  isLive: boolean;
  isHeld?: boolean;
  reduceMotion?: boolean;
};

/** Full arc = one semitone flat (−100¢) to one semitone sharp (+100¢) vs the center pitch. */
const NEEDLE_SPAN_CENTS = 100;
const MAJOR_TICKS = [-100, -75, -50, -25, 0, 25, 50, 75, 100];
const MINOR_STEP = 5;

export function NeedleMeter({
  size,
  cents,
  centerMidi,
  isLive,
  isHeld = false,
  reduceMotion = false,
}: Props) {
  const colors = useColors();

  const padding = 28;
  const radius = size / 2 - padding;
  const cx = size / 2;
  const cy = radius + padding;
  const height = cy + 56;

  const needleLength = radius - 10;
  const hubRadius = 10;

  const rotationDeg = useSharedValue(0);
  const lockProgress = useSharedValue(0);

  useEffect(() => {
    const clamped = Math.max(
      -NEEDLE_SPAN_CENTS,
      Math.min(NEEDLE_SPAN_CENTS, cents)
    );
    const target = (clamped / NEEDLE_SPAN_CENTS) * 90;
    if (reduceMotion) {
      rotationDeg.value = withTiming(target, { duration: 120 });
    } else {
      rotationDeg.value = withSpring(target, {
        damping: 18,
        stiffness: 140,
        mass: 0.6,
      });
    }
  }, [cents, reduceMotion, rotationDeg]);

  useEffect(() => {
    const active = isLive || isHeld;
    const inTune = active && Math.abs(cents) <= IN_TUNE_CENTS;
    lockProgress.value = withTiming(inTune ? 1 : 0, { duration: 160 });
  }, [cents, isHeld, isLive, lockProgress]);

  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotationDeg.value}deg` }],
  }));

  const lockHaloStyle = useAnimatedStyle(() => ({
    opacity: lockProgress.value,
  }));

  const { arcPath, tickPath, minorTickPath, inTuneZonePath } = useMemo(() => {
    const arc = Skia.Path.Make();
    const steps = 72;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const rotDeg = (-1 + t * 2) * 90;
      const rad = (rotDeg * Math.PI) / 180;
      const x = cx + Math.sin(rad) * radius;
      const y = cy - Math.cos(rad) * radius;
      if (i === 0) arc.moveTo(x, y);
      else arc.lineTo(x, y);
    }

    const majorLen = 14;
    const minorLen = 6;

    const majors = Skia.Path.Make();
    for (const tick of MAJOR_TICKS) {
      const rotDeg = (tick / NEEDLE_SPAN_CENTS) * 90;
      const rad = (rotDeg * Math.PI) / 180;
      const sinR = Math.sin(rad);
      const cosR = Math.cos(rad);
      majors.moveTo(
        cx + sinR * (radius - majorLen),
        cy - cosR * (radius - majorLen)
      );
      majors.lineTo(cx + sinR * radius, cy - cosR * radius);
    }

    const minors = Skia.Path.Make();
    for (
      let tick = -NEEDLE_SPAN_CENTS;
      tick <= NEEDLE_SPAN_CENTS;
      tick += MINOR_STEP
    ) {
      if (MAJOR_TICKS.includes(tick)) continue;
      const rotDeg = (tick / NEEDLE_SPAN_CENTS) * 90;
      const rad = (rotDeg * Math.PI) / 180;
      const sinR = Math.sin(rad);
      const cosR = Math.cos(rad);
      minors.moveTo(
        cx + sinR * (radius - minorLen),
        cy - cosR * (radius - minorLen)
      );
      minors.lineTo(cx + sinR * radius, cy - cosR * radius);
    }

    const inTuneZone = Skia.Path.Make();
    const zoneHalfDeg = (IN_TUNE_CENTS / NEEDLE_SPAN_CENTS) * 90;
    const zoneSteps = 24;
    for (let i = 0; i <= zoneSteps; i++) {
      const t = i / zoneSteps;
      const rotDeg = -zoneHalfDeg + t * (2 * zoneHalfDeg);
      const rad = (rotDeg * Math.PI) / 180;
      const x = cx + Math.sin(rad) * (radius - 3);
      const y = cy - Math.cos(rad) * (radius - 3);
      if (i === 0) inTuneZone.moveTo(x, y);
      else inTuneZone.lineTo(x, y);
    }

    return {
      arcPath: arc,
      tickPath: majors,
      minorTickPath: minors,
      inTuneZonePath: inTuneZone,
    };
  }, [cx, cy, radius]);

  const active = isLive || isHeld;
  const inTune = active && Math.abs(cents) <= IN_TUNE_CENTS;
  const label = !active
    ? '—'
    : inTune
      ? 'In tune'
      : `${cents > 0 ? '+' : ''}${cents.toFixed(0)}¢`;

  const labelColor = !active
    ? colors.muted
    : inTune
      ? colors.inTune
      : colors.muted;

  const needleColor = !active
    ? colors.muted
    : inTune
      ? colors.inTune
      : cents < 0
        ? colors.flat
        : colors.sharp;

  const neighbors =
    centerMidi != null ? neighborNoteLabels(centerMidi) : null;
  const leftLabel = neighbors?.flatSide ?? '♭';
  const rightLabel = neighbors?.sharpSide ?? '♯';

  const gradientStart = vec(cx - radius, cy);
  const gradientEnd = vec(cx + radius, cy);
  const meterGradient = [colors.flat, colors.inTune, colors.sharp];

  const scaleA11y = neighbors
    ? `Scale from ${neighbors.flatSide} on the left to ${neighbors.sharpSide} on the right, one semitone each side of center.`
    : '';

  return (
    <View
      style={[styles.container, { width: size, height }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        active
          ? inTune
            ? `In tune. ${scaleA11y}`
            : `${cents > 0 ? 'sharp' : 'flat'} by ${Math.abs(cents).toFixed(0)} cents. ${scaleA11y}`
          : `Listening. ${scaleA11y}`
      }
    >
      <Canvas style={{ width: size, height }} pointerEvents="none">
        <Path path={arcPath} style="stroke" strokeWidth={2} opacity={0.55}>
          <LinearGradient
            start={gradientStart}
            end={gradientEnd}
            colors={meterGradient}
          />
        </Path>
        <Path
          path={inTuneZonePath}
          style="stroke"
          strokeWidth={5}
          strokeCap="round"
          color={colors.inTune}
          opacity={0.22}
        />
        <Path
          path={minorTickPath}
          style="stroke"
          strokeWidth={1.5}
          opacity={0.6}
          strokeCap="round"
        >
          <LinearGradient
            start={gradientStart}
            end={gradientEnd}
            colors={meterGradient}
          />
        </Path>
        <Path
          path={tickPath}
          style="stroke"
          strokeWidth={2.5}
          opacity={0.95}
          strokeCap="round"
        >
          <LinearGradient
            start={gradientStart}
            end={gradientEnd}
            colors={meterGradient}
          />
        </Path>
        <Group>
          <Path
            path={(() => {
              const p = Skia.Path.Make();
              p.moveTo(cx, cy - radius - 4);
              p.lineTo(cx, cy - radius + 18);
              return p;
            })()}
            style="stroke"
            strokeWidth={3}
            color={colors.inTune}
            opacity={0.9}
            strokeCap="round"
          />
        </Group>
      </Canvas>

      <Text
        style={[
          styles.edgeLabel,
          styles.edgeLabelLeft,
          {
            color: colors.flat,
            left: cx - radius - 50,
            top: cy - 12,
            width: 48,
          },
        ]}
        maxFontSizeMultiplier={1.15}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
      >
        {leftLabel}
      </Text>
      <Text
        style={[
          styles.edgeLabel,
          styles.edgeLabelRight,
          {
            color: colors.sharp,
            left: cx + radius + 4,
            top: cy - 12,
            width: 48,
          },
        ]}
        maxFontSizeMultiplier={1.15}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
      >
        {rightLabel}
      </Text>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.needleWrap,
          {
            left: cx - 2,
            top: cy - needleLength,
            width: 4,
            height: needleLength,
            transformOrigin: 'bottom center',
          },
          needleStyle,
        ]}
      >
        <View
          style={[
            styles.needle,
            { backgroundColor: needleColor },
          ]}
        />
      </Animated.View>

      <Canvas
        style={[
          styles.absolute,
          { width: size, height },
        ]}
        pointerEvents="none"
      >
        <Group>
          <Circle cx={cx} cy={cy} r={hubRadius} color={colors.surface} />
          <Circle
            cx={cx}
            cy={cy}
            r={hubRadius}
            style="stroke"
            strokeWidth={2}
            color={colors.secondary}
            opacity={0.9}
          />
          <Circle cx={cx} cy={cy} r={3} color={colors.primary} />
        </Group>
      </Canvas>

      <Animated.View
        pointerEvents="none"
        style={[styles.absolute, { width: size, height }, lockHaloStyle]}
      >
        <Canvas style={{ width: size, height }}>
          <Circle
            cx={cx}
            cy={cy - radius}
            r={10}
            color={colors.inTune}
            opacity={0.25}
          />
        </Canvas>
      </Animated.View>

      <Text
        style={[styles.centsLabel, { color: labelColor }]}
        maxFontSizeMultiplier={1.4}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  absolute: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  needleWrap: {
    position: 'absolute',
  },
  needle: {
    flex: 1,
    width: '100%',
    borderRadius: 2,
  },
  edgeLabel: {
    position: 'absolute',
    fontSize: 15,
    fontWeight: '600',
  },
  edgeLabelLeft: {
    textAlign: 'right',
  },
  edgeLabelRight: {
    textAlign: 'left',
  },
  centsLabel: {
    position: 'absolute',
    bottom: 4,
    fontSize: 14,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
});
