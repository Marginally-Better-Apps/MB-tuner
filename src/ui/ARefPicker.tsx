import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSettings, A_REF_VALUES, type ARef } from '@/store/settings';
import { useColors } from '@/theme/ThemeProvider';

export function ARefPicker() {
  const colors = useColors();
  const aRef = useSettings((s) => s.aRef);
  const setARef = useSettings((s) => s.setARef);

  return (
    <View
      style={[styles.wrap, { backgroundColor: colors.divider }]}
      accessibilityRole="radiogroup"
      accessibilityLabel={`A reference frequency, currently ${aRef} hertz`}
    >
      {A_REF_VALUES.map((value: ARef) => {
        const active = value === aRef;
        return (
          <Pressable
            key={value}
            onPress={() => {
              if (!active) {
                Haptics.selectionAsync().catch(() => undefined);
                setARef(value);
              }
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${value} hertz`}
            style={({ pressed }) => [
              styles.cell,
              active && { backgroundColor: colors.primary },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text
              style={[
                styles.cellText,
                { color: active ? colors.background : colors.text },
              ]}
              maxFontSizeMultiplier={1.3}
            >
              {value}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
    gap: 2,
  },
  cell: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  cellText: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
