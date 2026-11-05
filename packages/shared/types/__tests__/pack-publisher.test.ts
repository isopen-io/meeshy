/**
 * #16274 — tout pack, Meeshy compris, appartient à un ÉDITEUR lié à un vrai
 * compte Meeshy. L'identité « Meeshy » est RÉSERVÉE au compte officiel : aucun
 * tiers ne publie sous ce nom, ni sous un nom qui se lit comme lui.
 */
import { describe, expect, it } from 'vitest';
import {
  MEESHY_PUBLISHER,
  PACK_PUBLISHER_LIMITS,
  claimedPublisherSlug,
  isReservedPublisherIdentity,
  publisherSlugOf,
} from '../pack-publisher';
import { parsePartnerProfileInput } from '../lens-partner';

describe('MEESHY_PUBLISHER — l’éditeur des packs du dépôt', () => {
  it('se nomme Meeshy, sous le slug meeshy, officiel et vérifié', () => {
    expect(MEESHY_PUBLISHER).toEqual({ slug: 'meeshy', name: 'Meeshy', verified: true, official: true });
  });
});

describe('isReservedPublisherIdentity — personne ne se fait passer pour Meeshy', () => {
  it('réserve Meeshy sous toutes ses graphies', () => {
    ['Meeshy', 'meeshy', ' MEESHY ', 'Méeshy', 'Meeshy Officiel', 'Team-Meeshy', 'ｍｅｅｓｈｙ', 'Mee​shy'].forEach((name) =>
      expect(isReservedPublisherIdentity(name)).toBe(true),
    );
  });

  it('réserve les slugs qui servent de routes', () => {
    ['me', 'admin'].forEach((name) => expect(isReservedPublisherIdentity(name)).toBe(true));
  });

  it('laisse passer un nom ordinaire', () => {
    ['Studio Lumière', 'Awa', 'Mee & Meo Fan Club'].forEach((name) => expect(isReservedPublisherIdentity(name)).toBe(false));
  });
});

describe('publisherSlugOf — l’adresse d’un éditeur, tirée de son NOM de boutique', () => {
  it('replie les accents, la casse et la ponctuation', () => {
    expect(publisherSlugOf('Studio Lumière !')).toBe('studio-lumiere');
  });

  it('borne la longueur et ne rend jamais une chaîne vide', () => {
    expect(publisherSlugOf('x'.repeat(200)).length).toBeLessThanOrEqual(PACK_PUBLISHER_LIMITS.maxSlugLength);
    expect(publisherSlugOf('!!!')).toBe('editeur');
  });
});

describe('claimedPublisherSlug — l’éditeur qu’une proposition NOMME', () => {
  it('lit le champ `publisher` d’un manifeste', () => {
    expect(claimedPublisherSlug({ publisher: 'studio-lumiere' })).toBe('studio-lumiere');
  });

  it('rend `null` quand rien n’est nommé (un ancien client)', () => {
    [undefined, null, {}, { publisher: '' }, 'texte'].forEach((input) => expect(claimedPublisherSlug(input)).toBeNull());
  });

  it('rend une valeur INVALIDE telle quelle : elle ne correspond à aucun éditeur possédé, donc refusée', () => {
    expect(claimedPublisherSlug({ publisher: 42 })).toBe('');
    expect(claimedPublisherSlug({ publisher: '../meeshy' })).toBe('../meeshy');
  });
});

describe('parsePartnerProfileInput — le nom de boutique d’un éditeur', () => {
  it('refuse un nom réservé à Meeshy', () => {
    expect(parsePartnerProfileInput({ displayName: 'Meeshy Officiel' })).toEqual({ ok: false, reason: 'display-name' });
  });
});
