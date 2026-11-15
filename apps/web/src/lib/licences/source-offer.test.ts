import { describe, expect, test } from 'bun:test';

import { MEESHY_REPOSITORY_URL, sourceOfferFor } from './source-offer';

const sha = '0123456789abcdef0123456789abcdef01234567';

describe('l offre de source de l écran Licences (#14628)', () => {
  test('un commit complet mène à l arbre de ce commit', () => {
    expect(sourceOfferFor(sha)).toEqual({ commit: sha, shortCommit: '0123456', url: `${MEESHY_REPOSITORY_URL}/tree/${sha}` });
  });

  test('sans commit gravé, elle mène au dépôt', () => {
    expect(sourceOfferFor(null)).toEqual({ commit: null, shortCommit: null, url: MEESHY_REPOSITORY_URL });
  });

  test('une valeur qui n est pas un SHA-1 complet n est jamais tenue pour un commit', () => {
    for (const raw of ['', '0123456', 'z'.repeat(40), sha + sha, 'main']) {
      expect(sourceOfferFor(raw).commit).toBeNull();
    }
  });

  test('la casse et les espaces sont normalisés', () => {
    expect(sourceOfferFor(`  ${sha.toUpperCase()}\n`).commit).toBe(sha);
  });
});
