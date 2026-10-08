/**
 * La courbe des niveaux du Jeu Meeshy (#9373, ouverte par le rang #9688) :
 * seuil(N) = 10 × N². Ce qui se vérifie : la lecture du niveau sur le score
 * sous son plafond, la progression dans le niveau, les vingt paliers, la
 * projection de l'ancienne loi, le record, l'éligibilité au Prestige — et que
 * les six anciens seuils restent servis tels quels aux anciens clients.
 */

import { describe, it, expect } from 'vitest';
import {
  GAME_PRESTIGE_MAX,
  LEGACY_LEVEL_TIER_KEYS,
  LEVEL_CAP_AMBASSADOR,
  LEVEL_CAP_BASE,
  LEVEL_TIER_KEYS,
  NO_LEVEL_CAP,
  canPrestige,
  legacyLevelProgress,
  legacyLevelTierKey,
  levelFromScore,
  levelProgress,
  levelThreshold,
  levelTierIndex,
  levelTierKey,
  levelTierStart,
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

  it('continue au-delà de 100 : 999 vaut 9 980 010, 1000 vaut 10 000 000', () => {
    expect(levelThreshold(999)).toBe(9_980_010);
    expect(levelThreshold(1000)).toBe(10_000_000);
    expect(levelThreshold(2000)).toBe(40_000_000);
    expect(levelThreshold(3000)).toBe(90_000_000);
  });

  it('lit le niveau sur le score, de 1 à 100, comme hier', () => {
    expect(levelFromScore(0, LEVEL_CAP_BASE)).toBe(1);
    expect(levelFromScore(9, LEVEL_CAP_BASE)).toBe(1);
    expect(levelFromScore(10, LEVEL_CAP_BASE)).toBe(1);
    expect(levelFromScore(39, LEVEL_CAP_BASE)).toBe(1);
    expect(levelFromScore(40, LEVEL_CAP_BASE)).toBe(2);
    expect(levelFromScore(999, LEVEL_CAP_BASE)).toBe(9);
    expect(levelFromScore(1000, LEVEL_CAP_BASE)).toBe(10);
    expect(levelFromScore(99_999, LEVEL_CAP_BASE)).toBe(99);
    expect(levelFromScore(100_000, LEVEL_CAP_BASE)).toBe(100);
  });

  it('ne s\'arrête plus à 100', () => {
    expect(levelFromScore(100_000 + 2009, LEVEL_CAP_BASE)).toBe(100);
    expect(levelFromScore(102_010, LEVEL_CAP_BASE)).toBe(101);
    expect(levelFromScore(5_000_000, LEVEL_CAP_BASE)).toBe(499);
  });

  it('borne à 499 sous Ambassadeur : 499 se lit, 500 attend le rang', () => {
    expect(levelFromScore(levelThreshold(499), LEVEL_CAP_BASE)).toBe(499);
    expect(levelFromScore(levelThreshold(500), LEVEL_CAP_BASE)).toBe(499);
    expect(levelFromScore(levelThreshold(500), LEVEL_CAP_AMBASSADOR)).toBe(500);
  });

  it('borne à 1000 pour Ambassadeur : 1001 attend Oracle, qui n\'a plus de limite', () => {
    expect(levelFromScore(levelThreshold(1000), LEVEL_CAP_AMBASSADOR)).toBe(1000);
    expect(levelFromScore(levelThreshold(1001), LEVEL_CAP_AMBASSADOR)).toBe(1000);
    expect(levelFromScore(levelThreshold(1001), NO_LEVEL_CAP)).toBe(1001);
    expect(levelFromScore(levelThreshold(3000), NO_LEVEL_CAP)).toBe(3000);
    expect(levelFromScore(levelThreshold(3000) - 1, NO_LEVEL_CAP)).toBe(2999);
  });

  it('ferme un plafond illisible sur 499 : seul null explicite lève la limite (fail-closed)', () => {
    const score = levelThreshold(640);
    expect(levelFromScore(score, Number.NaN)).toBe(499);
    expect(levelFromScore(score, Number.POSITIVE_INFINITY)).toBe(499);
    expect(levelFromScore(score, undefined as unknown as null)).toBe(499);
    expect(levelFromScore(score, '1000' as unknown as number)).toBe(499);
    expect(levelProgress(score, Number.NaN)).toMatchObject({ level: 499, cap: 499, isMax: true });
    expect(levelFromScore(score, NO_LEVEL_CAP)).toBe(640);
  });

  it('traite un score illisible comme zéro', () => {
    expect(levelFromScore(Number.NaN, NO_LEVEL_CAP)).toBe(1);
    expect(levelFromScore(-50, NO_LEVEL_CAP)).toBe(1);
    expect(levelFromScore(Number.POSITIVE_INFINITY, NO_LEVEL_CAP)).toBe(1);
  });

  it('garde les six anciens seuils tels quels pour les anciens clients', () => {
    expect(LEVEL_THRESHOLDS).toEqual([10, 50, 150, 400, 1000, 2500]);
  });
});

describe('progression dans le niveau', () => {
  it('place le score entre le seuil du niveau et celui du suivant', () => {
    const p = levelProgress(12_180, LEVEL_CAP_BASE);
    expect(p.level).toBe(34);
    expect(p.floorScore).toBe(11_560);
    expect(p.nextThreshold).toBe(12_250);
    expect(p.pointsToNext).toBe(70);
    expect(p.progress).toBeCloseTo((12_180 - 11_560) / (12_250 - 11_560), 6);
    expect(p.isMax).toBe(false);
  });

  it('démarre le niveau 1 à zéro, puisque personne n\'est en dessous', () => {
    const p = levelProgress(0, LEVEL_CAP_BASE);
    expect(p.level).toBe(1);
    expect(p.floorScore).toBe(0);
    expect(p.nextThreshold).toBe(40);
    expect(p.progress).toBe(0);
  });

  it('est à zéro pile sur un seuil', () => {
    expect(levelProgress(1000, LEVEL_CAP_BASE).progress).toBe(0);
    expect(levelProgress(1000, LEVEL_CAP_BASE).pointsToNext).toBe(210);
  });

  it('continue après le niveau 100 : le niveau 100 n\'est plus un sommet', () => {
    const p = levelProgress(100_000, LEVEL_CAP_BASE);
    expect(p.level).toBe(100);
    expect(p.nextThreshold).toBe(102_010);
    expect(p.pointsToNext).toBe(2010);
    expect(p.progress).toBe(0);
    expect(p.isMax).toBe(false);
  });

  it('est plein, sans suite, au plafond du rang — et le dit', () => {
    const p = levelProgress(5_000_000, LEVEL_CAP_BASE);
    expect(p.level).toBe(499);
    expect(p.nextThreshold).toBeNull();
    expect(p.pointsToNext).toBe(0);
    expect(p.progress).toBe(1);
    expect(p.isMax).toBe(true);
    expect(p.cap).toBe(499);
  });

  it('n\'est jamais plein sans plafond', () => {
    const p = levelProgress(levelThreshold(1001), NO_LEVEL_CAP);
    expect(p.level).toBe(1001);
    expect(p.isMax).toBe(false);
    expect(p.nextThreshold).toBe(levelThreshold(1002));
    expect(p.cap).toBeNull();
  });
});

describe('la projection de l\'ancienne loi (champs d\'hier du fil)', () => {
  it('borne le niveau à 100, plein et sans suite, palier Galaxie', () => {
    const p = legacyLevelProgress(levelThreshold(640));
    expect(p.level).toBe(100);
    expect(p.tier).toBe('galaxie');
    expect(p.nextThreshold).toBeNull();
    expect(p.progress).toBe(1);
    expect(p.isMax).toBe(true);
    expect(legacyLevelTierKey(1000)).toBe('galaxie');
  });

  it('ne change rien sous le niveau 100', () => {
    expect(legacyLevelProgress(12_180)).toEqual({ ...levelProgress(12_180, LEVEL_CAP_BASE), cap: 100 });
  });
});

describe('les vingt paliers', () => {
  it('garde les dix clés d\'hier, puis neuf paliers de cent niveaux et Singularité', () => {
    expect(LEVEL_TIER_KEYS.slice(0, 10)).toEqual(LEGACY_LEVEL_TIER_KEYS);
    expect(LEVEL_TIER_KEYS.slice(10)).toEqual([
      'nebuleuse',
      'pulsar',
      'quasar',
      'supernova',
      'magnetar',
      'amas',
      'superamas',
      'cosmos',
      'infini',
      'singularite',
    ]);
  });

  it('range 101–199, 200–299 … 900–999, puis 1000 et au-delà', () => {
    expect(levelTierKey(101)).toBe('nebuleuse');
    expect(levelTierKey(199)).toBe('nebuleuse');
    expect(levelTierKey(200)).toBe('pulsar');
    expect(levelTierKey(499)).toBe('supernova');
    expect(levelTierKey(500)).toBe('magnetar');
    expect(levelTierKey(900)).toBe('infini');
    expect(levelTierKey(999)).toBe('infini');
    expect(levelTierKey(1000)).toBe('singularite');
    expect(levelTierKey(25_000)).toBe('singularite');
    expect(levelTierIndex(1000)).toBe(19);
  });

  it('dit où commence chaque palier', () => {
    expect(levelTierStart('etincelle')).toBe(1);
    expect(levelTierStart('lueur')).toBe(10);
    expect(levelTierStart('galaxie')).toBe(90);
    expect(levelTierStart('nebuleuse')).toBe(101);
    expect(levelTierStart('pulsar')).toBe(200);
    expect(levelTierStart('infini')).toBe(900);
    expect(levelTierStart('singularite')).toBe(1000);
    for (const tier of LEVEL_TIER_KEYS) expect(levelTierKey(levelTierStart(tier))).toBe(tier);
  });

  it('porte dix clés d\'hier stables', () => {
    expect(LEGACY_LEVEL_TIER_KEYS).toEqual([
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
  it('est offert à partir du niveau 100, et le reste au-delà : il est facultatif', () => {
    expect(canPrestige({ level: 99, prestige: 0 })).toBe(false);
    expect(canPrestige({ level: 100, prestige: 0 })).toBe(true);
    expect(canPrestige({ level: 640, prestige: 0 })).toBe(true);
  });

  it('s\'arrête à cinq étoiles', () => {
    expect(GAME_PRESTIGE_MAX).toBe(5);
    expect(canPrestige({ level: 100, prestige: 4 })).toBe(true);
    expect(canPrestige({ level: 100, prestige: 5 })).toBe(false);
  });
});
