// MB Tuner — web entry. Wires the mic → PitchTracker → UI pipeline and
// mirrors the RN `useTuner` hook's behavior (auto-restart, hold window,
// reduce-motion, haptics-on-first-in-tune, permission handling).

import { createNeedleMeter } from './needle.js';
import { startMicStream, getPermissionState } from './mic.js';
import { PitchTracker } from './pitch.js';
import { fToNote, prettifyNoteName, IN_TUNE_CENTS } from './notes.js';
import {
  A_REF_VALUES,
  THEME_MODES,
  getSettings,
  setARef,
  setThemeMode,
  subscribe as subscribeSettings,
} from './settings.js';
import {
  initTheme,
  onReducedMotionChange,
  prefersReducedMotion,
} from './theme.js';

initTheme();

// --- DOM refs ----------------------------------------------------------

const meterWrap = document.getElementById('meter-wrap');
const noteEl = document.getElementById('note');
const octaveEl = document.getElementById('octave');
const targetRow = document.getElementById('target-row');
const targetHzEl = document.getElementById('target-hz');
const liveHzEl = document.getElementById('live-hz');
const aRefFooter = document.getElementById('aref-footer');
const permissionBanner = document.getElementById('permission-banner');
const permissionText = document.getElementById('permission-text');
const settingsButton = document.getElementById('settings-button');
const settingsModal = document.getElementById('settings-modal');
const settingsClose = document.getElementById('settings-close');
const aRefSegment = document.getElementById('aref-segment');
const themeSegment = document.getElementById('theme-segment');
const tunerToggleButton = document.getElementById('tuner-toggle-button');

const meter = createNeedleMeter();
meterWrap.appendChild(meter.el);

// --- Settings UI -------------------------------------------------------

function buildSegment(container, values, getActive, onPick, labelFor) {
  container.replaceChildren();
  for (const v of values) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segment-cell';
    btn.setAttribute('role', 'radio');
    btn.textContent = labelFor(v);
    btn.dataset.value = String(v);
    btn.addEventListener('click', () => {
      onPick(v);
      // Light vibration on mobile web matches the haptic on iOS.
      navigator.vibrate?.(8);
    });
    container.appendChild(btn);
  }
  syncSegment(container, getActive());
}

function syncSegment(container, activeValue) {
  const cells = container.querySelectorAll('.segment-cell');
  cells.forEach((cell) => {
    const active = cell.dataset.value === String(activeValue);
    cell.classList.toggle('is-active', active);
    cell.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

buildSegment(
  aRefSegment,
  A_REF_VALUES,
  () => getSettings().aRef,
  (v) => setARef(v),
  (v) => String(v)
);

buildSegment(
  themeSegment,
  THEME_MODES,
  () => getSettings().themeMode,
  (m) => setThemeMode(m),
  (m) => (m === 'system' ? 'System' : m === 'light' ? 'Light' : 'Dark')
);

subscribeSettings((s) => {
  aRefFooter.textContent = `A = ${s.aRef} Hz`;
  syncSegment(aRefSegment, s.aRef);
  syncSegment(themeSegment, s.themeMode);
});
// Seed the footer once on load.
aRefFooter.textContent = `A = ${getSettings().aRef} Hz`;

// --- Modal open/close --------------------------------------------------

function openSettings() {
  settingsModal.hidden = false;
  settingsClose.focus();
}
function closeSettings() {
  settingsModal.hidden = true;
  settingsButton.focus();
}
settingsButton.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (e) => {
  // Click on the modal backdrop (not the inner panel) dismisses.
  if (e.target === settingsModal) closeSettings();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !settingsModal.hidden) closeSettings();
});

// --- Tuner pipeline ----------------------------------------------------

const state = {
  permission: 'Unknown',
  running: false,
  note: null,
  octave: null,
  targetFrequency: 0,
  detectedFrequency: 0,
  cents: 0,
  midi: null,
  isLive: false,
  isHeld: false,
  reduceMotion: prefersReducedMotion(),
  error: null,
};

let tracker = null;
let stopMic = null;
let wasInTune = false;
let micGeneration = 0;
let listening = false;
let lastChunkMs = 0;
let restartDebounce = null;
let pipelineGate = Promise.resolve();
let attemptingStart = false;
// True when the user has explicitly paused the tuner via the pause button.
// Blocks auto-restart (first-gesture, visibility, watchdog) until resume.
let userPaused = false;
// True when we stopped the mic because the tab went hidden. Used so that
// auto-resume fires only when we were the ones who suspended, and not when
// the user had explicitly paused before hiding the tab.
let autoSuspended = false;
let debugBannerLast = null;
let debugChunkLogs = 0;
let debugRenderDomLogs = 0;

// #region agent log
fetch('http://127.0.0.1:7455/ingest/ab1c7b9f-9dbf-4963-820d-0cb95eb0aab9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ba969'},body:JSON.stringify({sessionId:'2ba969',runId:'run2',hypothesisId:'H8',location:'web/js/app.js:boot',message:'Web app boot marker',data:{href:window.location.href,userAgent:navigator.userAgent.slice(0,120)},timestamp:Date.now()})}).catch(()=>{});
// #endregion

onReducedMotionChange((reduce) => {
  state.reduceMotion = reduce;
  render();
});

function scheduleDebouncedRestart() {
  if (!listening) return;
  if (restartDebounce) clearTimeout(restartDebounce);
  restartDebounce = setTimeout(() => {
    restartDebounce = null;
    if (!listening) return;
    void attachMicQueued();
  }, 200);
}

async function attachMicQueued() {
  const prev = pipelineGate;
  let done;
  pipelineGate = new Promise((resolve) => {
    done = resolve;
  });
  try {
    await prev;
  } catch {
    // previous attach failed; proceed with a fresh attempt
  }
  try {
    await attachMic();
  } finally {
    done();
  }
}

async function attachMic() {
  const myGen = ++micGeneration;
  lastChunkMs = performance.now();

  try {
    stopMic?.();
  } catch {}
  stopMic = null;

  if (tracker) tracker.softReset();
  else tracker = new PitchTracker();

  try {
    stopMic = await startMicStream(
      ({ samples, sampleRate, when }) => {
        if (micGeneration !== myGen) return;
        lastChunkMs = performance.now();
        if (debugChunkLogs < 3) {
          debugChunkLogs += 1;
          // #region agent log
          fetch('http://127.0.0.1:7455/ingest/ab1c7b9f-9dbf-4963-820d-0cb95eb0aab9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ba969'},body:JSON.stringify({sessionId:'2ba969',runId:'run1',hypothesisId:'H1',location:'web/js/app.js:onChunk',message:'Mic chunk received; permission forced Granted',data:{myGen,micGeneration,running:state.running,permission:state.permission,error:state.error,isLive:state.isLive,isHeld:state.isHeld,chunkCount:debugChunkLogs,sampleRate},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
        }
        const nowMs =
          typeof when === 'number' && Number.isFinite(when)
            ? when * 1000
            : performance.now();
        const result = tracker.push(samples, sampleRate, nowMs);
        handleResult(result);
      },
      (message) => {
        if (micGeneration !== myGen) return;
        // #region agent log
        fetch('http://127.0.0.1:7455/ingest/ab1c7b9f-9dbf-4963-820d-0cb95eb0aab9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ba969'},body:JSON.stringify({sessionId:'2ba969',runId:'run1',hypothesisId:'H3',location:'web/js/app.js:onError',message:'Mic onError callback fired',data:{myGen,micGenerationBefore:micGeneration,message,permission:state.permission,running:state.running,error:state.error},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        micGeneration += 1;
        listening = false;
        try {
          stopMic?.();
        } catch {}
        stopMic = null;
        tracker?.reset();
        tracker = null;
        wasInTune = false;
        state.error = message;
        state.running = false;
        state.isLive = false;
        state.isHeld = false;
        state.note = null;
        state.octave = null;
        state.targetFrequency = 0;
        state.detectedFrequency = 0;
        state.cents = 0;
        state.midi = null;
        render();
      }
    );
    // Clear any stale error after a successful mic re-attach.
    state.error = null;
    // #region agent log
    fetch('http://127.0.0.1:7455/ingest/ab1c7b9f-9dbf-4963-820d-0cb95eb0aab9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ba969'},body:JSON.stringify({sessionId:'2ba969',runId:'run1',hypothesisId:'H2',location:'web/js/app.js:attachMic',message:'attachMic succeeded',data:{myGen,micGeneration,permission:state.permission,running:state.running,error:state.error},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    state.error = message;
    state.running = false;
    listening = false;
    const denied =
      e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
    if (denied) {
      state.permission = 'Denied';
    }
    render();
    throw e;
  }
}

function handleResult(result) {
  const aRef = getSettings().aRef;
  if (result.smoothed > 0) {
    const n = fToNote(result.smoothed, aRef);
    const inTune = result.isLive && Math.abs(n.cents) <= IN_TUNE_CENTS;
    if (inTune && !wasInTune) {
      // Light haptic tick when we first cross into the in-tune band.
      navigator.vibrate?.(6);
    }
    wasInTune = inTune;
    state.running = true;
    state.note = n.name;
    state.octave = n.octave;
    state.targetFrequency = n.targetFrequency;
    state.detectedFrequency = result.smoothed;
    state.cents = n.cents;
    state.midi = n.midi;
    state.isLive = result.isLive;
    state.isHeld = result.isHeld;
  } else {
    wasInTune = false;
    state.running = true;
    state.isLive = false;
    state.isHeld = false;
    state.note = null;
    state.octave = null;
    state.targetFrequency = 0;
    state.detectedFrequency = 0;
    state.cents = 0;
    state.midi = null;
  }
  render();
}

async function start() {
  if (attemptingStart) return;
  if (userPaused) return;
  // User intent takes precedence over any pending lifecycle auto-resume.
  autoSuspended = false;
  attemptingStart = true;
  state.error = null;
  try {
    const pre = await getPermissionState();
    // #region agent log
    fetch('http://127.0.0.1:7455/ingest/ab1c7b9f-9dbf-4963-820d-0cb95eb0aab9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ba969'},body:JSON.stringify({sessionId:'2ba969',runId:'run1',hypothesisId:'H4',location:'web/js/app.js:start',message:'start() permission pre-check',data:{pre,attemptingStart,listening,permission:state.permission,running:state.running,error:state.error},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (pre === 'Denied') {
      state.permission = 'Denied';
      render();
      return;
    }
    await attachMicQueued();
    listening = true;
    state.permission = 'Granted';
    state.running = true;
  } catch (e) {
    const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
    state.permission = denied ? 'Denied' : state.permission;
    state.running = false;
    listening = false;
  } finally {
    attemptingStart = false;
    render();
  }
}

function stop() {
  // User intent takes precedence over any pending lifecycle auto-resume.
  autoSuspended = false;
  micGeneration += 1;
  listening = false;
  if (restartDebounce) {
    clearTimeout(restartDebounce);
    restartDebounce = null;
  }
  try {
    stopMic?.();
  } catch {}
  stopMic = null;
  tracker?.reset();
  tracker = null;
  wasInTune = false;
  state.running = false;
  state.isLive = false;
  state.isHeld = false;
  state.note = null;
  state.octave = null;
  state.targetFrequency = 0;
  state.detectedFrequency = 0;
  state.cents = 0;
  state.midi = null;
  render();
}

// Tab/page lifecycle + watchdog (mirrors AppState + watchdog in useTuner).

// Release the mic when the tab goes hidden so the browser mic indicator
// disappears and no audio is captured while the user is on another tab.
// Auto-resume when the tab is visible again, but only if we were the ones
// who suspended (so an explicit user pause stays paused across tab switches).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (listening) {
      stop();
      autoSuspended = true;
    }
    return;
  }
  if (document.visibilityState === 'visible') {
    if (userPaused) return;
    if (autoSuspended) {
      autoSuspended = false;
      void start();
      return;
    }
    if (listening && performance.now() - lastChunkMs > 500) {
      void attachMicQueued();
    }
  }
});

setInterval(() => {
  if (userPaused) return;
  if (!listening) return;
  if (performance.now() - lastChunkMs > 900) {
    void attachMicQueued();
  }
}, 400);

// Device add/remove ≈ iOS route change.
if (navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (userPaused) return;
    scheduleDebouncedRestart();
  });
}

// --- Rendering ---------------------------------------------------------

function render() {
  // Note letter + octave subscript
  if (state.note) {
    noteEl.textContent = prettifyNoteName(state.note);
    noteEl.classList.toggle('is-live', state.isLive || state.isHeld);
    noteEl.classList.remove('is-placeholder');
  } else {
    noteEl.textContent = userPaused ? 'Tuner off' : 'Play a note';
    noteEl.classList.remove('is-live');
    noteEl.classList.add('is-placeholder');
  }
  if (state.octave != null) {
    octaveEl.textContent = String(state.octave);
    octaveEl.hidden = false;
  } else {
    octaveEl.textContent = '';
    octaveEl.hidden = true;
  }

  // Target Hz row (only when a note is present)
  if (state.note && state.targetFrequency > 0) {
    targetHzEl.textContent = `${state.targetFrequency.toFixed(1)} Hz`;
    targetRow.classList.remove('is-hidden');
  } else {
    targetHzEl.textContent = '';
    targetRow.classList.add('is-hidden');
  }

  liveHzEl.textContent =
    state.detectedFrequency > 0
      ? `${state.detectedFrequency.toFixed(1)} Hz`
      : '';

  meter.update({
    cents: state.cents,
    centerMidi: state.midi,
    isLive: state.isLive,
    isHeld: state.isHeld,
    reduceMotion: state.reduceMotion,
  });

  syncPauseUI();

  // Permission banner: show when denied or when we have a runtime error
  // after the user has granted permission (matches the RN UI). Hidden while
  // the user has explicitly paused so it doesn't read as a failure state.
  const showBanner = Boolean(
    !userPaused &&
      (state.permission === 'Denied' ||
        (state.permission === 'Granted' && state.error))
  );
  if (debugBannerLast !== showBanner || showBanner) {
    debugBannerLast = showBanner;
    // #region agent log
    fetch('http://127.0.0.1:7455/ingest/ab1c7b9f-9dbf-4963-820d-0cb95eb0aab9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ba969'},body:JSON.stringify({sessionId:'2ba969',runId:'run1',hypothesisId:'H5',location:'web/js/app.js:render',message:'Banner visibility evaluated',data:{showBanner,hiddenWillBe:!showBanner,permission:state.permission,running:state.running,error:state.error,isLive:state.isLive,isHeld:state.isHeld,detectedFrequency:state.detectedFrequency},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }
  permissionBanner.hidden = !showBanner;
  if (debugRenderDomLogs < 6) {
    debugRenderDomLogs += 1;
    const display =
      typeof getComputedStyle === 'function'
        ? getComputedStyle(permissionBanner).display
        : 'unknown';
    // #region agent log
    fetch('http://127.0.0.1:7455/ingest/ab1c7b9f-9dbf-4963-820d-0cb95eb0aab9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ba969'},body:JSON.stringify({sessionId:'2ba969',runId:'run2',hypothesisId:'H6',location:'web/js/app.js:render',message:'Banner DOM state after assignment',data:{showBanner,assignedHidden:!showBanner,domHidden:permissionBanner.hidden,display,bannerCount:document.querySelectorAll('#permission-banner').length,permission:state.permission,running:state.running,error:state.error,isLive:state.isLive,isHeld:state.isHeld},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }
  if (showBanner) {
    permissionText.textContent =
      state.permission === 'Denied'
        ? 'Microphone access is needed. Click to retry.'
        : 'Microphone error. Click to retry.';
  }
}

permissionBanner.addEventListener('click', () => {
  void start();
});

function syncPauseUI() {
  tunerToggleButton.textContent = userPaused ? 'Start Tuner' : 'Stop Tuner';
  tunerToggleButton.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
  tunerToggleButton.setAttribute(
    'aria-label',
    userPaused ? 'Start tuner' : 'Stop tuner'
  );
}

let togglingPause = false;
tunerToggleButton.addEventListener('click', async () => {
  if (togglingPause) return;
  togglingPause = true;
  try {
    if (userPaused) {
      userPaused = false;
      syncPauseUI();
      await start();
    } else {
      userPaused = true;
      stop();
    }
  } finally {
    togglingPause = false;
  }
});

// --- Bootstrap ---------------------------------------------------------

render();

// Browsers require a user gesture before an AudioContext can start on some
// platforms (notably Safari/iOS). We try immediately; if the AudioContext
// can't start or permission is undetermined, the first tap anywhere on the
// page will retry.
async function bootstrap() {
  try {
    await start();
  } catch {
    // ignore — UI reflects state via render()
  }
}

function onFirstGesture() {
  window.removeEventListener('pointerdown', onFirstGesture);
  window.removeEventListener('keydown', onFirstGesture);
  if (userPaused) return;
  if (!listening) void start();
}
window.addEventListener('pointerdown', onFirstGesture);
window.addEventListener('keydown', onFirstGesture);

bootstrap();

window.addEventListener('beforeunload', stop);
