import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { ACHIEVEMENT_RARITIES } from '@meeshy/shared/utils/game/glory';

import { rarityPercent, rarityRim, rarityToken, visibleRarity } from './rarity';

const CSS = readFileSync(new URL('../../styles/game.css', import.meta.url), 'utf8');

/**
 * LA RARETÉ D’UN SUCCÈS (#9390, conception II.9) — un liseré par rareté, et une
 * règle de vie privée : une rareté n’est AFFICHÉE qu’à partir de 20 titulaires
 * et 1 000 comptes (conformité G-2). Sous ce seuil, « mythique, moins de 0,2 % »
 * désignerait une ou deux personnes, que le croisement avec une vitrine ou une
 * langue rare réidentifierait : l’écran dit « rareté en cours de mesure », et
 * ne peint aucun liseré. Aucun client ne devine : l’absence de donnée tait.
 */
describe('les liserés', () => {
  test('un jeton par rareté, déclaré par game.css : ardoise, bleu, violet, or, prisme', () => {
    expect(ACHIEVEMENT_RARITIES.map(rarityToken)).toEqual(['slate', 'blue', 'violet', 'gold', 'prism']);
    for (const name of ['slate', 'blue', 'violet', 'gold']) expect(CSS).toMatch(new RegExp(`--game-rarity-${name}\\s*:`));
  });

  test('le liseré est une bordure ; le prisme est un dégradé irisé', () => {
    expect(rarityRim('rare')).toEqual({ borderInlineStart: '3px solid var(--game-rarity-blue)' });
    expect(rarityRim('mythic').borderImage).toContain('var(--game-prism-0)');
  });
});

describe('ce que l’écran a le droit d’afficher', () => {
  const entry = { rarity: 'epic', holders: 40, population: 1500 } as const;

  test('assez de titulaires ET de comptes : la rareté se montre', () => {
    expect(visibleRarity(entry)).toBe('epic');
  });

  test('moins de 20 titulaires : rien, même si la rareté est connue', () => {
    expect(visibleRarity({ rarity: 'mythic', holders: 2, population: 5000 })).toBeNull();
    expect(visibleRarity({ rarity: 'mythic', holders: 19, population: 5000 })).toBeNull();
    expect(visibleRarity({ rarity: 'mythic', holders: 20, population: 5000 })).toBe('mythic');
  });

  test('moins de 1 000 comptes : rien', () => {
    expect(visibleRarity({ rarity: 'rare', holders: 300, population: 999 })).toBeNull();
  });

  test('aucune entrée (le succès est absent de la carte) : rien', () => {
    expect(visibleRarity(undefined)).toBeNull();
  });

  test('le pourcentage se calcule sur les comptes servis, en entiers, jamais sous 0,1 %', () => {
    expect(rarityPercent({ rarity: 'epic', holders: 60, population: 1500 })).toBe('4 %');
    expect(rarityPercent({ rarity: 'legendary', holders: 20, population: 5000 })).toBe('0,4 %');
    expect(rarityPercent({ rarity: 'mythic', holders: 20, population: 50_000 })).toBe('< 0,1 %');
  });
});
