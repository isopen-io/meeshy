import { describe, expect, test } from 'bun:test';

import { listingAt, servedListingOf, withServedListing } from './served-listing';

/**
 * LE LISTING SERVI (#10501) — la page de fil dit quelle requête l'a servie
 * (`meta.feedRequestId`) et par quelle source chaque contenu a été classé ;
 * le client n'en invente rien et reste muet quand le serveur l'est.
 */
describe('servedListingOf', () => {
  test('lit meta.feedRequestId et la source de classement de l’item, sinon celle de la page', () => {
    expect(servedListingOf({ feedRequestId: 'fr-1', rankingSource: 'for_you' }, {})).toEqual({ feedRequestId: 'fr-1', rankingSource: 'for_you' });
    expect(servedListingOf({ feedRequestId: 'fr-1', rankingSource: 'for_you' }, { rankingSource: 'trending' })).toEqual({ feedRequestId: 'fr-1', rankingSource: 'trending' });
  });

  test('une source inconnue devient `other` ; un identifiant illisible est ignoré', () => {
    expect(servedListingOf({ feedRequestId: 42, rankingSource: 'mystère' }, {})).toEqual({ rankingSource: 'other' });
    expect(servedListingOf({ feedRequestId: 'x'.repeat(200) }, {})).toEqual({});
  });

  test('un serveur muet : rien', () => {
    expect(servedListingOf(undefined, {})).toEqual({});
  });
});

describe('withServedListing — aucune allocation quand le serveur ne dit rien', () => {
  test('sans meta, les posts sont rendus TELS QUELS (même référence)', () => {
    const posts = [{ id: 'a' }, { id: 'b' }];
    expect(withServedListing(posts, undefined)).toBe(posts);
  });

  test('avec meta, chaque post porte son listing servi', () => {
    const served = withServedListing([{ id: 'a' }], { feedRequestId: 'fr-9' });
    expect(served[0]).toEqual({ id: 'a', servedListing: { feedRequestId: 'fr-9' } });
  });
});

describe('listingAt — la place d’une carte', () => {
  test('position rendue, page servie, source servie ou celle de l’écran, passage du listing', () => {
    expect(listingAt({ position: 4, served: { feedRequestId: 'fr-1' }, fallbackSource: 'profile', listingSessionId: 'ls' })).toEqual({
      position: 4,
      feedRequestId: 'fr-1',
      rankingSource: 'profile',
      listingSessionId: 'ls',
    });
  });
});
