export type ColorPalette = {
  text: string;
  background: string;
  primary: string;
  secondary: string;
  accent: string;
  // Derived helpers used across the UI.
  muted: string;
  divider: string;
  surface: string;
  inTune: string;
  flat: string;
  sharp: string;
};

// The theme is built around three distinct blues that each carry a role:
//   primary   — deep anchor blue (brand, sharp-side emphasis)
//   secondary — vivid energetic blue (in-tune, active highlight)
//   accent    — soft ambient blue (flat-side, background glows)
// flat/sharp/inTune are aliases so UI code can read semantically.

export const light: ColorPalette = {
  text: '#050b0f',
  background: '#eef6fb',
  primary: '#003a5c',
  secondary: '#3cb2f6',
  accent: '#7fc7f0',
  muted: 'rgba(5, 11, 15, 0.55)',
  divider: 'rgba(5, 11, 15, 0.08)',
  surface: '#ffffff',
  inTune: '#3cb2f6',
  flat: '#7fc7f0',
  sharp: '#003a5c',
};

export const dark: ColorPalette = {
  text: '#f0f6fa',
  background: '#0b1622',
  primary: '#a3ddff',
  secondary: '#5cc0ff',
  accent: '#2a6090',
  muted: 'rgba(240, 246, 250, 0.6)',
  divider: 'rgba(240, 246, 250, 0.1)',
  surface: '#11202e',
  inTune: '#5cc0ff',
  flat: '#2a6090',
  sharp: '#a3ddff',
};

export const palettes = { light, dark };
