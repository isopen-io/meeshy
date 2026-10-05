/**
 * La courbe des 100 niveaux du Jeu Meeshy (#9373) : seuil(N) = 10 × N².
 * Ce qui se vérifie : la lecture du niveau sur le score, la progression dans
 * le niveau, les dix paliers, le record, l'éligibilité au Prestige — et que
 * les six anciens seuils restent servis tels quels aux anciens clients.
 */

import { describe, it, expect } from 'vitest';
import {
  GAME_LEVEL_MAX,
  GAME_PRESTIGE_MAX,
  LEVEL_TIER_KEYS,
  canPrestige,
  levelFromScore,
  levelProgress,
  levelThreshold,
  levelTierIndex,
  levelTierKey,
  newLevelsReached,
  recordLevel,
} from '../../utils/game/levels.js';
import { LEVEL_THRESHOLDS } from '../../types/engagement.js';

describe('seuil et niveau', () => {
  it('suit seuil(N) = 10 × N²', () => {
    expect(levelThreshold(1)).toBe(10);
    expect(levelThreshold(5)).toBe(250);
    expect(levelThreshold(10)).toBe(1000);
    expect(levelThreshold(50)).toBe(25_000);
    expect(levelThreshold(100)).toBe(100_000);
  });

  it('lit le niveau sur le score, de 1 à 100', () => {
    expect(levelFromScore(0)).toBe(1);
    expect(levelFromScore(9)).toBe(1);
    expect(levelFromScore(10)).toBe(1);
    expect(levelFromScore(39)).toBe(1);
    expect(levelFromScore(40)).toBe(2);
    expect(levelFromScore(999)).toBe(9);
    expect(levelFromScore(1000)).toBe(10);
    expect(levelFromScore(99_999)).toBe(99);
    expect(levelFromScore(100_000)).toBe(100);
    expect(levelFromScore(5_000_000)).toBe(GAME_LEVEL_MAX);
  });

  it('traite un score illisible comme zéro', () => {
    expect(levelFromScore(Number.NaN)).toBe(1);
    expect(levelFromScore(-50)).toBe(1);
    expect(levelFromScore(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('garde les six anciens seuils tels quels pour les anciens clients', () => {
    expect(LEVEL_THRESHOLDS).toEqual([10, 50, 150, 400, 1000, 2500]);
  });
});

describe('progression dans le niveau', () => {
  it('place le score entre le seuil du niveau et celui du suivant', () => {
    const p = levelProgress(12_180);
    expect(p.level).toBe(34);
    expect(p.floorScore).toBe(11_560);
    expect(p.nextThreshold).toBe(12_250);
    expect(p.pointsToNext).toBe(70);
    expect(p.progress).toBeCloseTo((12_180 - 11_560) / (12_250 - 11_560), 6);
    expect(p.isMax).toBe(false);
  });

  it('démarre le niveau 1 à zéro, puisque personne n\'est en dessous', () => {
    const p = levelProgress(0);
    expect(p.level).toBe(1);
    expect(p.floorScore).toBe(0);
    expect(p.nextThreshold).toBe(40);
    expect(p.progress).toBe(0);
  });

  it('est à zéro pile sur un seuil', () => {
    expect(levelProgress(1000).progress).toBe(0);
    expect(levelProgress(1000).pointsToNext).toBe(210);
  });

  it('est plein, sans suite, au niveau 100', () => {
    const p = levelProgress(100_000);
    expect(p.level).toBe(100);
    expect(p.nextThreshold).toBeNull();
    expect(p.pointsToNext).toBe(0);
    expect(p.progress).toBe(1);
    expect(p.isMax).toBe(true);
  });
});

describe('les dix paliers', () => {
  it('porte dix clés stables', () => {
    expect(LEVEL_TIER_KEYS).toEqual([
      'etincelle',
      'lueur',
      'lumiere',
      'eclat',
      'rayon',
      'aurore',
      'comete',
      'etoile',
      'constellation',
      'galaxie',
    ]);
  });

  it('range les niveaux 1–9, 10–19 … 90–100', () => {
    expect(levelTierKey(1)).toBe('etincelle');
    expect(levelTierKey(9)).toBe('etincelle');
    expect(levelTierKey(10)).toBe('lueur');
    expect(levelTierKey(29)).toBe('lumiere');
    expect(levelTierKey(50)).toBe('aurore');
    expect(levelTierKey(89)).toBe('constellation');
    expect(levelTierKey(90)).toBe('galaxie');
    expect(levelTierKey(100)).toBe('galaxie');
    expect(levelTierIndex(100)).toBe(9);
  });
});

describe('niveau record et passages inédits', () => {
  it('retient le plus haut niveau atteint', () => {
    expect(recordLevel({ level: 32, previousRecord: 36 })).toBe(36);
    expect(recordLevel({ level: 37, previousRecord: 36 })).toBe(37);
    expect(recordLevel({ level: 5, previousRecord: null })).toBe(5);
  });

  it('compte les niveaux franchis pour la première fois', () => {
    expect(newLevelsReached({ level: 34, previousRecord: 30 })).toEqual({ from: 31, to: 34, count: 4 });
    expect(newLevelsReached({ level: 32, previousRecord: 36 })).toEqual({ from: 0, to: 0, count: 0 });
    expect(newLevelsReached({ level: 2, previousRecord: null })).toEqual({ from: 2, to: 2, count: 1 });
  });
});

describe('Prestige', () => {
  it('n\'est offert qu\'au niveau 100', () => {
    expect(canPrestige({ level: 99, prestige: 0 })).toBe(false);
    expect(canPrestige({ level: 100, prestige: 0 })).toBe(true);
  });

  it('s\'arrête à cinq étoiles', () => {
    expect(GAME_PRESTIGE_MAX).toBe(5);
    expect(canPrestige({ level: 100, prestige: 4 })).toBe(true);
    expect(canPrestige({ level: 100, prestige: 5 })).toBe(false);
  });
});
