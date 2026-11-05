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
  impersonatesMeeshy,
  isReservedPublisherIdentity,
  publisherNameKey,
  publisherSlugOf,
} from '../pack-publisher';
import { lensCreditOf, parsePartnerProfileInput } from '../lens-partner';

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
    ['\u1D0Deeshy', 'Meesh\u028F', '\u028Deeshy', 'Studio \u02B0', 'Studio \uA731'].forEach((name) => expect(isReservedPublisherIdentity(name)).toBe(true));
  });

  it('refuse un nom qui mêle deux alphabets non latins', () => {
    ['\u0421\u0442\u0443\u0434\u0438\u043E\u03B1', '\u0627\u0644\u0646\u0648\u0631 \u0421\u0442\u0443\u0434\u0438\u044F'].forEach((name) => expect(isReservedPublisherIdentity(name)).toBe(true));
  });

  it('refuse un nom porteur d’un contrôle, d’un invisible, d’une marque bidi ou d’un séparateur autre que l’espace', () => {
    ['Awa\u2028', 'Awa\u200BStudio', 'Awa\u202EStudio', 'Awa\u00A0Studio', 'Awa\u0007'].forEach((name) => expect(isReservedPublisherIdentity(name)).toBe(true));
  });

  it('accepte les lettres latines légitimes sans décomposition canonique (audit #16274, A2)', () => {
    ['Søren Studio', 'Straße', 'Łukasz', 'Œuvre', 'Đà Nẵng', 'Þór', 'Ǆemal'].forEach((name) => expect(isReservedPublisherIdentity(name)).toBe(false));
  });

  it('accepte les symboles et les emoji, séquences jointes comprises', () => {
    ['Café ☕', 'Studio/Art', '50% Off', 'Studio ™', 'Awa \uD83D\uDE00', 'Famille \uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67', '"Quote" *Star*'].forEach((name) =>
      expect(isReservedPublisherIdentity(name)).toBe(false),
    );
  });

  it('accepte les mélanges du profil Highly Restrictive : latin avec Han et kana, avec Han et bopomofo, avec Han et hangul', () => {
    ['日本 Stickers', 'Tokyo スタジオ', '台北 ㄅㄆ Studio', '서울 Studio 漢'].forEach((name) => expect(isReservedPublisherIdentity(name)).toBe(false));
  });

  it('refuse le latin mêlé à un alphabet hors de ces mélanges', () => {
    ['Ahmed \u0623\u062D\u0645\u062F', 'Studio \u0421\u0442\u0443\u0434\u0438\u044F'].forEach((name) => expect(isReservedPublisherIdentity(name)).toBe(true));
  });

  it('réserve les sosies multi-caractères de Meeshy : rn ≈ m (audit #16274, A1)', () => {
    ['rneeshy', 'RNeeshy', 'rnee shy studio'].forEach((name) => expect(isReservedPublisherIdentity(name)).toBe(true));
    expect(impersonatesMeeshy('rneeshy')).toBe(true);
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

describe('impersonatesMeeshy — la seule réserve qui refuse une proposition', () => {
  it('vise Meeshy et ses sosies, jamais un nom seulement mal formé', () => {
    ['Meeshy Fan', '\u041Ceeshy', 'rneeshy', '\u1D0Deeshy'].forEach((name) => expect(impersonatesMeeshy(name)).toBe(true));
    ['Studio \u02B0', 'Ahmed \u0623\u062D\u0645\u062F', 'me', 'Søren'].forEach((name) => expect(impersonatesMeeshy(name)).toBe(false));
  });
});

describe('publisherNameKey — deux éditeurs ne portent pas le même nom à la lecture', () => {
  it('confond la casse, les accents, la ponctuation et les confusables', () => {
    expect(publisherNameKey('Studio Lumière')).toBe(publisherNameKey('studio-lumiere'));
    expect(publisherNameKey('Studio Lumière')).toBe(publisherNameKey('Studi\u043E Lumi\u0435re'));
    expect(publisherNameKey('Mode')).toBe(publisherNameKey('Rnode'));
    expect(publisherNameKey('Wave')).toBe(publisherNameKey('VVave'));
    expect(publisherNameKey('Bold')).toBe(publisherNameKey('Bolcl'));
    expect(publisherNameKey('Ivy')).toBe(publisherNameKey('lvy'));
    expect(publisherNameKey('Ivy')).toBe(publisherNameKey('1vy'));
    expect(publisherNameKey('Oslo')).toBe(publisherNameKey('0slo'));
  });

  it('distingue deux noms différents, et garde les lettres d’un autre alphabet', () => {
    expect(publisherNameKey('Studio Lumière')).not.toBe(publisherNameKey('Studio Aurore'));
    expect(publisherNameKey('\u0627\u0633\u062A\u0648\u062F\u064A\u0648')).not.toBe(publisherNameKey('\u0627\u0644\u0646\u0648\u0631'));
    expect(publisherNameKey('☕')).not.toBe('');
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

  it('accepte un partenaire au nom latin légitime (audit #16274)', () => {
    expect(parsePartnerProfileInput({ displayName: 'Søren Studio' })).toMatchObject({ ok: true, profile: { displayName: 'Søren Studio' } });
  });

  it('laisse le compte officiel garder le nom Meeshy, à lui seul', () => {
    expect(parsePartnerProfileInput({ displayName: 'Meeshy' }, { official: true })).toMatchObject({ ok: true, profile: { displayName: 'Meeshy' } });
    expect(parsePartnerProfileInput({ displayName: 'Meeshy' }, { official: false })).toEqual({ ok: false, reason: 'display-name' });
  });
});

describe('lensCreditOf — la réserve Meeshy atteint les crédits de lens', () => {
  const lens = { slug: 'aurore', name: 'Aurore', status: 'approved' };
  const partner = (displayName: string) => ({ id: 'p1', displayName, verifiedAt: new Date('2026-11-01T00:00:00Z'), logoSrc: null });

  it('ne crédite pas un tiers vérifié dont le nom se lit comme Meeshy', () => {
    expect(lensCreditOf(lens, partner('Meeshy Partner'))?.partner).toBeNull();
  });

  it('crédite le compte officiel sous Meeshy, et un partenaire ordinaire sous son nom', () => {
    expect(lensCreditOf(lens, { ...partner('Meeshy'), official: true })?.partner).toMatchObject({ name: 'Meeshy' });
    expect(lensCreditOf(lens, partner('Studio Lumière'))?.partner).toMatchObject({ name: 'Studio Lumière' });
  });
});
