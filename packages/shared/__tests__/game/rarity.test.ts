/**
 * La rareté des succès (#9390), mesurée chaque nuit et figée à l'obtention :
 * commun > 40 %, rare 10–40, épique 2–10, légendaire 0,2–2, mythique < 0,2 ;
 * Gloire 100 / 250 / 600 / 1 500 / 4 000 (#9636). Le Mythe a quitté la rareté : `mythe.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import {
  RARITY_BORDERS,
  RARITY_MIN_DISPLAY_HOLDERS,
  RARITY_MIN_POPULATION,
  rarityShareDisplayable,
  achievementGloryAtEarning,
  measureRarity,
  rarityFromShare,
} from '../../utils/game/rarity.js';
import { ACHIEVEMENT_RARITIES, gloryForAchievement } from '../../utils/game/glory.js';

/** Une population de 100 000 comptes : un pour mille = 100 détenteurs. */
const POP = 100_000;
const holders = (permille: number): number => (permille * POP) / 1000;

describe('les seuils de rareté', () => {
  it('rangent une part des comptes dans sa rareté', () => {
    expect(rarityFromShare({ holders: holders(900), population: POP })).toBe('common');
    expect(rarityFromShare({ holders: holders(401), population: POP })).toBe('common');
    expect(rarityFromShare({ holders: holders(250), population: POP })).toBe('rare');
    expect(rarityFromShare({ holders: holders(50), population: POP })).toBe('epic');
    expect(rarityFromShare({ holders: holders(5), population: POP })).toBe('legendary');
    expect(rarityFromShare({ holders: holders(1), population: POP })).toBe('mythic');
    expect(rarityFromShare({ holders: 0, population: POP })).toBe('mythic');
  });

  it('tient les bornes comme la conception les écrit', () => {
    expect(rarityFromShare({ holders: holders(400), population: POP })).toBe('rare');
    expect(rarityFromShare({ holders: holders(100), population: POP })).toBe('rare');
    expect(rarityFromShare({ holders: holders(99), population: POP })).toBe('epic');
    expect(rarityFromShare({ holders: holders(20), population: POP })).toBe('epic');
    expect(rarityFromShare({ holders: holders(19), population: POP })).toBe('legendary');
    expect(rarityFromShare({ holders: holders(2), population: POP })).toBe('legendary');
    expect(rarityFromShare({ holders: 199, population: POP })).toBe('mythic');
    expect(rarityFromShare({ holders: 200, population: POP })).toBe('legendary');
  });

  it('se calcule en entiers — aucune dérive de flottant à la frontière', () => {
    expect(rarityFromShare({ holders: 3, population: 1500 })).toBe('legendary');
    expect(rarityFromShare({ holders: 2, population: 1000 })).toBe('legendary');
    expect(rarityFromShare({ holders: 1, population: 500 })).toBe('legendary');
    expect(rarityFromShare({ holders: 1, population: 501 })).toBe('mythic');
    expect(rarityFromShare({ holders: 1, population: 1000 })).toBe('mythic');
  });

  it('couvre les cinq raretés de la Gloire, dans l\'ordre', () => {
    expect([...ACHIEVEMENT_RARITIES]).toEqual(['common', 'rare', 'epic', 'legendary', 'mythic']);
    expect(Object.keys(RARITY_BORDERS)).toEqual([...ACHIEVEMENT_RARITIES]);
    expect(RARITY_BORDERS).toEqual({ common: 'slate', rare: 'blue', epic: 'violet', legendary: 'gold', mythic: 'prism' });
  });
});

describe('la mesure de la nuit', () => {
  it('rend une rareté quand la population est assez grande pour que la part ait un sens', () => {
    expect(measureRarity({ holders: 5, population: RARITY_MIN_POPULATION })).toBe('legendary');
  });

  it('ne rend rien en dessous : un seul détenteur sur cent comptes n\'est pas « mythique »', () => {
    expect(measureRarity({ holders: 1, population: RARITY_MIN_POPULATION - 1 })).toBeNull();
    expect(measureRarity({ holders: 0, population: 0 })).toBeNull();
  });

  it('ignore un nombre illisible plutôt que de classer à tort', () => {
    expect(measureRarity({ holders: Number.NaN, population: 5000 })).toBeNull();
    expect(measureRarity({ holders: -3, population: 5000 })).toBeNull();
  });
});

describe('la Gloire figée à l\'obtention', () => {
  it('suit la rareté du jour où le succès est obtenu — 100, 250, 600, 1 500, 4 000', () => {
    expect(ACHIEVEMENT_RARITIES.map((r) => achievementGloryAtEarning(r))).toEqual([100, 250, 600, 1500, 4000]);
    expect(achievementGloryAtEarning('legendary')).toBe(gloryForAchievement('legendary'));
  });

  it('vaut un succès commun tant que la rareté n\'est pas mesurée', () => {
    expect(achievementGloryAtEarning(null)).toBe(100);
  });
});
