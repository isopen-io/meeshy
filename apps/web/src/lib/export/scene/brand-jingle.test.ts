import { describe, expect, test } from 'bun:test';

import { BRAND_JINGLE, brandIntroSamples, brandOutroSamples } from './brand-jingle';

const peakOf = (pcm: Float32Array): number => pcm.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0);
const rms = (pcm: Float32Array, from: number, to: number): number => Math.sqrt(pcm.slice(from, to).reduce((sum, sample) => sum + sample * sample, 0) / (to - from));

describe("la signature sonore de Meeshy (miroir de MeeshyBrandJingle Kotlin et Swift)", () => {
  test("l'ouverture dure 2,2 s à 48 kHz", () => {
    expect(brandIntroSamples().length).toBe(105_600);
  });

  test('la fermeture dure 2 s', () => {
    expect(brandOutroSamples().length).toBe(96_000);
  });

  test("le motif est l'arpège de La majeur, entrant à 0, 0,28, 0,56 et 0,84 s", () => {
    expect(BRAND_JINGLE.motif.map((note) => note.frequency)).toEqual([440.0, 554.37, 659.25, 880.0]);
    expect(BRAND_JINGLE.motif.map((note) => note.onsetSeconds)).toEqual([0, 0.28, 0.56, 0.84]);
  });

  test("la fermeture rejoue l'entrée en miroir descendant", () => {
    expect(BRAND_JINGLE.outroMotif.map((note) => note.frequency)).toEqual([880.0, 659.25, 554.37, 440.0]);
    expect(BRAND_JINGLE.outroMotif.map((note) => note.onsetSeconds)).toEqual([0, 0.26, 0.52, 0.78]);
  });

  test('le premier échantillon part de zéro et le dernier est un silence exact', () => {
    const pcm = brandIntroSamples();
    expect(pcm[0]).toBe(0);
    expect(Math.abs(pcm[pcm.length - 1] ?? 1)).toBeLessThan(1e-4);
  });

  test('le pic est normalisé à 0,62, sans écrêtage', () => {
    expect(peakOf(brandIntroSamples())).toBeCloseTo(0.62, 4);
    expect(peakOf(brandOutroSamples())).toBeCloseTo(0.62, 4);
  });

  test("l'énergie est là dès la première seconde et nulle au bout de la queue", () => {
    const pcm = brandIntroSamples();
    expect(rms(pcm, 0, 48_000)).toBeGreaterThan(0.1);
    expect(rms(pcm, pcm.length - 48, pcm.length)).toBeLessThan(0.001);
  });

  test("avant l'entrée de la deuxième note, le signal est la seule note A4 (échantillons-clés au rapport près)", () => {
    const pcm = brandIntroSamples();
    const note = (frame: number): number => {
      const t = frame / 48_000;
      const attack = t < 0.025 ? t / 0.025 : 1;
      return (Math.sin(2 * Math.PI * 440 * t) + 0.126 * Math.sin(2 * Math.PI * 880 * t)) * attack * 0.5 ** (t / 0.62);
    };
    for (const [a, b] of [[300, 700], [1_000, 5_000], [9_000, 13_000]] as const) {
      expect((pcm[a] ?? 0) / (pcm[b] ?? 1)).toBeCloseTo(note(a) / note(b), 3);
    }
  });

  test('deux rendus donnent les mêmes échantillons, au bit près', () => {
    expect(Array.from(brandIntroSamples())).toEqual(Array.from(brandIntroSamples()));
    expect(Array.from(brandOutroSamples())).toEqual(Array.from(brandOutroSamples()));
  });

  test("l'ouverture et la fermeture sont deux signatures distinctes", () => {
    expect(Array.from(brandIntroSamples().slice(0, 2_000))).not.toEqual(Array.from(brandOutroSamples().slice(0, 2_000)));
  });
});
