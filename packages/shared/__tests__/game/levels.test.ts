/**
 * La courbe des niveaux du Jeu Meeshy (#9373, ouverte par le rang #9688) :
 * seuil(N) = 100 × N² depuis #9706. Ce qui se vérifie : la lecture du niveau sur le score
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
  levelForUnlocks,
  levelStepCeiling,
  newLevelsReached,
  recordLevel,
  tighterLevelCap,
} from '../../utils/game/levels.js';
import { LEVEL_THRESHOLDS } from '../../types/engagement.js';

describe('seuil et niveau', () => {
  it('suit seuil(N) = 100 × N² : un million pour le niveau 100 (#9706)', () => {
    expect(levelThreshold(1)).toBe(100);
    expect(levelThreshold(5)).toBe(2500);
    expect(levelThreshold(10)).toBe(10_000);
    expect(levelThreshold(50)).toBe(250_000);
    expect(levelThreshold(100)).toBe(1_000_000);
  });

  it('continue au-delà de 100 : 499 vaut 24 900 100, 1000 vaut 100 000 000', () => {
    expect(levelThreshold(499)).toBe(24_900_100);
    expect(levelThreshold(999)).toBe(99_800_100);
    expect(levelThreshold(1000)).toBe(100_000_000);
    expect(levelThreshold(2000)).toBe(400_000_000);
  });

  it('lit le niveau sur le score, de 1 à 100', () => {
    expect(levelFromScore(0, LEVEL_CAP_BASE)).toBe(1);
    expect(levelFromScore(99, LEVEL_CAP_BASE)).toBe(1);
    expect(levelFromScore(399, LEVEL_CAP_BASE)).toBe(1);
    expect(levelFromScore(400, LEVEL_CAP_BASE)).toBe(2);
    expect(levelFromScore(9999, LEVEL_CAP_BASE)).toBe(9);
    expect(levelFromScore(10_000, LEVEL_CAP_BASE)).toBe(10);
    expect(levelFromScore(999_999, LEVEL_CAP_BASE)).toBe(99);
    expect(levelFromScore(1_000_000, LEVEL_CAP_BASE)).toBe(100);
  });

  it('relit le meilleur compte de production (93 730 points) au niveau 30', () => {
    expect(levelFromScore(93_730, LEVEL_CAP_BASE)).toBe(30);
  });

  it('ne s\'arrête plus à 100', () => {
    expect(levelFromScore(1_000_000 + 20_099, LEVEL_CAP_BASE)).toBe(100);
    expect(levelFromScore(1_020_100, LEVEL_CAP_BASE)).toBe(101);
    expect(levelFromScore(50_000_000, LEVEL_CAP_BASE)).toBe(499);
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
    const p = levelProgress(121_800, LEVEL_CAP_BASE);
    expect(p.level).toBe(34);
    expect(p.floorScore).toBe(115_600);
    expect(p.nextThreshold).toBe(122_500);
    expect(p.pointsToNext).toBe(700);
    expect(p.progress).toBeCloseTo((121_800 - 115_600) / (122_500 - 115_600), 6);
    expect(p.isMax).toBe(false);
    expect(p.held).toBe(false);
  });

  it('démarre le niveau 1 à zéro, puisque personne n\'est en dessous', () => {
    const p = levelProgress(0, LEVEL_CAP_BASE);
    expect(p.level).toBe(1);
    expect(p.floorScore).toBe(0);
    expect(p.nextThreshold).toBe(400);
    expect(p.progress).toBe(0);
  });

  it('est à zéro pile sur un seuil', () => {
    expect(levelProgress(10_000, LEVEL_CAP_BASE).progress).toBe(0);
    expect(levelProgress(10_000, LEVEL_CAP_BASE).pointsToNext).toBe(2100);
  });

  it('continue après le niveau 100 : le niveau 100 n\'est plus un sommet', () => {
    const p = levelProgress(1_000_000, LEVEL_CAP_BASE);
    expect(p.level).toBe(100);
    expect(p.nextThreshold).toBe(1_020_100);
    expect(p.pointsToNext).toBe(20_100);
    expect(p.progress).toBe(0);
    expect(p.isMax).toBe(false);
  });

  it('est plein, sans suite, au plafond du rang — et le dit', () => {
    const p = levelProgress(50_000_000, LEVEL_CAP_BASE);
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
    expect(legacyLevelProgress(121_800)).toEqual({ ...levelProgress(121_800, LEVEL_CAP_BASE), cap: 100 });
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

describe('le palier des étapes (#9706)', () => {
  it('retient le niveau sous l\'étape manquante : la barre est pleine, la suite reste dite', () => {
    const p = levelProgress(15_000, LEVEL_CAP_BASE, 9);
    expect(p.level).toBe(9);
    expect(p.held).toBe(true);
    expect(p.isMax).toBe(false);
    expect(p.nextThreshold).toBe(10_000);
    expect(p.pointsToNext).toBe(0);
    expect(p.progress).toBe(1);
    expect(p.cap).toBe(499);
  });

  it('monte d\'un coup quand l\'étape est faite', () => {
    expect(levelProgress(40_000, LEVEL_CAP_BASE, 9).level).toBe(9);
    expect(levelProgress(40_000, LEVEL_CAP_BASE, 19).level).toBe(19);
    expect(levelProgress(40_000, LEVEL_CAP_BASE, null).level).toBe(20);
  });

  it('ne retient pas un niveau que les points n\'ont pas encore atteint', () => {
    const p = levelProgress(8000, LEVEL_CAP_BASE, 9);
    expect(p.level).toBe(8);
    expect(p.held).toBe(false);
    expect(p.pointsToNext).toBe(100);
  });

  it('pile au palier, sans les points du suivant, n\'attend rien', () => {
    expect(levelProgress(levelThreshold(9), LEVEL_CAP_BASE, 9).held).toBe(false);
  });

  it('ferme un palier illisible sous la première étape (fail-closed)', () => {
    expect(levelProgress(1_000_000, NO_LEVEL_CAP, Number.NaN).level).toBe(9);
  });

  it('retient aussi les champs d\'hier : un ancien client lit le niveau servi', () => {
    const p = legacyLevelProgress(1_000_000, 29);
    expect(p.level).toBe(29);
    expect(p.tier).toBe('lumiere');
    expect(p.nextThreshold).toBe(levelThreshold(30));
    expect(p.pointsToNext).toBe(0);
  });

  it('prend le plus serré de deux plafonds, null ne bornant rien', () => {
    expect(tighterLevelCap(499, 29)).toBe(29);
    expect(tighterLevelCap(null, 29)).toBe(29);
    expect(tighterLevelCap(1000, null)).toBe(1000);
    expect(tighterLevelCap(null, null)).toBeNull();
  });
});

describe('le niveau des ouvertures, lu sur le record (#9706)', () => {
  it('ne passe pas la dizaine qui suit le record', () => {
    expect(levelStepCeiling(null)).toBe(9);
    expect(levelStepCeiling(9)).toBe(9);
    expect(levelStepCeiling(10)).toBe(19);
    expect(levelStepCeiling(99)).toBe(99);
    expect(levelStepCeiling(100)).toBeNull();
    expect(levelStepCeiling(640)).toBeNull();
  });

  it('lit le niveau des points sous ce plafond', () => {
    expect(levelForUnlocks({ score: 250_000, levelRecord: 9 })).toBe(9);
    expect(levelForUnlocks({ score: 250_000, levelRecord: 24 })).toBe(29);
    expect(levelForUnlocks({ score: 250_000, levelRecord: 50 })).toBe(50);
    expect(levelForUnlocks({ score: 2500, levelRecord: 50 })).toBe(5);
  });

  it('n\'ouvre le Prestige qu\'avec le record du niveau 100 ET le million en poche', () => {
    expect(levelForUnlocks({ score: 1_000_000, levelRecord: 99 })).toBe(99);
    expect(levelForUnlocks({ score: 1_000_000, levelRecord: 100 })).toBe(100);
    expect(levelForUnlocks({ score: 999_999, levelRecord: 100 })).toBe(99);
  });
});
