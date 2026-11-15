import { describe, expect, test } from 'bun:test';

import { DRIFT_PERIOD_MS, SHEEN_PASSES, SHEEN_PASS_MS, SHOCKWAVE_MS, driftTilt, shockwaveState, sheenState, tiltFromOrientation } from './timeline';

/**
 * LE TEMPS DES EFFETS (#9381) — fonctions pures, sans horloge ni canvas.
 * « Le reflet s'arrête après 3 passages » ; la durée de l'onde est celle de la
 * frappe ; l'irisation suit l'orientation de l'appareil.
 */
describe('sheenState — un passage, puis le repos, trois fois', () => {
  test('trois passages de 3,6 s, comme le repli CSS', () => {
    expect(SHEEN_PASSES).toBe(3);
    expect(SHEEN_PASS_MS).toBe(3600);
  });

  test('le trait attend 55 % du passage, puis balaie de 0 à 1', () => {
    expect(sheenState(0).progress).toBe(0);
    expect(sheenState(SHEEN_PASS_MS * 0.55).progress).toBe(0);
    expect(sheenState(SHEEN_PASS_MS * 0.775).progress).toBeCloseTo(0.5, 5);
    expect(sheenState(SHEEN_PASS_MS * 0.999).progress).toBeGreaterThan(0.99);
  });

  test('chaque passage recommence : le numéro de passage avance', () => {
    expect(sheenState(SHEEN_PASS_MS * 0.9).pass).toBe(0);
    expect(sheenState(SHEEN_PASS_MS * 1.9).pass).toBe(1);
    expect(sheenState(SHEEN_PASS_MS * 2.9).pass).toBe(2);
    expect(sheenState(SHEEN_PASS_MS * 1.9).progress).toBeCloseTo(sheenState(SHEEN_PASS_MS * 0.9).progress, 5);
  });

  test('après le troisième passage : fini, trait au repos', () => {
    expect(sheenState(SHEEN_PASS_MS * 2.99).done).toBe(false);
    const after = sheenState(SHEEN_PASS_MS * 3);
    expect(after.done).toBe(true);
    expect(after.progress).toBe(0);
  });

  test('un temps négatif ou illisible ne casse rien', () => {
    expect(sheenState(-5)).toMatchObject({ progress: 0, done: false });
    expect(sheenState(Number.NaN)).toMatchObject({ progress: 0, done: false });
  });

  test('le nombre de passages est réglable', () => {
    expect(sheenState(SHEEN_PASS_MS, 1).done).toBe(true);
  });
});

describe('shockwaveState — une onde, une fois', () => {
  test('progresse de 0 à 1 sur la durée de l’onde, puis s’arrête', () => {
    expect(shockwaveState(0)).toEqual({ progress: 0, done: false });
    expect(shockwaveState(SHOCKWAVE_MS / 2).progress).toBeCloseTo(0.5, 5);
    expect(shockwaveState(SHOCKWAVE_MS)).toEqual({ progress: 1, done: true });
    expect(shockwaveState(SHOCKWAVE_MS * 3)).toEqual({ progress: 1, done: true });
  });
});

describe('tiltFromOrientation — l’irisation suit l’inclinaison', () => {
  test('à plat à 45° (tenu en main) : au centre', () => {
    expect(tiltFromOrientation({ beta: 45, gamma: 0 })).toEqual([0, 0]);
  });

  test('chaque axe est borné à [-1, 1] (±45°)', () => {
    expect(tiltFromOrientation({ beta: 45, gamma: 22.5 })).toEqual([0.5, 0]);
    expect(tiltFromOrientation({ beta: 135, gamma: -90 })).toEqual([-1, 1]);
  });

  test('un capteur muet (null) donne le centre', () => {
    expect(tiltFromOrientation({ beta: null, gamma: null })).toEqual([0, 0]);
    expect(tiltFromOrientation({ beta: Number.NaN, gamma: 10 })[1]).toBe(0);
  });
});

describe('driftTilt — sans capteur, une dérive lente qui s’arrête', () => {
  test('oscille dans [-1, 1] pendant trois périodes', () => {
    for (const t of [0, 1000, 2500, DRIFT_PERIOD_MS * 2.5]) {
      const state = driftTilt(t);
      expect(state.done).toBe(false);
      expect(Math.abs(state.tilt[0])).toBeLessThanOrEqual(1);
      expect(Math.abs(state.tilt[1])).toBeLessThanOrEqual(1);
    }
  });

  test('puis se repose au centre', () => {
    expect(driftTilt(DRIFT_PERIOD_MS * 3)).toEqual({ tilt: [0, 0], done: true });
  });
});
