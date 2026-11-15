import { describe, expect, test } from 'bun:test';

import { fitText, type MeasureText } from './text-fit';

/**
 * UN TEXTE QUI TIENT DANS SA PLACE (#8743 § 5.3, repris par les cadres de gloire
 * #10159) — rétrécit jusqu'à 60 % de sa taille, puis se tronque d'une ellipse,
 * jamais au milieu d'un caractère. La mesure est injectée : une police à chasse
 * fixe suffit à le prouver, sans canevas.
 */

/** Une police à chasse fixe : 0,5 em par caractère. */
const MONO: MeasureText = (text, px) => Array.from(text).length * px * 0.5;

describe('fitText — rétrécir jusqu’à 60 %, puis tronquer', () => {
  test('un texte qui tient reste tel quel', () => {
    expect(fitText(MONO, 'Awa', 100, 20)).toEqual({ text: 'Awa', px: 20 });
  });

  test('un texte un peu long rétrécit sans se tronquer', () => {
    const fitted = fitText(MONO, 'Awa & Karim', 88, 20);
    expect(fitted.text).toBe('Awa & Karim');
    expect(fitted.px).toBeLessThan(20);
    expect(fitted.px).toBeGreaterThanOrEqual(12);
    expect(MONO(fitted.text, fitted.px)).toBeLessThanOrEqual(88);
  });

  test('au-delà de 60 %, il se tronque d’une ellipse', () => {
    const fitted = fitText(MONO, 'Une très longue histoire de famille', 60, 20);
    expect(fitted.px).toBe(12);
    expect(fitted.text.endsWith('…')).toBe(true);
    expect(MONO(fitted.text, fitted.px)).toBeLessThanOrEqual(60);
    expect(fitted.text).toBe('Une très…');
  });

  test('la coupe ne tranche pas un caractère composé', () => {
    const fitted = fitText(MONO, '😀😀😀😀😀😀😀😀😀😀', 18, 10);
    expect(fitted.text).toBe('😀😀😀😀😀…');
  });

  test('aucune place : aucun texte', () => {
    expect(fitText(MONO, 'Awa', 0, 20).text).toBe('');
    expect(fitText(MONO, 'Awa', 2, 20).text).toBe('');
  });
});
