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

  it('réserve Meeshy écrit avec des homoglyphes cyrilliques, grecs ou pleine largeur (squelette UTS #39)', () => {
    ['\u041Ceeshy', 'Meesh\u0443', 'M\u0435\u0435shy', '\u039Ceeshy', 'Mee\u0455hy', 'ＭＥＥＳＨＹ', 'Meeѕhу Studio', 'M3eshy'.replace('3', '\u0435')].forEach((name) =>
      expect(isReservedPublisherIdentity(name)).toBe(true),
    );
  });

  it('refuse un nom qui mêle l’alphabet latin et un autre alphabet', () => {
    ['Studi\u043E', 'Lumi\u03B5re', 'Awa\u0410'].forEach((name) => expect(isReservedPublisherIdentity(name)).toBe(true));
  });

  it('laisse passer un nom écrit dans un seul autre alphabet', () => {
    ['Студия', 'Στούντιο', '東京スタジオ'].forEach((name) => expect(isReservedPublisherIdentity(name)).toBe(false));
  });

  it('réserve Meeshy écrit entièrement en confusables d’un seul alphabet', () => {
    ['\u041C\u0435\u0435\u0455\u04BB\u0443', '\u039C\u0395\u0395\u0405\u0397\u03A5'].forEach((name) => expect(isReservedPublisherIdentity(name)).toBe(true));
  });

  it('refuse les petites capitales, les lettres IPA et les lettres modificatives latines (liste blanche, UTS #39 Highly Restrictive)', () => {
    ['\u1D0Deeshy', 'Meesh\u028F', '\u028Deeshy', 'Studio \u02B0', 'Stra\u00DFe'].forEach((name) => expect(isReservedPublisherIdentity(name)).toBe(true));
  });

  it('refuse un nom qui mêle deux alphabets non latins', () => {
    ['\u0421\u0442\u0443\u0434\u0438\u043E\u03B1', '\u0627\u0644\u0646\u0648\u0631 \u0421\u0442\u0443\u0434\u0438\u044F'].forEach((name) => expect(isReservedPublisherIdentity(name)).toBe(true));
  });

  it('refuse un nom porteur de symboles hors de la ponctuation courante', () => {
    ['Studio \u2122', 'Awa \uD83D\uDE00', 'Awa\u2028'].forEach((name) => expect(isReservedPublisherIdentity(name)).toBe(true));
  });

  it('accepte un nom arabe légitime, un nom japonais et un nom latin accentué avec chiffres et ponctuation', () => {
    ['\u0627\u0633\u062A\u0648\u062F\u064A\u0648 \u0627\u0644\u0646\u0648\u0631', '東京スタジオ', 'Studio Lumière 2026 — Awa & Co.', 'O’Brien Labs'].forEach((name) =>
      expect(isReservedPublisherIdentity(name)).toBe(false),
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
