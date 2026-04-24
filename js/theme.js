// Resolves settings.themeMode + OS preference to a concrete light/dark scheme
// and toggles `data-theme` on the root so CSS variables swap palettes.

import { getSettings, subscribe } from './settings.js';

const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null;

function systemScheme() {
  return mediaQuery?.matches ? 'dark' : 'light';
}

function resolve(mode) {
  if (mode === 'system') return systemScheme();
  return mode === 'dark' ? 'dark' : 'light';
}

function apply() {
  const { themeMode } = getSettings();
  const scheme = resolve(themeMode);
  document.documentElement.dataset.theme = scheme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', scheme === 'dark' ? '#0b1622' : '#eef6fb');
}

export function initTheme() {
  apply();
  subscribe(apply);
  mediaQuery?.addEventListener?.('change', apply);
}

export function prefersReducedMotion() {
  return Boolean(
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  );
}

export function onReducedMotionChange(listener) {
  const mm = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (!mm) return () => undefined;
  const handler = () => listener(mm.matches);
  mm.addEventListener?.('change', handler);
  return () => mm.removeEventListener?.('change', handler);
}
