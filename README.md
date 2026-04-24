# MB Tuner

A chromatic tuner for iOS and Android built with Expo + React Native, with a
matching [web version](./web/README.md) in `web/`.
No ads, no analytics, no accounts. Audio is processed on-device / in-browser.

## Stack

- Expo SDK 54, React Native 0.81, React 19, TypeScript (strict)
- Expo Router with typed routes
- `react-native-audio-api` for low-latency mic capture
- `pitchy` (McLeod Pitch Method) for pitch detection
- `react-native-reanimated` + `@shopify/react-native-skia` for visuals
- `zustand` + `@react-native-async-storage/async-storage` for persisted settings

## Getting Started

```bash
npm install
npm run prebuild
npm run ios
```

Use a physical device for best mic behavior. Expo Go is not supported because
`react-native-audio-api` requires native modules.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Serve the web app from `web/` at `http://localhost:8080`. |
| `npm run start` | Start Expo dev server for the dev client. |
| `npm run ios` | Build and run iOS app with native modules. |
| `npm run android` | Build and run Android app with native modules. |
| `npm run prebuild` | Regenerate `ios/` and `android/` from Expo config. |
| `npm run test` | Run Jest unit tests for tuning and pitch logic. |
| `npm run lint` | Run Expo ESLint configuration. |
| `npm install` (`postinstall`) | Applies `scripts/remove-recording-notification-ios-warn.js` to silence a known harmless iOS warning in `react-native-audio-api`. |

## Architecture

Primary flow starts in `src/hooks/useTuner.ts`:

1. Microphone input from `src/audio/mic.ts`
2. Pitch extraction and quality gating in `src/audio/pitch.ts`
3. Note/cents mapping in `src/tuning/notes.ts` and smoothing in `src/tuning/smoothing.ts`
4. UI rendering via `app/index.tsx` and `src/ui/*`

## Project Layout

```text
app/                  Expo Router screens (_layout, index, settings)
src/
  audio/              Mic permissions, stream handling, pitch detection
  hooks/useTuner.ts   Main tuner pipeline and app-facing state
  store/settings.ts   Persisted app settings (aRef, theme)
  theme/              Theme provider and color system
  tuning/             Note mapping, constants, smoothing, tests
  ui/                 AmbientBackground, NeedleMeter, NoteDisplay, ARefPicker
scripts/              Postinstall patch for react-native-audio-api warning
assets/               App icons and splash assets
store-listing/        App Store metadata, description, privacy policy
```

## Build and Release

EAS profiles in `eas.json`:

- `development`: dev client, internal distribution, simulator allowed
- `preview`: internal testing / TestFlight
- `production`: App Store release

```bash
eas build --profile development --platform ios
eas build --profile preview --platform ios
eas build --profile production --platform ios
eas submit --profile production --platform ios
```

Before first submission, fill in `submit.production.ios` with real App Store
Connect values (app ID, Apple ID, team ID).

## App Store Compliance Notes

- `NSMicrophoneUsageDescription` is set with a clear reason.
- `ITSAppUsesNonExemptEncryption=false` avoids export compliance prompts.
- `ios.privacyManifests` in `app.json` declares required API reason codes and
  no tracking/no collected data types.
- Privacy policy draft is in `store-listing/privacy-policy.md` and should be
  hosted at the URL declared in `store-listing/metadata.json`.
- No background audio, analytics SDKs, or account system.

## Web version

A browser-native build lives in [`web/`](./web/README.md) — same visuals and
pitch pipeline, served as a zero-dependency static site. To run it:

```bash
npm run dev
```

## License

Private (TBD).
