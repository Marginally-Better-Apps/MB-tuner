import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSettings, type ThemeMode } from '@/store/settings';
import { useColors } from '@/theme/ThemeProvider';
import { AmbientBackground } from '@/ui/AmbientBackground';
import { ARefPicker } from '@/ui/ARefPicker';

const PRIVACY_URL = 'https://mbaudio.app/tuner/privacy';

const THEME_OPTIONS: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const themeMode = useSettings((s) => s.themeMode);
  const setThemeMode = useSettings((s) => s.setThemeMode);

  const platformLabel =
    Platform.OS === 'ios'
      ? 'iOS'
      : Platform.OS === 'android'
        ? 'Android'
        : 'Web';
  const version = `${Constants.expoConfig?.version ?? '1.0.0'} (${platformLabel})`;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <AmbientBackground />
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close settings"
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.divider },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Reference pitch" colors={colors}>
          <Text style={[styles.hint, { color: colors.muted }]}>
            Concert pitch A4 used as the tuning reference.
          </Text>
          <View style={{ height: 12 }} />
          <ARefPicker />
        </Section>

        <Section title="Appearance" colors={colors}>
          <View
            style={[styles.segment, { backgroundColor: colors.divider }]}
            accessibilityRole="radiogroup"
            accessibilityLabel="Theme"
          >
            {THEME_OPTIONS.map((o) => {
              const active = o.id === themeMode;
              return (
                <Pressable
                  key={o.id}
                  onPress={() => setThemeMode(o.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.segmentCell,
                    active && { backgroundColor: colors.primary },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: active ? colors.background : colors.text },
                    ]}
                    maxFontSizeMultiplier={1.3}
                  >
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="About" colors={colors}>
          <Row label="Version" value={version} colors={colors} />
          <Row
            label="Privacy policy"
            value="Open"
            onPress={() => Linking.openURL(PRIVACY_URL)}
            colors={colors}
          />
          <Text style={[styles.hint, { color: colors.muted, marginTop: 12 }]}>
            MB Tuner works entirely on-device. No audio, analytics, or
            identifiers are recorded or sent over the network.
          </Text>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.muted }]}>{title}</Text>
      <View style={[styles.sectionBody, { backgroundColor: colors.surface }]}>
        {children}
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  onPress,
  colors,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const content = (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.muted }]}>{value}</Text>
    </View>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        style={({ pressed }) => pressed && { opacity: 0.7 }}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
  },
  title: { fontSize: 24, fontWeight: '600' },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  section: { marginTop: 20 },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 6,
    fontWeight: '600',
  },
  sectionBody: {
    borderRadius: 16,
    padding: 16,
  },
  hint: { fontSize: 13, lineHeight: 18 },
  segment: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
    gap: 2,
  },
  segmentCell: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  segmentText: { fontSize: 15, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  rowLabel: { fontSize: 15 },
  rowValue: { fontSize: 14, fontVariant: ['tabular-nums'] },
});
