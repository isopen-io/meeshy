import { describe, expect, test } from 'bun:test';

import { meeshShortfall, meeshShortfallLine } from './shortfall';

/**
 * #20527 (tranche web de #17378) — UN PACK TROP CHER DIT CE QUI MANQUE, AVANT
 * le geste. Le solde est celui que `GET /packs/shop` sert ; l'écart, celui de
 * `spendPreview`. Solde inconnu, pack possédé, gratuit ou abordable : rien.
 */
describe('meeshShortfall — les Meeshes qui manquent pour acheter un pack', () => {
  test('le prix dépasse le solde : l’écart', () => {
    expect(meeshShortfall({ balance: 2, price: 5, owned: false })).toBe(3);
  });

  test('le solde suffit tout juste : rien', () => {
    expect(meeshShortfall({ balance: 5, price: 5, owned: false })).toBeNull();
  });

  test('solde inconnu : rien, le serveur reste juge', () => {
    expect(meeshShortfall({ balance: null, price: 5, owned: false })).toBeNull();
    expect(meeshShortfall({ balance: undefined, price: 5, owned: false })).toBeNull();
  });

  test('pack possédé ou gratuit : rien', () => {
    expect(meeshShortfall({ balance: 0, price: 5, owned: true })).toBeNull();
    expect(meeshShortfall({ balance: 0, price: null, owned: false })).toBeNull();
  });
});

describe('meeshShortfallLine — la phrase', () => {
  test('une Meesh au singulier, plusieurs au pluriel', () => {
    expect(meeshShortfallLine('fr', 1)).toBe('Il vous manque 1 Meesh');
    expect(meeshShortfallLine('fr', 3)).toBe('Il vous manque 3 Meeshes');
  });

  test('les grands nombres se lisent dans la langue', () => {
    expect(meeshShortfallLine('en', 1200)).toBe('You need 1,200 more Meeshes');
  });
});
