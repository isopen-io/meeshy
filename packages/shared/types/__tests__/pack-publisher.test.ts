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
import { isWellFormedPublisherName } from '../pack-publisher';

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

  it('refuse le latin mêlé à un alphabet hors de ces mélanges (le latin et l’arabe en sont un, re-audit #16274)', () => {
    ['Studio \u0421\u0442\u0443\u0434\u0438\u044F', 'Studio \u05E9\u05DC\u05D5\u05DD'].forEach((name) => expect(isReservedPublisherIdentity(name)).toBe(true));
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

describe('impersonatesMeeshy est FERMÉE PAR DÉFAUT — un caractère inconnu vaut n’importe quelle lettre (revue de sécurité #16274)', () => {
  it('réserve Meeshy écrit avec un symbole, une lettre de style, une barre ou une lettre latine hors table à la place d’une lettre', () => {
    ['\u24DCeeshy', '\u2133eeshy', 'M\u0435\u0435shy', 'M\u2758eeshy', 'Meesh\u01B4', 'Mee\u00DFhy', 'M|eeshy', 'Mee\u2606shy', 'M\uD83D\uDE42eeshy', 'Meesh\u2726y', 'Me\u20DDeshy'].forEach((name) => {
      expect(impersonatesMeeshy(name)).toBe(true);
      expect(isReservedPublisherIdentity(name)).toBe(true);
    });
  });

  it('ne réserve pas pour autant un nom d’un autre alphabet, ni un nom latin légitime', () => {
    ['Søren Studio', '日本 Stickers', 'Café ☕', '東京スタジオ', '\u0627\u0633\u062A\u0648\u062F\u064A\u0648 \u0627\u0644\u0646\u0648\u0631', 'コーヒー Studio'].forEach((name) => {
      expect(impersonatesMeeshy(name)).toBe(false);
      expect(isReservedPublisherIdentity(name)).toBe(false);
    });
  });
});

describe('une lettre latine n’est valide que si elle se replie en ASCII ou figure dans la liste des lettres étendues légitimes', () => {
  it('refuse une lettre latine étendue hors de cette liste', () => {
    ['Stud\u0269o', 'Studio \u1E9C', 'Studio \u0251'].forEach((name) => expect(isReservedPublisherIdentity(name)).toBe(true));
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

describe('re-audit #16274 — les orthographes réelles passent, les sosies et le leet non', () => {
  it('B1 — chiffres et ponctuation lus comme lettres : « Mee5hy », « M33SHY », « Mee§hy », « M€€§HY » imitent Meeshy', () => {
    ['Mee5hy', 'M33SHY', 'me3shy', 'Mee§hy', 'M€€§HY', 'M33$HY'].forEach((name) => expect([name, impersonatesMeeshy(name)]).toEqual([name, true]));
  });

  it('B2 — un nom en latin africain (bambara, peul, haoussa, ewe, azéri) est un nom de partenaire valide', () => {
    ['Fɛɛrɛ Studio', 'Kɔfi Art', 'Ɗanjuma', 'Ɓaaba', 'Əli Studio', 'Ɲɛnajɛ', 'Ƙasa', 'Ƴiiri', 'Ʋɔ', 'Ɣana', 'ʃɔʒ'].forEach((name) =>
      expect([name, parsePartnerProfileInput({ displayName: name }).ok]).toEqual([name, true]),
    );
  });

  it('un nom qui mêle le latin et l’arabe est valide', () => {
    expect(parsePartnerProfileInput({ displayName: 'Ahmed أحمد' })).toMatchObject({ ok: true, profile: { displayName: 'Ahmed أحمد' } });
  });

  it('les sosies latins restent refusés : petites capitales, IPA imitatrices, clics, pleine largeur', () => {
    ['ɑrt Studio', 'ɡaia', 'ʍorld', 'Studio ɪris', 'ᴀtelier', 'Studio ǀ', 'Ｓtudio'].forEach((name) => expect([name, isReservedPublisherIdentity(name)]).toEqual([name, true]));
  });

  it('les lettres latines admises comptent comme jokers face à Meeshy : pas de régression', () => {
    ['Mɛɛshy', 'Mɔɔshy', 'Meeʃhy', 'Mɛeshy Studio'].forEach((name) => expect([name, impersonatesMeeshy(name)]).toEqual([name, true]));
    expect(isReservedPublisherIdentity('Kɔfi Art')).toBe(false);
  });

  it('un nom mal formé qui se LIT « MEESHY » est une imitation, quel que soit le nombre de caractères inconnus (cherokee)', () => {
    expect(impersonatesMeeshy('ᎷᎬᎬSHY')).toBe(true);
    expect(isReservedPublisherIdentity('ᎷᎬᎬSHY')).toBe(true);
  });

  it('C5 — le leet n’entre PAS dans la clé : « Studio 54 » et « Studio SA » sont deux boutiques (re-audit 3, N9)', () => {
    expect(publisherNameKey('Studio 54')).not.toBe(publisherNameKey('Studio SA'));
    expect(publisherNameKey('Team 4')).not.toBe(publisherNameKey('Team A'));
    expect(publisherNameKey('Studio Lumi3re')).not.toBe(publisherNameKey('Studio Lumière'));
    expect(publisherNameKey('Kɔfi Art')).not.toBe(publisherNameKey('Kofi Art'));
  });
});

describe('re-audit 3 #16274 — un alphabet absent n’est pas une imitation, les sosies latins le sont', () => {
  it('C1 — les sosies latins à crochet, barre ou boucle sont refusés et se lisent comme Meeshy : « Mɇɇʂhy »', () => {
    ['Mɇɇʂhy', 'ɱɇɇshy', 'Mɇɇʂħy', 'ɱeeʂħy', 'Meeʂɦy', 'Meeshɏ', 'Mǝǝshy', 'Mɘɘshy', 'Meeȿhy'].forEach((name) => {
      expect([name, isReservedPublisherIdentity(name)]).toEqual([name, true]);
      expect([name, impersonatesMeeshy(name)]).toEqual([name, true]);
    });
  });

  it('C2 — un nom gujarati, gurmukhi, kannada, malayalam, oriya, cingalais, khmer, lao, birman, tibétain, thaana, n’ko ou tifinagh est valide', () => {
    ['ગુજરાત સ્ટુડિયો', 'ਪੰਜਾਬ', 'ಕನ್ನಡ ಕಲೆ', 'മലയാളം', 'ଓଡ଼ିଆ', 'සිංහල', 'ខ្មែរ ស្ទូឌីយោ', 'ລາວ', 'မြန်မာ', 'བོད་ཡིག', 'ދިވެހި', 'ߒߞߏ', 'ⵜⴰⵎⴰⵣⵉⵖⵜ'].forEach((name) =>
      expect([name, parsePartnerProfileInput({ displayName: name }).ok]).toEqual([name, true]),
    );
  });

  it('N7 — un nom de la liste blanche, ou un nom hérité MARQUÉ, n’a que deux jokers : il n’est pas lu comme Meeshy', () => {
    expect(impersonatesMeeshy('ગુજરાત સ્ટુડિયો')).toBe(false);
    ['Café Москва', 'ꯃꯩꯇꯩ ꯃꯌꯦꯛ', 'Mꯃꯃꯇhy'].forEach((name) =>
      expect([name, impersonatesMeeshy(name, { grandfathered: true })]).toEqual([name, false]),
    );
    expect(isWellFormedPublisherName('Café Москва')).toBe(false);
  });

  it('un nom hors liste écrit DIRECTEMENT, sans marque, garde des jokers illimités : « Mꯃꯃꯇhy » (trois jokers) se lit comme Meeshy', () => {
    ['Mꯃꯃꯇhy', 'ꯃꯃꯃꯃꯃꯃ'].forEach((name) => expect([name, impersonatesMeeshy(name)]).toEqual([name, true]));
    expect(isReservedPublisherIdentity('Mꯃꯃꯇhy')).toBe(true);
  });

  it('C4 — un ancien partenaire vérifié « Café Москва » MARQUÉ hors liste garde son crédit de lens', () => {
    const credit = lensCreditOf(
      { slug: 'l', name: 'L', status: 'approved' },
      { id: 'p', displayName: 'Café Москва', verifiedAt: new Date(), logoSrc: null, grandfathered: true },
    );
    expect(credit?.partner?.name).toBe('Café Москва');
  });

  it('sans la marque, un partenaire vérifié hors liste n’est pas crédité — la marque se lit sur la ligne, jamais à partir du nom', () => {
    const lens = { slug: 'l', name: 'L', status: 'approved' as const };
    const verifiedAt = new Date();
    expect(lensCreditOf(lens, { id: 'p', displayName: 'Café Москва', verifiedAt, logoSrc: null })?.partner).toBeNull();
    expect(lensCreditOf(lens, { id: 'p', displayName: 'Mꯃꯃꯇhy', verifiedAt, logoSrc: null, grandfathered: true })?.partner).toMatchObject({ name: 'Mꯃꯃꯇhy' });
    expect(lensCreditOf(lens, { id: 'p', displayName: 'Mɇɇʂhy', verifiedAt, logoSrc: null, grandfathered: true })?.partner).toBeNull();
  });

  it('le cherokee qui imite des capitales latines se lit par la table de lecture : « ᎷᎬᎬSHY » reste une imitation', () => {
    expect(impersonatesMeeshy('ᎷᎬᎬSHY')).toBe(true);
    expect(impersonatesMeeshy('ꓟꓰꓰꓢꓧꓬ')).toBe(true);
  });
});
