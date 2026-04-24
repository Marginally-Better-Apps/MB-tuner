// Port of src/tuning/notes.ts and constants.ts for the web build.

export const NOTE_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F',
  'F#', 'G', 'G#', 'A', 'A#', 'B',
];

/**
 * Half-width of the "in tune" band in cents (±). Matches the native app.
 */
export const IN_TUNE_CENTS = 8;

export function midiToFrequency(midi, aRef) {
  return aRef * Math.pow(2, (midi - 69) / 12);
}

export function frequencyToMidi(f, aRef) {
  return 12 * Math.log2(f / aRef) + 69;
}

export function fToNote(f, aRef) {
  const n = frequencyToMidi(f, aRef);
  const midi = Math.round(n);
  const cents = (n - midi) * 100;
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return {
    name: NOTE_NAMES[pitchClass],
    octave,
    cents,
    midi,
    targetFrequency: midiToFrequency(midi, aRef),
  };
}

export function midiToNoteOctave(midi) {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return { name: NOTE_NAMES[pitchClass], octave };
}

const SHARP_CHAR = '\u266F';

export function formatNoteWithOctave(name, octave) {
  return `${name.replace('#', SHARP_CHAR)}${octave}`;
}

export function neighborNoteLabels(midi) {
  const lo = midiToNoteOctave(midi - 1);
  const hi = midiToNoteOctave(midi + 1);
  return {
    flatSide: formatNoteWithOctave(lo.name, lo.octave),
    sharpSide: formatNoteWithOctave(hi.name, hi.octave),
  };
}

export function prettifyNoteName(name) {
  return name.replace('#', SHARP_CHAR);
}
