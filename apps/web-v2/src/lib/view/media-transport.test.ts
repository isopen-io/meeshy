import { describe, expect, test } from 'bun:test';

import {
  PLAYBACK_SPEEDS,
  SEEK_STEP_SECONDS,
  attachmentDurationLabel,
  formatMediaTime,
  keyboardSeekTarget,
  seekFraction,
  speedLabel,
} from './media-transport';

/**
 * LA LOI DE LA BARRE DE LECTURE (#6359) — miroir de `formatMediaDuration`
 * (`MediaTypes.swift:596`), `VideoTransportControls.speeds` et
 * `MediaStageSeek.step` (SDK). Pure : aucun élément média, aucun DOM.
 */
describe('formatMediaTime — m:ss, comme formatMediaDuration côté iOS', () => {
  const cases: readonly (readonly [number, string])[] = [
    [0, '0:00'],
    [7, '0:07'],
    [65.9, '1:05'],
    [600, '10:00'],
    [3725, '62:05'],
  ];
  for (const [seconds, label] of cases) {
    test(`${seconds} s ⇒ ${label}`, () => {
      expect(formatMediaTime(seconds)).toBe(label);
    });
  }

  test('une durée inconnue (NaN, Infinity, négative) ne ment pas : 0:00', () => {
    expect(formatMediaTime(Number.NaN)).toBe('0:00');
    expect(formatMediaTime(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatMediaTime(-3)).toBe('0:00');
  });
});

describe('attachmentDurationLabel — la durée de la PIÈCE, lisible avant la première image', () => {
  test('12 000 ms ⇒ « 0:12 »', () => {
    expect(attachmentDurationLabel(12_000)).toBe('0:12');
  });

  test('une durée absente ou nulle ⇒ aucun libellé (un « 0:00 » faux se croit)', () => {
    expect(attachmentDurationLabel(undefined)).toBeNull();
    expect(attachmentDurationLabel(0)).toBeNull();
  });
});

describe('speedLabel — la vitesse dans la langue de l’interface', () => {
  test('les paliers sont ceux d’iOS : 1×, 1,25×, 1,5×, 1,75×, 2×', () => {
    expect([...PLAYBACK_SPEEDS]).toEqual([1, 1.25, 1.5, 1.75, 2]);
  });

  test('le séparateur décimal suit la langue', () => {
    expect(speedLabel(1.25, 'fr')).toBe('1,25×');
    expect(speedLabel(1.25, 'en')).toBe('1.25×');
    expect(speedLabel(2, 'fr')).toBe('2×');
  });
});

describe('seekFraction — la position visée par le doigt sur la piste', () => {
  test('le milieu de la piste vise la moitié', () => {
    expect(seekFraction({ clientX: 150, left: 100, width: 100 })).toBe(0.5);
  });

  test('hors de la piste, la fraction reste bornée à [0, 1]', () => {
    expect(seekFraction({ clientX: 40, left: 100, width: 100 })).toBe(0);
    expect(seekFraction({ clientX: 260, left: 100, width: 100 })).toBe(1);
  });

  test('une piste sans largeur (pas encore mise en page) vise le début', () => {
    expect(seekFraction({ clientX: 150, left: 100, width: 0 })).toBe(0);
  });
});

describe('keyboardSeekTarget — le curseur au clavier, pas de 10 s comme MediaStageSeek', () => {
  test('le pas est celui du double tap latéral iOS', () => {
    expect(SEEK_STEP_SECONDS).toBe(10);
  });

  test('flèche droite ou haut avance de 10 s, gauche ou bas recule de 10 s', () => {
    expect(keyboardSeekTarget({ key: 'ArrowRight', position: 20, duration: 60 })).toBe(30);
    expect(keyboardSeekTarget({ key: 'ArrowUp', position: 20, duration: 60 })).toBe(30);
    expect(keyboardSeekTarget({ key: 'ArrowLeft', position: 20, duration: 60 })).toBe(10);
    expect(keyboardSeekTarget({ key: 'ArrowDown', position: 20, duration: 60 })).toBe(10);
  });

  test('Début et Fin vont aux bornes', () => {
    expect(keyboardSeekTarget({ key: 'Home', position: 20, duration: 60 })).toBe(0);
    expect(keyboardSeekTarget({ key: 'End', position: 20, duration: 60 })).toBe(60);
  });

  test('le saut est borné : à 3 s du début, reculer ramène à 0, jamais en dessous', () => {
    expect(keyboardSeekTarget({ key: 'ArrowLeft', position: 3, duration: 60 })).toBe(0);
    expect(keyboardSeekTarget({ key: 'ArrowRight', position: 55, duration: 60 })).toBe(60);
  });

  test('une autre touche, ou une durée inconnue, ne décide rien', () => {
    expect(keyboardSeekTarget({ key: 'Enter', position: 20, duration: 60 })).toBeNull();
    expect(keyboardSeekTarget({ key: 'ArrowRight', position: 20, duration: Number.NaN })).toBeNull();
  });
});
