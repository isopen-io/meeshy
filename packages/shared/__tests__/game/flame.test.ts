/**
 * La Flamme (#9373) : cinq formes, bonus, gels, rallumage, transition de série.
 */

import { describe, it, expect } from 'vitest';
import {
  FLAME_FREEZE_MAX,
  FLAME_FREEZE_PRICE,
  FLAME_RELIGHT_PRICE,
  advanceFlame,
  canBuyFreeze,
  canRelight,
  flameBonus,
  flameForm,
  flameStatus,
  relightFlame,
} from '../../utils/game/flame.js';

describe('les formes', () => {
  it('n\'a pas de flamme sans série', () => {
    expect(flameForm(0)).toBeNull();
  });

  it('range 1–6 braise, 7–29 flamme, 30–99 brasier, 100–364 astre, 365+ soleil', () => {
    expect(flameForm(1)).toBe('braise');
    expect(flameForm(6)).toBe('braise');
    expect(flameForm(7)).toBe('flamme');
    expect(flameForm(29)).toBe('flamme');
    expect(flameForm(30)).toBe('brasier');
    expect(flameForm(99)).toBe('brasier');
    expect(flameForm(100)).toBe('astre');
    expect(flameForm(364)).toBe('astre');
    expect(flameForm(365)).toBe('soleil');
    expect(flameForm(2000)).toBe('soleil');
  });
});

describe('le bonus de Flamme', () => {
  it('vaut 2 % par jour, plafonné à 50 %', () => {
    expect(flameBonus(0)).toBe(0);
    expect(flameBonus(1)).toBeCloseTo(0.02, 10);
    expect(flameBonus(23)).toBeCloseTo(0.46, 10);
    expect(flameBonus(25)).toBeCloseTo(0.5, 10);
    expect(flameBonus(400)).toBe(0.5);
  });

  it('ignore une série illisible', () => {
    expect(flameBonus(Number.NaN)).toBe(0);
    expect(flameBonus(-3)).toBe(0);
  });
});

describe('les prix et plafonds', () => {
  it('suit la conception', () => {
    expect(FLAME_FREEZE_MAX).toBe(2);
    expect(FLAME_FREEZE_PRICE).toBe(1);
    expect(FLAME_RELIGHT_PRICE).toBe(3);
  });

  it('refuse un troisième gel et un gel sans Meesh', () => {
    expect(canBuyFreeze({ freezes: 1, balance: 1 })).toEqual({ allowed: true });
    expect(canBuyFreeze({ freezes: 2, balance: 5 })).toEqual({ allowed: false, reason: 'at-maximum' });
    expect(canBuyFreeze({ freezes: 0, balance: 0 })).toEqual({ allowed: false, reason: 'insufficient-balance' });
  });
});

describe('la transition de série', () => {
  it('démarre une série au premier jour', () => {
    expect(advanceFlame({ lastActiveDay: null, today: '2026-10-05', streak: 0, freezes: 0 })).toEqual({
      outcome: 'started',
      streak: 1,
      freezes: 0,
      freezesUsed: 0,
      missedDays: 0,
      lostStreak: 0,
    });
  });

  it('ne change rien un même jour', () => {
    const r = advanceFlame({ lastActiveDay: '2026-10-05', today: '2026-10-05', streak: 4, freezes: 1 });
    expect(r.outcome).toBe('same-day');
    expect(r.streak).toBe(4);
    expect(r.freezes).toBe(1);
  });

  it('prolonge la série le lendemain', () => {
    const r = advanceFlame({ lastActiveDay: '2026-10-04', today: '2026-10-05', streak: 4, freezes: 1 });
    expect(r).toMatchObject({ outcome: 'continued', streak: 5, freezes: 1, freezesUsed: 0, missedDays: 0 });
  });

  it('consomme un gel par jour manqué et garde la série', () => {
    const r = advanceFlame({ lastActiveDay: '2026-10-03', today: '2026-10-05', streak: 10, freezes: 2 });
    expect(r).toMatchObject({ outcome: 'protected', streak: 11, freezes: 1, freezesUsed: 1, missedDays: 1 });
  });

  it('consomme deux gels pour deux jours manqués', () => {
    const r = advanceFlame({ lastActiveDay: '2026-10-02', today: '2026-10-05', streak: 10, freezes: 2 });
    expect(r).toMatchObject({ outcome: 'protected', streak: 11, freezes: 0, freezesUsed: 2, missedDays: 2 });
  });

  it('ne consomme aucun gel s\'ils ne couvrent pas tout, et éteint la Flamme', () => {
    const r = advanceFlame({ lastActiveDay: '2026-10-01', today: '2026-10-05', streak: 10, freezes: 2 });
    expect(r).toMatchObject({ outcome: 'broken', streak: 1, freezes: 2, freezesUsed: 0, missedDays: 3, lostStreak: 10 });
  });

  it('éteint la Flamme sans gel', () => {
    const r = advanceFlame({ lastActiveDay: '2026-10-03', today: '2026-10-05', streak: 6, freezes: 0 });
    expect(r).toMatchObject({ outcome: 'broken', streak: 1, lostStreak: 6, missedDays: 1 });
  });

  it('traite une date de retour antérieure à la dernière comme le même jour', () => {
    const r = advanceFlame({ lastActiveDay: '2026-10-06', today: '2026-10-05', streak: 3, freezes: 1 });
    expect(r.outcome).toBe('same-day');
    expect(r.streak).toBe(3);
  });
});

describe('l\'état de la Flamme sans activité du jour', () => {
  const base = { streak: 8, freezes: 0 };

  it('est éteinte sans série', () => {
    expect(flameStatus({ lastActiveDay: null, today: '2026-10-05', streak: 0, freezes: 0 })).toBe('none');
  });

  it('est allumée quand on a agi aujourd\'hui', () => {
    expect(flameStatus({ ...base, lastActiveDay: '2026-10-05', today: '2026-10-05' })).toBe('lit');
  });

  it('est en danger la veille d\'une extinction, sans gel', () => {
    expect(flameStatus({ ...base, lastActiveDay: '2026-10-04', today: '2026-10-05' })).toBe('at-risk');
  });

  it('est protégée par un gel qui couvrirait les jours manqués', () => {
    expect(flameStatus({ streak: 8, freezes: 2, lastActiveDay: '2026-10-03', today: '2026-10-05' })).toBe('covered');
  });

  it('est éteinte au-delà', () => {
    expect(flameStatus({ ...base, lastActiveDay: '2026-10-02', today: '2026-10-05' })).toBe('out');
  });
});

describe('le rallumage', () => {
  const base = { lastActiveDay: '2026-10-02', streakBeforeBreak: 12, lastRelightDay: null, balance: 3 };

  it('est permis dans les 48 h qui suivent l\'extinction', () => {
    // Dernier jour actif le 2, éteinte au début du 4, fenêtre jusqu'à la fin du 5.
    expect(canRelight({ ...base, today: '2026-10-04' })).toEqual({ allowed: true, price: 3 });
    expect(canRelight({ ...base, today: '2026-10-05' })).toEqual({ allowed: true, price: 3 });
  });

  it('refuse tant que la Flamme n\'est pas éteinte', () => {
    expect(canRelight({ ...base, today: '2026-10-03' })).toMatchObject({ allowed: false, reason: 'not-extinguished' });
  });

  it('refuse hors fenêtre', () => {
    expect(canRelight({ ...base, today: '2026-10-06' })).toMatchObject({ allowed: false, reason: 'window-closed' });
  });

  it('refuse une deuxième fois dans le mois', () => {
    expect(canRelight({ ...base, today: '2026-10-04', lastRelightDay: '2026-10-01' })).toMatchObject({
      allowed: false,
      reason: 'monthly-limit',
    });
    expect(canRelight({ ...base, today: '2026-10-04', lastRelightDay: '2026-09-28' })).toMatchObject({ allowed: true });
  });

  it('refuse sans assez de Meeshes', () => {
    expect(canRelight({ ...base, today: '2026-10-04', balance: 2 })).toMatchObject({
      allowed: false,
      reason: 'insufficient-balance',
    });
  });

  it('refuse quand il n\'y a rien à rallumer', () => {
    expect(canRelight({ ...base, today: '2026-10-04', streakBeforeBreak: 0 })).toMatchObject({
      allowed: false,
      reason: 'no-streak',
    });
  });

  it('rend la série d\'avant la rupture, à poursuivre aujourd\'hui', () => {
    expect(relightFlame({ today: '2026-10-04', streakBeforeBreak: 12 })).toEqual({
      streak: 12,
      lastActiveDay: '2026-10-03',
    });
  });
});
