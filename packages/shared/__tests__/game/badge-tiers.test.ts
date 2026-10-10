/**
 * Les badges d'accumulation passent de 5 à 7 paliers (#9392) : 1 000
 * (Obsidienne) et 5 000 (Prisme) s'AJOUTENT, rien ne se retire. Ce qui se
 * vérifie : l'extension rétrocompatible de `BADGE_THRESHOLDS`, les sept
 * matières, l'empreinte du badge éteint.
 */

import { describe, it, expect } from 'vitest';
import { BADGE_THRESHOLDS, LEGACY_BADGE_THRESHOLDS } from '../../types/engagement.js';
import {
  BADGE_MATERIALS,
  badgeImprint,
  badgeMaterial,
  badgeMaterialReached,
  isExtendedBadgeThreshold,
  servedBadgeThresholds,
} from '../../utils/game/badge-tiers.js';

describe('les paliers de badge', () => {
  it('ajoutent 1 000 et 5 000 à la suite des cinq anciens, sans en retirer', () => {
    expect([...LEGACY_BADGE_THRESHOLDS]).toEqual([1, 10, 50, 100, 500]);
    expect([...BADGE_THRESHOLDS]).toEqual([1, 10, 50, 100, 500, 1000, 5000]);
    expect([...BADGE_THRESHOLDS].slice(0, 5)).toEqual([...LEGACY_BADGE_THRESHOLDS]);
  });

  it('servent les cinq anciens à un client qui ne connaît pas les nouveaux', () => {
    expect(servedBadgeThresholds({ knowsExtendedTiers: false })).toEqual([1, 10, 50, 100, 500]);
    expect(servedBadgeThresholds({ knowsExtendedTiers: true })).toEqual([1, 10, 50, 100, 500, 1000, 5000]);
  });

  it('reconnaissent les deux nouveaux et eux seuls', () => {
    expect(BADGE_THRESHOLDS.filter(isExtendedBadgeThreshold)).toEqual([1000, 5000]);
  });
});

describe('les sept matières', () => {
  it('suivent la conception, du cuivre au prisme', () => {
    expect(BADGE_MATERIALS.map((m) => [m.threshold, m.key])).toEqual([
      [1, 'cuivre'],
      [10, 'bronze'],
      [50, 'argent'],
      [100, 'or'],
      [500, 'platine'],
      [1000, 'obsidienne'],
      [5000, 'prisme'],
    ]);
  });

  it('donnent une matière à chaque palier servi, et aucune ailleurs', () => {
    for (const threshold of BADGE_THRESHOLDS) expect(badgeMaterial(threshold)).not.toBeNull();
    expect(badgeMaterial(7)).toBeNull();
  });

  it('ne rend un ruban qu\'à partir de l\'Or', () => {
    expect(BADGE_MATERIALS.filter((m) => m.ribbon).map((m) => m.key)).toEqual(['or', 'platine', 'obsidienne', 'prisme']);
  });

  it('lit la matière tenue sur le compteur', () => {
    expect(badgeMaterialReached(0)).toBeNull();
    expect(badgeMaterialReached(1)).toBe('cuivre');
    expect(badgeMaterialReached(499)).toBe('or');
    expect(badgeMaterialReached(1000)).toBe('obsidienne');
    expect(badgeMaterialReached(4999)).toBe('obsidienne');
    expect(badgeMaterialReached(5000)).toBe('prisme');
    expect(badgeMaterialReached(Number.NaN)).toBeNull();
  });
});

describe('l\'empreinte d\'un badge éteint', () => {
  it('dit ce qu\'il manque pour le rallumer', () => {
    expect(badgeImprint({ count: 463, threshold: 500 })).toEqual({ extinguished: true, missing: 37 });
  });

  it('ne dit rien d\'un badge que le compteur couvre encore', () => {
    expect(badgeImprint({ count: 500, threshold: 500 })).toEqual({ extinguished: false, missing: 0 });
    expect(badgeImprint({ count: 9000, threshold: 1000 })).toEqual({ extinguished: false, missing: 0 });
  });

  it('éteint aussi les deux nouveaux paliers', () => {
    expect(badgeImprint({ count: 4990, threshold: 5000 })).toEqual({ extinguished: true, missing: 10 });
    expect(badgeImprint({ count: 999, threshold: 1000 })).toEqual({ extinguished: true, missing: 1 });
  });
});
