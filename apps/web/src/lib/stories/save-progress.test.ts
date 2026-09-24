import { describe, expect, test } from 'bun:test';

import { deliveryDone, downloadShare, percent, ringAppearance } from './save-progress';

describe('downloadShare — la part du TÉLÉCHARGEMENT dans l’anneau (0…0,9)', () => {
  test('une moitié de téléchargement vaut 0,45 de l’anneau', () => {
    expect(downloadShare(0.5)).toBeCloseTo(0.45);
  });

  test('borné à [0, 1] — un ratio hors bornes ne déborde pas l’anneau', () => {
    expect(downloadShare(-1)).toBe(0);
    expect(downloadShare(2)).toBeCloseTo(0.9);
  });
});

describe('deliveryDone — la LIVRAISON n’a pas de callback, elle est pleine dès qu’on l’atteint', () => {
  test('vaut toujours 1', () => {
    expect(deliveryDone()).toBe(1);
  });
});

describe('percent — LE CHIFFRE DÉRIVE DE `downloadShare`, jamais un second calcul', () => {
  test('percent(0,456) = 41 — round(0,456 × 0,9 × 100)', () => {
    expect(percent(0.456)).toBe(41);
  });

  test('percent(0,4) = 36 — la valeur que l’anneau affiche à 40 % de téléchargement', () => {
    expect(percent(0.4)).toBe(36);
  });
});

describe('ringAppearance — accent tant qu’annulable, inerte + balayage sinon (sauf reduceMotion)', () => {
  test('annulable ⇒ accent, sans balayage', () => {
    expect(ringAppearance({ cancellable: true, reduceMotion: false })).toEqual({ tone: 'accent', sweeps: false });
    /* Même un mouvement réduit ne fait pas balayer un anneau encore annulable. */
    expect(ringAppearance({ cancellable: true, reduceMotion: true })).toEqual({ tone: 'accent', sweeps: false });
  });

  test('non annulable ⇒ inerte + balayage — la seule chose qui bouge pendant la livraison muette', () => {
    expect(ringAppearance({ cancellable: false, reduceMotion: false })).toEqual({ tone: 'inert', sweeps: true });
  });

  test('non annulable ET mouvement réduit ⇒ inerte SANS balayage', () => {
    expect(ringAppearance({ cancellable: false, reduceMotion: true })).toEqual({ tone: 'inert', sweeps: false });
  });
});
