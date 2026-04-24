// Persisted settings (A reference pitch, theme mode). Mirrors
// src/store/settings.ts but uses localStorage and a tiny listener store.

export const A_REF_VALUES = [440, 441, 442, 443, 444, 445];
export const THEME_MODES = ['system', 'light', 'dark'];

const STORAGE_KEY = 'mb-tuner.settings.v1';

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const state = parsed?.state ?? parsed;
    const aRef = A_REF_VALUES.includes(state?.aRef) ? state.aRef : 440;
    const themeMode = THEME_MODES.includes(state?.themeMode)
      ? state.themeMode
      : 'system';
    return { aRef, themeMode };
  } catch {
    return null;
  }
}

const initial = readStored() ?? { aRef: 440, themeMode: 'system' };

let state = { ...initial };
const listeners = new Set();

function persist() {
  try {
    // Shape mirrors zustand persist output so the two stores could
    // theoretically share a key between platforms.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state, version: 0 })
    );
  } catch {
    // Ignored — private mode or storage quota; runtime continues fine.
  }
}

function emit() {
  for (const fn of listeners) fn(state);
}

export function getSettings() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setARef(value) {
  if (!A_REF_VALUES.includes(value)) return;
  if (state.aRef === value) return;
  state = { ...state, aRef: value };
  persist();
  emit();
}

export function setThemeMode(mode) {
  if (!THEME_MODES.includes(mode)) return;
  if (state.themeMode === mode) return;
  state = { ...state, themeMode: mode };
  persist();
  emit();
}
