export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

export type NoteName = (typeof NOTE_NAMES)[number];

export type NoteReading = {
  name: NoteName;
  octave: number;
  cents: number;
  midi: number;
  targetFrequency: number;
};

// MIDI 69 corresponds to A4 which we anchor at the configured A reference.
// f = aRef * 2^((midi - 69) / 12)
export function midiToFrequency(midi: number, aRef: number): number {
  return aRef * Math.pow(2, (midi - 69) / 12);
}

export function frequencyToMidi(f: number, aRef: number): number {
  return 12 * Math.log2(f / aRef) + 69;
}

export function fToNote(f: number, aRef: number): NoteReading {
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

/** MIDI note number → spelled note + scientific octave (e.g. G3, B♭4). */
export function midiToNoteOctave(midi: number): { name: NoteName; octave: number } {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return { name: NOTE_NAMES[pitchClass], octave };
}

const SHARP_CHAR = '\u266F';

/** One-line label for UI (unicode sharp). */
export function formatNoteWithOctave(name: NoteName, octave: number): string {
  return `${name.replace('#', SHARP_CHAR)}${octave}`;
}

/** Labels for the flat and sharp ends of a ±1 semitone needle span. */
export function neighborNoteLabels(midi: number): {
  flatSide: string;
  sharpSide: string;
} {
  const lo = midiToNoteOctave(midi - 1);
  const hi = midiToNoteOctave(midi + 1);
  return {
    flatSide: formatNoteWithOctave(lo.name, lo.octave),
    sharpSide: formatNoteWithOctave(hi.name, hi.octave),
  };
}
