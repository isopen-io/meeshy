/**
 * Le premier Rêve (#17370) : sous le niveau 5, le joueur reçoit un Rêve d'UN acte simple — l'acte facile du
 * tirage complet, au même emplacement — et l'Offrande s'ouvre dès qu'il est fait. La forme du Rêve se fige au
 * tirage : un joueur qui passe le niveau 5 dans la journée garde son Rêve d'un acte jusqu'au lendemain.
 */

import { describe, it, expect } from 'vitest';
import {
  FIRST_DREAM_ACTS,
  FULL_DREAM_ACTS,
  MISSIONS_MIN_LEVEL,
  drawDailyMissions,
  drawFirstDream,
  fullDreamIn,
  isDreamWhole,
} from '../../utils/game/missions.js';
import { levelThreshold } from '../../utils/game/levels.js';

const input = (over: Partial<Parameters<typeof drawFirstDream>[0]> = {}) => ({
  userId: '65a1b2c3d4e5f60718293a4b',
  dayKey: '2026-11-20',
  level: 1,
  flameDays: 0,
  treasury: 0,
  ...over,
});

describe('le premier Rêve : un seul acte, simple', () => {
  it('tient en un acte, facile', () => {
    const draw = drawFirstDream(input());
    expect(FIRST_DREAM_ACTS).toBe(1);
    expect(draw.missions).toHaveLength(FIRST_DREAM_ACTS);
    expect(draw.missions[0]?.difficulty).toBe('easy');
  });

  it("est l'acte facile du tirage complet du même jour : rien n'est tiré deux fois", () => {
    const full = drawDailyMissions(input());
    expect(drawFirstDream(input()).missions[0]).toEqual(full.missions.find((m) => m.difficulty === 'easy'));
  });

  it('garde le jour et le jour du Prisme du tirage complet', () => {
    const full = drawDailyMissions(input());
    const first = drawFirstDream(input());
    expect(first.dayKey).toBe(full.dayKey);
    expect(first.prismDay).toBe(full.prismDay);
  });

  it('est déterministe', () => {
    expect(drawFirstDream(input())).toEqual(drawFirstDream(input()));
  });
});

describe('le Rêve du jour est-il tiré en entier ?', () => {
  it('oui avec ses trois actes', () => {
    expect(FULL_DREAM_ACTS).toBe(3);
    expect(isDreamWhole([0, 1, 2])).toBe(true);
    expect(isDreamWhole([2, 0, 1])).toBe(true);
  });

  it("oui avec l'acte unique du premier Rêve, à l'emplacement 0", () => {
    expect(isDreamWhole([0])).toBe(true);
  });

  it('non sans acte, ou avec un tirage complet interrompu', () => {
    expect(isDreamWhole([])).toBe(false);
    expect(isDreamWhole([2])).toBe(false);
    expect(isDreamWhole([2, 1])).toBe(false);
    expect(isDreamWhole([1])).toBe(false);
  });

  it('ne compte pas la mission personnelle (emplacement 3)', () => {
    expect(isDreamWhole([3])).toBe(false);
    expect(isDreamWhole([2, 1, 3])).toBe(false);
    expect(isDreamWhole([0, 3])).toBe(true);
  });
});

describe('les étincelles qui manquent avant le Rêve complet', () => {
  it('se comptent depuis le seuil du niveau 5', () => {
    expect(fullDreamIn(0)).toBe(levelThreshold(MISSIONS_MIN_LEVEL));
    expect(fullDreamIn(1_900)).toBe(levelThreshold(MISSIONS_MIN_LEVEL) - 1_900);
  });

  it('ne descendent jamais sous zéro', () => {
    expect(fullDreamIn(levelThreshold(MISSIONS_MIN_LEVEL))).toBe(0);
    expect(fullDreamIn(1_000_000)).toBe(0);
  });

  it("tolèrent une lecture qui n'est pas un entier positif", () => {
    expect(fullDreamIn(-5)).toBe(levelThreshold(MISSIONS_MIN_LEVEL));
    expect(fullDreamIn(Number.NaN)).toBe(levelThreshold(MISSIONS_MIN_LEVEL));
    expect(fullDreamIn(2_499.6)).toBe(1);
  });
});
