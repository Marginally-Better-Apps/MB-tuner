# MB Tuner — Web

A web version of the MB Tuner iOS/Android app. Same pitch-detection pipeline,
same visuals, same on-device privacy posture — running entirely in the
browser with zero build step.

## Stack

- Pure HTML / CSS / ES modules. No bundler, no dependencies installed locally.
- [`pitchy`](https://www.npmjs.com/package/pitchy) (McLeod Pitch Method) loaded
  from jsDelivr's ESM CDN.
- Web Audio API for mic capture (`AudioWorkletNode` when available, falls back
  to `ScriptProcessorNode`).
- SVG for the needle meter, CSS variables for theming, CSS gradients for the
  ambient background.

## Run locally

You need any static file server. The app must be served over `http(s)://` —
`file://` won't work because the browser blocks microphone access and ES
module imports from local files.

```bash
cd web
# Python 3
python3 -m http.server 8080
# or: npx --yes serve .
# or: npx --yes http-server . -p 8080
```

Then open `http://localhost:8080/`.

For deployment, drop the `web/` folder on any static host (GitHub Pages,
Cloudflare Pages, Netlify, Vercel static, S3, etc.). HTTPS is required on
production because browsers gate `getUserMedia` to secure origins.

## Browser support

Works in Chrome, Edge, Firefox, and Safari (14+) on desktop and mobile.
Safari on iOS requires a user tap before the mic can start — the app handles
this automatically (first tap anywhere retries the start sequence).

## Parity with the native app

| Feature | Web | Native |
| --- | --- | --- |
| Pitch detection (MPM, clarity + RMS gating, lock-in, hold) | ✅ | ✅ |
| A reference 440–445 Hz | ✅ | ✅ |
| Light / Dark / System theme | ✅ | ✅ |
| Persisted settings | ✅ (`localStorage`) | ✅ (AsyncStorage) |
| Needle meter with ±100¢ arc, in-tune zone, chromatic neighbors | ✅ | ✅ |
| Reduce Motion support | ✅ | ✅ |
| First-in-tune feedback | ✅ (`navigator.vibrate` on mobile) | ✅ (Haptics) |
| Mic permission banner & recovery | ✅ | ✅ |
| Auto-restart after route / device changes | ✅ (`devicechange`, visibility, watchdog) | ✅ (iOS route change / interruption) |
| Offline-friendly, no network calls | ✅ (after first load) | ✅ |

## Files

```text
web/
  index.html          App shell + settings modal
  styles.css          Theme tokens, ambient gradient, layout
  js/
    app.js            Entry: pipeline, rendering, settings UI
    mic.js            getUserMedia + AudioWorklet capture
    pitch.js          PitchTracker (MPM + lock-in + hold)
    smoothing.js      Log-frequency EMA smoother
    notes.js          Note math (fToNote, neighbor labels)
    needle.js         SVG needle meter component
    settings.js       Persisted settings store
    theme.js          Light/dark resolver + reduced-motion helpers
  README.md
```

## Privacy

MB Tuner Web does not record, store, or transmit audio. All pitch analysis
runs locally in the page's JavaScript. Microphone access is requested only
when you open the tuner and released when you close the tab.
