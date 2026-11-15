import { describe, expect, test } from 'bun:test';

import { AUDIO_SPEEDS, speedLabel, stretched } from './audio-stretch';

/**
 * CHANGER LA VITESSE D'UN AUDIO (#9163, miroir d'`AudioEditEngine` iOS :
 * `scaleTimeRange` + `audioTimePitchAlgorithm = .spectral`) — la durée se
 * divise par la vitesse, et la HAUTEUR reste celle de la voix.
 */
const SAMPLE_RATE = 16000;
const sine = (seconds: number, hertz: number) =>
  Float32Array.from({ length: Math.round(seconds * SAMPLE_RATE) }, (_, index) => Math.sin((2 * Math.PI * hertz * index) / SAMPLE_RATE) * 0.5);

/** La fréquence lue aux passages par zéro, au cœur du signal (les bords portent les fenêtres). */
const pitchOf = (samples: Float32Array): number => {
  const from = Math.floor(samples.length / 4);
  const to = Math.floor((3 * samples.length) / 4);
  let crossings = 0;
  for (let index = from + 1; index < to; index += 1) {
    if ((samples[index - 1]! < 0) !== (samples[index]! < 0)) crossings += 1;
  }
  return crossings / 2 / ((to - from) / SAMPLE_RATE);
};

describe('stretched', () => {
  (
    [
      [2, 2],
      [1.5, 4 / 1.5],
      [0.75, 4 / 0.75],
      [0.5, 8],
    ] as const
  ).forEach(([rate, seconds]) =>
    test(`à ${rate}×, 4 s durent ${seconds.toFixed(2)} s`, () => {
      const [out] = stretched([sine(4, 440)], rate, SAMPLE_RATE);
      expect(out!.length / SAMPLE_RATE).toBeCloseTo(seconds, 2);
    }),
  );

  [0.5, 0.75, 1.25, 1.5, 2].forEach((rate) =>
    test(`à ${rate}×, un la 440 Hz reste un la 440 Hz`, () => {
      const [out] = stretched([sine(3, 440)], rate, SAMPLE_RATE);
      expect(Math.abs(pitchOf(out!) - 440)).toBeLessThan(440 * 0.03);
    }),
  );

  test('le niveau est gardé : ni trou ni bosse au cœur du son', () => {
    const [out] = stretched([sine(3, 440)], 1.5, SAMPLE_RATE);
    const core = out!.slice(Math.floor(out!.length / 4), Math.floor((3 * out!.length) / 4));
    const peak = core.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    expect(peak).toBeGreaterThan(0.4);
    expect(peak).toBeLessThan(0.6);
  });

  test('à 1×, le son ressort tel quel', () => {
    const source = sine(1, 440);
    const [out] = stretched([source], 1, SAMPLE_RATE);
    expect(out).toEqual(source);
  });

  test('chaque canal garde la même longueur', () => {
    const [left, right] = stretched([sine(2, 440), sine(2, 220)], 1.25, SAMPLE_RATE);
    expect(left!.length).toBe(right!.length);
    expect(left!.length / SAMPLE_RATE).toBeCloseTo(1.6, 2);
  });
});

describe('les paliers d’iOS', () => {
  test('0,5× · 0,75× · 1× · 1,25× · 1,5× · 2×', () => {
    expect(AUDIO_SPEEDS).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2]);
  });

  test('le libellé suit la langue de l’interface', () => {
    expect(speedLabel(0.75, 'fr')).toBe('0,75×');
    expect(speedLabel(1.5, 'en')).toBe('1.5×');
    expect(speedLabel(1, 'fr')).toBe('1×');
  });
});
