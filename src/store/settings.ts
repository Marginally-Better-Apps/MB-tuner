import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const A_REF_VALUES = [440, 441, 442, 443, 444, 445] as const;
export type ARef = (typeof A_REF_VALUES)[number];

export type ThemeMode = 'system' | 'light' | 'dark';

type SettingsState = {
  aRef: ARef;
  themeMode: ThemeMode;
  hydrated: boolean;
  setARef: (value: ARef) => void;
  setThemeMode: (mode: ThemeMode) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      aRef: 440,
      themeMode: 'system',
      hydrated: false,
      setARef: (value) => set({ aRef: value }),
      setThemeMode: (mode) => set({ themeMode: mode }),
    }),
    {
      name: 'mb-tuner.settings.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ aRef: state.aRef, themeMode: state.themeMode }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    }
  )
);
