import { describe, expect, it } from 'vitest';
import { isPackOwned } from '../content-pack';
import {
  PACK_OWNERSHIP_SOURCES,
  isPackEligible,
  ownedPackKeys,
  packOwnershipSourceOf,
  type PackEligibilityFacts,
} from '../pack-ownership';

const facts = (overrides: Partial<PackEligibilityFacts> = {}): PackEligibilityFacts => ({
  rank: 'murmure',
  trophyKeys: new Set<string>(),
  seasonNumbers: new Set<number>(),
  ...overrides,
});

describe('la source d’une possession', () => {
  it('connaît quatre sources : achat, jeu, octroi, événement', () => {
    expect([...PACK_OWNERSHIP_SOURCES]).toEqual(['purchase', 'game', 'grant', 'event']);
  });

  it('lit une ligne ANTÉRIEURE (sans source) comme un achat, et une source inconnue aussi', () => {
    expect(packOwnershipSourceOf(undefined)).toBe('purchase');
    expect(packOwnershipSourceOf(null)).toBe('purchase');
    expect(packOwnershipSourceOf('inconnue')).toBe('purchase');
    expect(packOwnershipSourceOf('event')).toBe('event');
  });
});

describe('la possession lit TOUTE source', () => {
  const rows = [
    { packKey: 'wallpaper.achete', source: 'purchase', requestId: 'achat-1', priceMeeshes: 40 },
    { packKey: 'wallpaper.ancien' },
    { packKey: 'wallpaper.gagne', source: 'game' },
    { packKey: 'banner.offert', source: 'grant', priceMeeshes: null, requestId: null },
    { packKey: 'avatar-ring.fete', source: 'event' },
  ];

  it('une ligne sans requestId ni prix possède le pack, comme un achat', () => {
    const owned = ownedPackKeys(rows);
    expect(isPackOwned({ domain: 'banner', slug: 'offert', price: 60 }, owned)).toBe(true);
    expect(isPackOwned({ domain: 'wallpaper', slug: 'gagne', price: 60 }, owned)).toBe(true);
    expect(isPackOwned({ domain: 'avatar-ring', slug: 'fete', price: 60 }, owned)).toBe(true);
    expect(isPackOwned({ domain: 'wallpaper', slug: 'ancien', price: 60 }, owned)).toBe(true);
  });

  it('un pack payant sans ligne reste non possédé', () => {
    expect(isPackOwned({ domain: 'banner', slug: 'autre', price: 60 }, ownedPackKeys(rows))).toBe(false);
  });
});

describe('l’éligibilité d’un pack, évaluée sur des faits serveur', () => {
  it('rang : atteint à partir du rang demandé, jamais en dessous ; Mythe dépasse tout', () => {
    const rule = { kind: 'rank', rank: 'voix' } as const;
    expect(isPackEligible(rule, facts({ rank: 'echo' }))).toBe(false);
    expect(isPackEligible(rule, facts({ rank: 'voix' }))).toBe(true);
    expect(isPackEligible(rule, facts({ rank: 'oracle' }))).toBe(true);
    expect(isPackEligible(rule, facts({ rank: 'mythe' }))).toBe(true);
  });

  it('trophée : la clé exacte doit être gravée', () => {
    const rule = { kind: 'trophy', key: 'season-cup:3' } as const;
    expect(isPackEligible(rule, facts({ trophyKeys: new Set(['season-cup:2']) }))).toBe(false);
    expect(isPackEligible(rule, facts({ trophyKeys: new Set(['season-cup:3']) }))).toBe(true);
  });

  it('saison : avoir participé à CETTE saison, pas à une autre', () => {
    const rule = { kind: 'season', number: 2 } as const;
    expect(isPackEligible(rule, facts({ seasonNumbers: new Set([1, 3]) }))).toBe(false);
    expect(isPackEligible(rule, facts({ seasonNumbers: new Set([2]) }))).toBe(true);
  });
});
