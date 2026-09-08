import { describe, expect, test } from 'bun:test';

import { armingLaw, electThreadFocus, focusLine, THREAD_FOCUS_BAND_HYSTERESIS, velocityOf } from './election';

/**
 * Miroir `FocalScrollPerspectiveTests.swift:53-65` — la ligne de focus est
 * le centre de la région visible, sauf près du bas du fil.
 */
describe('focusLine', () => {
  test('au repos loin du bas -> centre de la region visible', () => {
    expect(focusLine({ visibleTop: 100, visibleBottom: 700, offsetFromBottom: 300 })).toBe(400);
  });

  test('tres loin du bas -> clampe au centre (une demi-hauteur defilee)', () => {
    expect(focusLine({ visibleTop: 100, visibleBottom: 700, offsetFromBottom: 5000 })).toBe(400);
  });

  test('au repos EN BAS du fil (offsetFromBottom 0) -> bord bas', () => {
    expect(focusLine({ visibleTop: 100, visibleBottom: 700, offsetFromBottom: 0 })).toBe(700);
  });

  test('montee lineaire sur la premiere demi-hauteur', () => {
    expect(focusLine({ visibleTop: 100, visibleBottom: 700, offsetFromBottom: 150 })).toBe(550);
  });

  test('rebond elastique (offset negatif) -> la ligne ne sort jamais de l ecran', () => {
    expect(focusLine({ visibleTop: 100, visibleBottom: 700, offsetFromBottom: -40 })).toBe(700);
  });

  test('region visible degeneree (top === bottom) -> centre', () => {
    expect(focusLine({ visibleTop: 400, visibleBottom: 400, offsetFromBottom: 200 })).toBe(400);
  });
});

/**
 * Miroir `FocalScrollPerspectiveTests.swift:254-263`, hystérésis 95 —
 * `electThreadFocus` est `electFocus` de `lens/law.ts` paramétré par
 * `THREAD_FOCUS_BAND_HYSTERESIS` (import, pas copie).
 */
describe('electThreadFocus', () => {
  test('hysteresis derivee de focus-curve.ts (95)', () => {
    expect(THREAD_FOCUS_BAND_HYSTERESIS).toBe(95);
  });

  test('sans detenteur, elit le plus proche', () => {
    const candidates = [
      { id: 'near', midY: 690 },
      { id: 'far', midY: 400 },
    ];
    expect(electThreadFocus({ candidates, focusY: 700, current: null })).toBe('near');
  });

  test('le detenteur tient dans la bande d hysteresis', () => {
    const candidates = [
      { id: 'near', midY: 700 - 95 + 1 },
      { id: 'other', midY: 702 },
    ];
    expect(electThreadFocus({ candidates, focusY: 700, current: 'near' })).toBe('near');
  });

  test('le detenteur cede au-dela de la bande', () => {
    const candidates = [
      { id: 'near', midY: 700 - 95 - 1 },
      { id: 'other', midY: 702 },
    ];
    expect(electThreadFocus({ candidates, focusY: 700, current: 'near' })).toBe('other');
  });

  test('egalite de distance -> id croissant', () => {
    const candidates = [
      { id: 'b', midY: 710 },
      { id: 'a', midY: 690 },
    ];
    expect(electThreadFocus({ candidates, focusY: 700, current: null })).toBe('a');
  });

  test('liste vide -> aucune election', () => {
    expect(electThreadFocus({ candidates: [], focusY: 700, current: null })).toBeNull();
  });

  test('detenteur absent des candidats -> n entrave pas l election', () => {
    const candidates = [{ id: 'near', midY: 690 }];
    expect(electThreadFocus({ candidates, focusY: 700, current: 'disparu' })).toBe('near');
  });
});

/** Miroir `FocalMagnificationLaw` (`FocalScrollPerspective.swift:293-329`). */
describe('armingLaw.isArmed', () => {
  test('deja armee -> reste armee quels que soient vitesse et duree', () => {
    expect(
      armingLaw.isArmed({ alreadyArmed: true, scrollStartedAt: null, now: 0, velocity: 0 }),
    ).toBe(true);
  });

  test('vitesse au seuil (1200) -> armee immediatement', () => {
    expect(
      armingLaw.isArmed({ alreadyArmed: false, scrollStartedAt: 0, now: 0, velocity: 1200 }),
    ).toBe(true);
  });

  test('vitesse negative au seuil -> armee (signe libre)', () => {
    expect(
      armingLaw.isArmed({ alreadyArmed: false, scrollStartedAt: 0, now: 0, velocity: -1200 }),
    ).toBe(true);
  });

  test('vitesse juste sous le seuil, session nulle -> pas armee', () => {
    expect(
      armingLaw.isArmed({ alreadyArmed: false, scrollStartedAt: 0, now: 0, velocity: 1199.9 }),
    ).toBe(false);
  });

  test('session soutenue exactement au seuil (4000ms) -> armee', () => {
    expect(
      armingLaw.isArmed({ alreadyArmed: false, scrollStartedAt: 0, now: 4000, velocity: 0 }),
    ).toBe(true);
  });

  test('session juste sous le seuil (3999ms) -> pas armee', () => {
    expect(
      armingLaw.isArmed({ alreadyArmed: false, scrollStartedAt: 0, now: 3999, velocity: 0 }),
    ).toBe(false);
  });

  test('aucune session, vitesse nulle -> pas armee', () => {
    expect(
      armingLaw.isArmed({ alreadyArmed: false, scrollStartedAt: null, now: 0, velocity: 0 }),
    ).toBe(false);
  });
});

describe('velocityOf', () => {
  test('120px en 100ms -> 1200 px/s', () => {
    expect(velocityOf({ previousY: 0, previousAt: 0, y: 120, at: 100 })).toBe(1200);
  });

  test('Δt nul -> 0, jamais Infinity', () => {
    expect(velocityOf({ previousY: 0, previousAt: 100, y: 120, at: 100 })).toBe(0);
  });

  test('Δt negatif -> 0', () => {
    expect(velocityOf({ previousY: 0, previousAt: 100, y: 120, at: 50 })).toBe(0);
  });

  test('sens libre -> vitesse signee', () => {
    expect(velocityOf({ previousY: 0, previousAt: 0, y: -120, at: 100 })).toBe(-1200);
  });
});
