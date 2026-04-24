import {
  Canvas,
  LinearGradient,
  RadialGradient,
  Rect,
  vec,
} from '@shopify/react-native-skia';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { useColors } from '@/theme/ThemeProvider';

/**
 * Appends a 2-char hex alpha to a `#rrggbb` color. `alpha` is 0..1.
 * Non-hex inputs (e.g. already-rgba) are returned unchanged.
 */
function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255)));
  return `${hex}${a.toString(16).padStart(2, '0')}`;
}

/**
 * Full-screen gradient backdrop that blends the three theme blues:
 *   - base fill: `background`
 *   - diagonal sweep: `accent` (bottom-left) → transparent → `secondary` (top-right)
 *   - soft radial glow behind the note/needle area, tinted with `secondary`
 *   - deeper radial pool near the bottom using `primary`/`accent` for depth
 *
 * Rendered behind everything and ignores touches.
 */
export function AmbientBackground() {
  const { width, height } = useWindowDimensions();
  const colors = useColors();

  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: colors.background },
      ]}
      pointerEvents="none"
    >
      <Canvas style={StyleSheet.absoluteFillObject}>
        {/* Diagonal sweep: accent → clear → secondary */}
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient
            start={vec(0, height)}
            end={vec(width, 0)}
            colors={[
              withAlpha(colors.accent, 0.35),
              withAlpha(colors.background, 0),
              withAlpha(colors.secondary, 0.22),
            ]}
            positions={[0, 0.55, 1]}
          />
        </Rect>

        {/* Soft top glow behind the note/meter (secondary) */}
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={vec(width / 2, height * 0.42)}
            r={Math.max(width, height) * 0.55}
            colors={[
              withAlpha(colors.secondary, 0.22),
              withAlpha(colors.secondary, 0),
            ]}
          />
        </Rect>

        {/* Deeper pool near bottom-left (accent) for weight */}
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={vec(width * 0.15, height * 0.95)}
            r={Math.max(width, height) * 0.5}
            colors={[
              withAlpha(colors.accent, 0.3),
              withAlpha(colors.accent, 0),
            ]}
          />
        </Rect>

        {/* Subtle primary accent highlight top-right */}
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={vec(width * 0.92, height * 0.08)}
            r={Math.max(width, height) * 0.35}
            colors={[
              withAlpha(colors.primary, 0.18),
              withAlpha(colors.primary, 0),
            ]}
          />
        </Rect>
      </Canvas>
    </View>
  );
}
