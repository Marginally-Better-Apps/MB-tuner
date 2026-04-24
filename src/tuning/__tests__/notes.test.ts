import {
  fToNote,
  frequencyToMidi,
  midiToFrequency,
  midiToNoteOctave,
  neighborNoteLabels,
  NOTE_NAMES,
} from '../notes';

describe('fToNote at A=440', () => {
  it('recognizes A4 exactly', () => {
    const r = fToNote(440, 440);
    expect(r.name).toBe('A');
    expect(r.octave).toBe(4);
    expect(r.midi).toBe(69);
    expect(Math.abs(r.cents)).toBeLessThan(1e-9);
  });

  it('recognizes E2 from the standard guitar low string', () => {
    const f = 82.4068892282; // E2 at A440
    const r = fToNote(f, 440);
    expect(r.name).toBe('E');
    expect(r.octave).toBe(2);
    expect(Math.abs(r.cents)).toBeLessThan(0.01);
  });

  it('reports positive cents just shy of the next semitone', () => {
    const f = 440 * Math.pow(2, 0.49 / 12);
    const r = fToNote(f, 440);
    expect(r.name).toBe('A');
    expect(r.cents).toBeCloseTo(49, 2);
  });

  it('reports negative cents just above the previous semitone', () => {
    const f = 440 * Math.pow(2, -0.49 / 12);
    const r = fToNote(f, 440);
    expect(r.name).toBe('A');
    expect(r.cents).toBeCloseTo(-49, 2);
  });

  it('handles octave boundaries (C5)', () => {
    const f = 440 * Math.pow(2, 3 / 12); // C5 is 3 semitones above A4
    const r = fToNote(f, 440);
    expect(r.name).toBe('C');
    expect(r.octave).toBe(5);
  });
});

describe('fToNote at A=443', () => {
  it('treats 443 Hz as A4', () => {
    const r = fToNote(443, 443);
    expect(r.name).toBe('A');
    expect(r.octave).toBe(4);
    expect(Math.abs(r.cents)).toBeLessThan(1e-9);
  });

  it('shifts the target frequency of E4 accordingly', () => {
    const r = fToNote(443, 443);
    expect(r.targetFrequency).toBeCloseTo(443, 5);
  });
});

describe('midi <-> frequency round trips', () => {
  it.each([21, 48, 57, 60, 69, 72, 84, 96])('midi=%i', (midi) => {
    const f = midiToFrequency(midi, 440);
    expect(frequencyToMidi(f, 440)).toBeCloseTo(midi, 10);
  });
});

describe('pitch class alignment', () => {
  it('has 12 semitone names', () => {
    expect(NOTE_NAMES).toHaveLength(12);
  });

  it('starts at C', () => {
    expect(NOTE_NAMES[0]).toBe('C');
  });
});

describe('midiToNoteOctave', () => {
  it('maps G2', () => {
    const { name, octave } = midiToNoteOctave(43);
    expect(name).toBe('G');
    expect(octave).toBe(2);
  });

  it('maps C3 at the octave boundary', () => {
    const { name, octave } = midiToNoteOctave(48);
    expect(name).toBe('C');
    expect(octave).toBe(3);
  });
});

describe('neighborNoteLabels', () => {
  it('returns a semitone below and above G2', () => {
    const n = neighborNoteLabels(43);
    expect(n.flatSide.replace('\u266F', '#')).toBe('F#2');
    expect(n.sharpSide.replace('\u266F', '#')).toBe('G#2');
  });

  it('wraps B to C across the octave', () => {
    const n = neighborNoteLabels(59); // B3
    expect(n.flatSide.replace('\u266F', '#')).toBe('A#3');
    expect(n.sharpSide).toMatch(/^C4$/);
  });
});
