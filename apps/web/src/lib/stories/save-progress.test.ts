import { describe, expect, test } from 'bun:test';

import { downloadShare, percent, ringAppearance } from './save-progress';

describe('downloadShare — la part du TÉLÉCHARGEMENT dans l’anneau (0…0,9)', () => {
  test('une moitié de téléchargement vaut 0,45 de l’anneau', () => {
    expect(downloadShare(0.5)).toBeCloseTo(0.45);
  });

  test('borné à [0, 1] — un ratio hors bornes ne déborde pas l’anneau', () => {
    expect(downloadShare(-1)).toBe(0);
    expect(downloadShare(2)).toBeCloseTo(0.9);
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

describe('ringAppearance — accent tant qu’annulable ; le balayage dit qu’AUCUNE progression ne se publie', () => {
  test('annulable, progression connue ⇒ accent, sans balayage', () => {
    expect(ringAppearance({ cancellable: true, indeterminate: false })).toEqual({ tone: 'accent', sweeps: false });
  });

  test('annulable, flux SANS longueur (le cas nominal de la passerelle) ⇒ accent + balayage — un anneau figé à 0 % dirait « rien ne se passe »', () => {
    expect(ringAppearance({ cancellable: true, indeterminate: true })).toEqual({ tone: 'accent', sweeps: true });
  });

  test('livraison entamée ⇒ inerte + balayage — la seule chose qui bouge pendant une passe qui ne publie rien', () => {
    expect(ringAppearance({ cancellable: false, indeterminate: false })).toEqual({ tone: 'inert', sweeps: true });
  });
});
