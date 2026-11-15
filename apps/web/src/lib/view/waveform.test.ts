import { describe, expect, test } from 'bun:test';

import { interpolatedLevel, waveformBarCount } from './waveform';

describe('waveformBarCount — largeur disponible / (largeur barre + espacement), miroir +Recording.swift:307', () => {
  test('178 px disponibles ⇒ 35 barres (178 / 5)', () => {
    expect(waveformBarCount(178)).toBe(35);
  });

  test('0 px ⇒ au moins UNE barre, jamais zéro', () => {
    expect(waveformBarCount(0)).toBe(1);
  });

  test('largeur négative (mesure pas encore posée) ⇒ au moins UNE barre', () => {
    expect(waveformBarCount(-10)).toBe(1);
  });
});

/**
 * DÉFAUT 8 (revue #5668) — bornes ET point intermédiaire, comme le témoin
 * proposé le demande : `i=0 ⇒ levels[0]`, `i=barCount-1 ⇒ dernier niveau`.
 */
describe('interpolatedLevel — interpolation linéaire, miroir +Recording.swift:333-340', () => {
  test('borne GAUCHE (i=0) ⇒ le PREMIER niveau échantillonné', () => {
    expect(interpolatedLevel(0, 10, [0.1, 0.5, 0.9])).toBe(0.1);
  });

  test('borne DROITE (i=barCount-1) ⇒ le DERNIER niveau échantillonné', () => {
    expect(interpolatedLevel(9, 10, [0.1, 0.5, 0.9])).toBe(0.9);
  });

  test('point INTERMÉDIAIRE entre deux échantillons ⇒ moyenne PONDÉRÉE, ni l’un ni l’autre brut', () => {
    // 2 niveaux [0, 1], 3 barres ⇒ positions 0, 1, 2 sur un segment de
    // longueur 2 (levels.length - 1) ⇒ la barre du MILIEU vaut la moyenne.
    expect(interpolatedLevel(1, 3, [0, 1])).toBeCloseTo(0.5, 10);
  });

  test('UN SEUL niveau échantillonné ⇒ toutes les barres portent CE niveau (rien à interpoler)', () => {
    expect(interpolatedLevel(0, 20, [0.42])).toBe(0.42);
    expect(interpolatedLevel(19, 20, [0.42])).toBe(0.42);
  });

  test('barCount = 1 ⇒ le PREMIER niveau, sans division par zéro', () => {
    expect(interpolatedLevel(0, 1, [0.2, 0.8])).toBe(0.2);
  });

  test('aucun niveau (liste vide) ⇒ 0, jamais une exception', () => {
    expect(interpolatedLevel(0, 10, [])).toBe(0);
  });

  test('plus de barres que d’échantillons (le cas RÉEL : 35 barres pour 15 niveaux) ⇒ une COURBE, jamais un plateau répété', () => {
    const levels = Array.from({ length: 15 }, (_, i) => i / 14); // 0 → 1, croissant.
    const barCount = 35;
    const values = Array.from({ length: barCount }, (_, i) => interpolatedLevel(i, barCount, levels));
    // Croissante de bout en bout (jamais un motif qui se répète) et couvre
    // l'intégralité de la plage [0, 1] des échantillons.
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]!);
    }
    expect(values[0]).toBeCloseTo(0, 10);
    expect(values[barCount - 1]).toBeCloseTo(1, 10);
  });
});
