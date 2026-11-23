/**
 * Le rallumage par l'effort (#20455, tranche 1 de #17371) : deux rêves complets dans les 48 heures rallument la
 * Flamme sans payer ; les 3 Meeshes restent le raccourci.
 */

import { describe, it, expect } from 'vitest';
import {
  FLAME_EFFORT_RELIGHT_DREAMS,
  canRelightByEffort,
  relightByEffort,
  wholeDreamDays,
} from '../../utils/game/flame-effort';

const act = (dayKey: string, slot: number, completed = true) => ({ dayKey, slot, completed });
const wholeDay = (dayKey: string) => [act(dayKey, 0), act(dayKey, 1), act(dayKey, 2)];

describe('wholeDreamDays — les journées dont le Rêve est complet', () => {
  it('compte un Rêve de trois actes tous faits', () => {
    expect(wholeDreamDays(wholeDay('2026-10-04'))).toEqual(['2026-10-04']);
  });

  it('compte le premier Rêve d’un seul acte fait (#17370)', () => {
    expect(wholeDreamDays([act('2026-10-04', 0)])).toEqual(['2026-10-04']);
  });

  it('ne compte pas un Rêve dont un acte reste à faire', () => {
    expect(wholeDreamDays([act('2026-10-04', 0), act('2026-10-04', 1), act('2026-10-04', 2, false)])).toEqual([]);
  });

  it('ne compte pas un Rêve tiré à moitié, ni la mission personnelle', () => {
    expect(wholeDreamDays([act('2026-10-04', 1), act('2026-10-04', 2), act('2026-10-04', 3)])).toEqual([]);
  });

  it('ignore la mission personnelle d’un Rêve complet, même inachevée', () => {
    expect(wholeDreamDays([...wholeDay('2026-10-04'), act('2026-10-04', 3, false)])).toEqual(['2026-10-04']);
  });

  it('rend les journées triées, une fois chacune', () => {
    expect(wholeDreamDays([...wholeDay('2026-10-05'), ...wholeDay('2026-10-04')])).toEqual(['2026-10-04', '2026-10-05']);
  });
});

describe('canRelightByEffort — deux rêves complets dans la fenêtre de rallumage', () => {
  const base = { brokenLastDay: '2026-10-02', streakBeforeBreak: 12 };

  it('demande deux rêves complets', () => {
    expect(FLAME_EFFORT_RELIGHT_DREAMS).toBe(2);
  });

  it('rallume au second Rêve complet, le dernier jour de la fenêtre', () => {
    expect(canRelightByEffort({ ...base, today: '2026-10-05', dreamDays: ['2026-10-04', '2026-10-05'] })).toEqual({
      allowed: true,
      dreamsDone: 2,
      dreamsNeeded: 2,
      closesOn: '2026-10-05',
    });
  });

  it('dit ce qui manque après un seul Rêve complet', () => {
    expect(canRelightByEffort({ ...base, today: '2026-10-04', dreamDays: ['2026-10-04'] })).toEqual({
      allowed: false,
      reason: 'dreams-missing',
      dreamsDone: 1,
      dreamsNeeded: 2,
      closesOn: '2026-10-05',
    });
  });

  it('ne compte que les rêves d’APRÈS la rupture', () => {
    const verdict = canRelightByEffort({ ...base, today: '2026-10-05', dreamDays: ['2026-10-01', '2026-10-02', '2026-10-05'] });
    expect(verdict).toMatchObject({ allowed: false, reason: 'dreams-missing', dreamsDone: 1 });
  });

  it('ne compte pas un Rêve daté après aujourd’hui', () => {
    const verdict = canRelightByEffort({ ...base, today: '2026-10-04', dreamDays: ['2026-10-04', '2026-10-05'] });
    expect(verdict).toMatchObject({ allowed: false, reason: 'dreams-missing', dreamsDone: 1 });
  });

  it('refuse une fois la fenêtre fermée, même avec deux rêves complets', () => {
    const verdict = canRelightByEffort({ ...base, today: '2026-10-06', dreamDays: ['2026-10-05', '2026-10-06'] });
    expect(verdict).toEqual({ allowed: false, reason: 'window-closed', dreamsDone: 2, dreamsNeeded: 2, closesOn: '2026-10-05' });
  });

  it('refuse une Flamme qui n’est pas éteinte', () => {
    const verdict = canRelightByEffort({ ...base, today: '2026-10-03', dreamDays: ['2026-10-03'] });
    expect(verdict).toMatchObject({ allowed: false, reason: 'not-extinguished' });
  });

  it('refuse quand il n’y a aucune série à rendre', () => {
    expect(canRelightByEffort({ brokenLastDay: null, streakBeforeBreak: 0, today: '2026-10-05', dreamDays: [] })).toEqual({
      allowed: false,
      reason: 'no-streak',
      dreamsDone: 0,
      dreamsNeeded: 2,
      closesOn: null,
    });
    expect(canRelightByEffort({ ...base, streakBeforeBreak: 0, today: '2026-10-05', dreamDays: ['2026-10-04', '2026-10-05'] })).toMatchObject({
      allowed: false,
      reason: 'no-streak',
    });
  });
});

describe('relightByEffort — la série rendue', () => {
  it('ajoute à la série perdue les jours rejoués depuis la rupture', () => {
    expect(
      relightByEffort({ brokenLastDay: '2026-10-02', streakBeforeBreak: 12, today: '2026-10-05', lastActiveDay: '2026-10-05', currentStreak: 2 }),
    ).toEqual({ streak: 14, lastActiveDay: '2026-10-05' });
  });

  it('garde le dernier jour actif quand le geste du jour n’est pas encore compté', () => {
    expect(
      relightByEffort({ brokenLastDay: '2026-10-02', streakBeforeBreak: 12, today: '2026-10-05', lastActiveDay: '2026-10-04', currentStreak: 1 }),
    ).toEqual({ streak: 13, lastActiveDay: '2026-10-04' });
  });

  it('sans série reprise, rend la série perdue et pose hier pour que le geste du jour s’y ajoute', () => {
    expect(
      relightByEffort({ brokenLastDay: '2026-10-02', streakBeforeBreak: 12, today: '2026-10-05', lastActiveDay: '2026-10-02', currentStreak: 12 }),
    ).toEqual({ streak: 12, lastActiveDay: '2026-10-04' });
  });
});
