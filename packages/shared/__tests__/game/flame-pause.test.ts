/**
 * La Flamme en veille (#17372, #20507) : une pause annoncée de un à sept jours, une fois par trimestre civil.
 */

import { describe, it, expect } from 'vitest';
import { addDays } from '../../utils/game/day-prng';
import { advanceFlame, flameStatus } from '../../utils/game/flame';
import {
  FLAME_PAUSE_MAX_DAYS,
  canPauseFlame,
  isFlamePausedOn,
  pauseEndedBy,
  quarterOf,
  restedLastActiveDay,
  servedFlamePause,
  type FlamePause,
} from '../../utils/game/flame-pause';

const week: FlamePause = { from: '2026-11-24', until: '2026-11-30' };

const statusOn = (today: string, pause: FlamePause | null, lastActiveDay = '2026-11-23', freezes = 0) =>
  flameStatus({ lastActiveDay: restedLastActiveDay({ lastActiveDay, through: today, pause }), today, streak: 12, freezes });

const gestureOn = (today: string, pause: FlamePause | null, lastActiveDay = '2026-11-23', freezes = 0) =>
  advanceFlame({
    lastActiveDay: restedLastActiveDay({ lastActiveDay, through: addDays(today, -1), pause }),
    today,
    streak: 12,
    freezes,
  });

describe('quarterOf', () => {
  it('range chaque mois dans son trimestre civil', () => {
    expect(quarterOf('2026-01-01')).toBe('2026-T1');
    expect(quarterOf('2026-03-31')).toBe('2026-T1');
    expect(quarterOf('2026-04-01')).toBe('2026-T2');
    expect(quarterOf('2026-09-30')).toBe('2026-T3');
    expect(quarterOf('2026-12-31')).toBe('2026-T4');
  });
});

describe('canPauseFlame', () => {
  it('ouvre la veille DEMAIN, pour le nombre de jours annoncé', () => {
    expect(canPauseFlame({ today: '2026-11-23', days: 7, status: 'lit', pause: null })).toEqual({ allowed: true, pause: week });
    expect(canPauseFlame({ today: '2026-11-23', days: 1, status: 'at-risk', pause: null })).toEqual({
      allowed: true,
      pause: { from: '2026-11-24', until: '2026-11-24' },
    });
  });

  it('accepte une Flamme couverte par ses Veilleuses', () => {
    expect(canPauseFlame({ today: '2026-11-23', days: 3, status: 'covered', pause: null }).allowed).toBe(true);
  });

  it.each([0, 8, -1, 2.5, Number.NaN])('refuse %s jours', (days) => {
    expect(canPauseFlame({ today: '2026-11-23', days, status: 'lit', pause: null })).toEqual({ allowed: false, reason: 'invalid-days' });
  });

  it('ne garde rien sans Flamme, ni pour une Flamme éteinte', () => {
    expect(canPauseFlame({ today: '2026-11-23', days: 3, status: 'none', pause: null })).toEqual({ allowed: false, reason: 'no-flame' });
    expect(canPauseFlame({ today: '2026-11-23', days: 3, status: 'out', pause: null })).toEqual({ allowed: false, reason: 'no-flame' });
  });

  it('refuse une seconde annonce pendant une veille en cours ou à venir', () => {
    expect(canPauseFlame({ today: '2026-11-23', days: 3, status: 'lit', pause: week })).toEqual({ allowed: false, reason: 'already-paused' });
    expect(canPauseFlame({ today: '2026-11-27', days: 3, status: 'lit', pause: week })).toEqual({ allowed: false, reason: 'already-paused' });
    expect(canPauseFlame({ today: '2026-11-30', days: 3, status: 'lit', pause: week })).toEqual({ allowed: false, reason: 'already-paused' });
  });

  it('une fois par trimestre civil : la veille de novembre ferme décembre, pas janvier', () => {
    expect(canPauseFlame({ today: '2026-12-05', days: 3, status: 'lit', pause: week })).toEqual({ allowed: false, reason: 'quarterly-limit' });
    expect(canPauseFlame({ today: '2026-12-31', days: 3, status: 'lit', pause: week })).toEqual({
      allowed: true,
      pause: { from: '2027-01-01', until: '2027-01-03' },
    });
  });

  it("une veille terminée avant son premier jour ne compte pas pour le trimestre", () => {
    const cancelled = { from: '2026-11-24', until: '2026-11-23' };
    expect(canPauseFlame({ today: '2026-11-25', days: 2, status: 'lit', pause: cancelled }).allowed).toBe(true);
  });

  it('une veille écourtée compte pour le trimestre', () => {
    const cut = { from: '2026-11-24', until: '2026-11-25' };
    expect(canPauseFlame({ today: '2026-11-28', days: 2, status: 'lit', pause: cut })).toEqual({ allowed: false, reason: 'quarterly-limit' });
  });

  it('plafonne à sept jours', () => {
    expect(FLAME_PAUSE_MAX_DAYS).toBe(7);
  });
});

describe('restedLastActiveDay — la Flamme attend', () => {
  it("sans veille, le dernier jour actif ne bouge pas", () => {
    expect(restedLastActiveDay({ lastActiveDay: '2026-11-23', through: '2026-11-27', pause: null })).toBe('2026-11-23');
    expect(restedLastActiveDay({ lastActiveDay: null, through: '2026-11-27', pause: week })).toBeNull();
  });

  it("un jour en veille n'est jamais à risque, ni éteint", () => {
    expect(statusOn('2026-11-24', week)).toBe('lit');
    expect(statusOn('2026-11-27', week)).toBe('lit');
    expect(statusOn('2026-11-30', week)).toBe('lit');
  });

  it('le lendemain de la veille se lit comme le lendemain du dernier geste', () => {
    expect(statusOn('2026-12-01', week)).toBe('at-risk');
    expect(statusOn('2026-12-02', week)).toBe('out');
    expect(statusOn('2026-12-02', week, '2026-11-23', 1)).toBe('covered');
  });

  it('sans veille, la même absence éteint la Flamme', () => {
    expect(statusOn('2026-11-27', null)).toBe('out');
  });

  it("revenir pendant la veille reprend la série : un jour de plus, aucune Veilleuse consommée", () => {
    expect(gestureOn('2026-11-27', week)).toMatchObject({ outcome: 'continued', streak: 13, freezes: 0 });
  });

  it('revenir le lendemain de la veille aussi', () => {
    expect(gestureOn('2026-12-01', week)).toMatchObject({ outcome: 'continued', streak: 13 });
  });

  it('les jours manqués AVANT la veille restent manqués', () => {
    const tardy = { from: '2026-11-26', until: '2026-11-30' };
    expect(gestureOn('2026-11-28', tardy, '2026-11-23', 2)).toMatchObject({ outcome: 'protected', freezesUsed: 2, streak: 13 });
    expect(gestureOn('2026-11-28', tardy, '2026-11-23', 1)).toMatchObject({ outcome: 'broken' });
  });

  it("une veille d'avant le dernier geste ne change rien", () => {
    expect(restedLastActiveDay({ lastActiveDay: '2026-12-03', through: '2026-12-05', pause: week })).toBe('2026-12-03');
  });
});

describe('pauseEndedBy', () => {
  it('le geste en veille la termine la veille du geste', () => {
    expect(pauseEndedBy(week, '2026-11-27')).toEqual({ from: '2026-11-24', until: '2026-11-26' });
  });

  it('le geste du premier jour la vide', () => {
    expect(pauseEndedBy(week, '2026-11-24')).toEqual({ from: '2026-11-24', until: '2026-11-23' });
    expect(isFlamePausedOn({ from: '2026-11-24', until: '2026-11-23' }, '2026-11-24')).toBe(false);
  });

  it('hors de la veille, rien ne change', () => {
    expect(pauseEndedBy(week, '2026-11-23')).toBeNull();
    expect(pauseEndedBy(week, '2026-12-01')).toBeNull();
    expect(pauseEndedBy(null, '2026-11-27')).toBeNull();
  });
});

describe('servedFlamePause', () => {
  it('se dit dès l’annonce et jusqu’au dernier jour', () => {
    expect(servedFlamePause(week, '2026-11-23')).toEqual(week);
    expect(servedFlamePause(week, '2026-11-30')).toEqual(week);
  });

  it('se tait après, et pour une veille vide', () => {
    expect(servedFlamePause(week, '2026-12-01')).toBeNull();
    expect(servedFlamePause({ from: '2026-11-24', until: '2026-11-23' }, '2026-11-23')).toBeNull();
    expect(servedFlamePause(null, '2026-11-23')).toBeNull();
  });
});
