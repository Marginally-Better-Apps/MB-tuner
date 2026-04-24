import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useSettings } from '@/store/settings';

import { dark, light, type ColorPalette } from './colors';

type ThemeContextValue = {
  colors: ColorPalette;
  scheme: 'light' | 'dark';
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const mode = useSettings((s) => s.themeMode);

  const value = useMemo<ThemeContextValue>(() => {
    const resolved: 'light' | 'dark' =
      mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
    return {
      colors: resolved === 'dark' ? dark : light,
      scheme: resolved,
    };
  }, [mode, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

export function useColors(): ColorPalette {
  return useTheme().colors;
}
