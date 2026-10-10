import { describe, expect, test } from 'bun:test';

import {
  ATLAS_COIN_PLATES,
  ATLAS_FAMILIES,
  ATLAS_MEDAL_MATERIALS,
  ATLAS_TROPHY_PLATES,
  atlasSpeaker,
  firstLevelOfTier,
  treasuryPile,
} from './rules-atlas';

/**
 * LE CARNET ILLUSTRÉ (#9538) — le modèle dit QUOI dessiner et dans quel ordre :
 * neuf familles, dans l'ordre de la conception (ce qu'on monte, ce qu'on garde,
 * ce qui distingue, ce qu'on montre), et qui parle d'une famille à l'autre.
 */
describe('les familles du carnet', () => {
  test('neuf, dans l’ordre de la conception', () => {
    expect([...ATLAS_FAMILIES]).toEqual(['levels', 'coin', 'treasury', 'ranks', 'flames', 'leagues', 'medals', 'trophies', 'rarities']);
  });

  test('Mee et Meo se relaient : aucune famille n’est muette, et les deux parlent', () => {
    const speakers = ATLAS_FAMILIES.map(atlasSpeaker);
    expect(new Set(speakers)).toEqual(new Set(['mee', 'meo']));
    expect(atlasSpeaker('levels')).toBe('mee');
    expect(atlasSpeaker('coin')).toBe('meo');
  });
});

describe('les éléments de chaque famille', () => {
  test('le premier niveau de chaque palier : 1, 10, 20 … 90', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((o) => firstLevelOfTier(o))).toEqual([1, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  test('la Meesh : avers, revers, édition or (centième), édition prisme (millième)', () => {
    expect(ATLAS_COIN_PLATES.map((p) => [p.key, p.side, p.edition, p.number])).toEqual([
      ['obverse', 'obverse', 'silver', 13],
      ['reverse', 'reverse', 'silver', 13],
      ['gold', 'reverse', 'gold', 100],
      ['prism', 'reverse', 'prism', 1000],
    ]);
  });

  test('le trésor : une pièce de plus à chaque palier, de 1 à 6', () => {
    expect([1, 2, 3, 4, 5, 6].map(treasuryPile)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('sept matières de médaille, du cuivre au prisme, avec leur seuil', () => {
    expect(ATLAS_MEDAL_MATERIALS.map((m) => [m.material, m.threshold])).toEqual([
      ['copper', 1],
      ['bronze', 10],
      ['silver', 50],
      ['gold', 100],
      ['platinum', 500],
      ['obsidian', 1000],
      ['prism', 5000],
    ]);
  });

  test('six trophées : trois coupes de ligue, la saison, le Prestige, la Flamme', () => {
    expect(ATLAS_TROPHY_PLATES.map((p) => [p.key, p.kind, p.material ?? null])).toEqual([
      ['leagueGold', 'league', 'gold'],
      ['leagueSilver', 'league', 'silver'],
      ['leagueBronze', 'league', 'bronze'],
      ['season', 'season', null],
      ['prestige', 'prestige', null],
      ['flame', 'flame', null],
    ]);
  });
});
