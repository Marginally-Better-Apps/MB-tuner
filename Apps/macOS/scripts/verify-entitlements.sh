#!/usr/bin/env bash
# Verifies that a built .app bundle carries the entitlements required for
# microphone capture. A missing `com.apple.security.device.audio-input` entry
# causes AVAudioEngine to deliver zero-level buffers with no error.
#
# Usage: ./verify-entitlements.sh path/to/GuitarTuner.app
set -euo pipefail

APP="${1:-}"
if [[ -z "$APP" || ! -d "$APP" ]]; then
    echo "usage: $0 <path-to-GuitarTuner.app>" >&2
    exit 64
fi

ENTS="$(codesign -d --entitlements - -vvv "$APP" 2>/dev/null || true)"

need() {
    if ! grep -q "$1" <<<"$ENTS"; then
        echo "MISSING entitlement: $1" >&2
        exit 1
    fi
    echo "ok   $1"
}

need "com.apple.security.device.audio-input"
need "com.apple.security.app-sandbox"

# Hardened runtime must be enabled for Developer ID distribution.
FLAGS="$(codesign -dvvv "$APP" 2>&1 | grep -E 'flags=' || true)"
if ! grep -q "runtime" <<<"$FLAGS"; then
    echo "WARN: Hardened Runtime not detected ($FLAGS)" >&2
fi

# NSMicrophoneUsageDescription must be present and non-empty.
DESC="$(defaults read "$APP/Contents/Info" NSMicrophoneUsageDescription 2>/dev/null || true)"
if [[ -z "$DESC" ]]; then
    echo "MISSING: NSMicrophoneUsageDescription in Info.plist" >&2
    exit 1
fi
echo "ok   NSMicrophoneUsageDescription: $DESC"

echo "All required capabilities present."
