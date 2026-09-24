import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import {
  decodeLinkInvitation,
  guestRefusalOf,
  joinLinkAsGuest,
  joinLinkAsMember,
  linkRefusalOf,
  loadLinkInvitation,
  NICKNAME_TAKEN,
  validateGuestDraft,
  type GuestDraft,
  type GuestTerms,
} from './link-join';

/**
 * LE PORT DE LA JONCTION PAR LIEN (#5561) — ce que ces témoins gardent, dans
 * l'ordre de gravité :
 *
 *  1. l'invitation ne transporte RIEN de la conversation au-delà de ce qu'elle
 *     affiche — même quand la charge servie en porte davantage ;
 *  2. une jonction servie « en invité » n'est jamais prise pour celle d'un
 *     membre (la passerelle retombe en invité sur un jeton expiré) ;
 *  3. un refus se lit sur son CODE, le statut ne servant que là où la
 *     passerelle n'en pose aucun.
 */

function fakeTransport(result: ApiResult<unknown>) {
  const requests: HttpRequest[] = [];
  const transport = (async () => result) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    requests.push(req);
    return result;
  }) as HttpTransport['request'];
  return { transport, requests };
}

const SECRET_MESSAGE = 'Le code du coffre est 4512';
const SECRET_MEMBER = 'Bruno Secret';
const SECRET_GUEST = 'Invité caché';
const CONVERSATION_ID = '64f1c2a9e8b7d6c5b4a39282';

/** La charge de `GET /anonymous/link/:identifier` telle que `anonymous.ts:714-743` la sert. */
const servedPreview = () => ({
  id: '64f1c2a9e8b7d6c5b4a39281',
  linkId: 'mshy_equipe_7f3a',
  name: 'Invitation de l’équipe',
  description: 'Rejoignez-nous',
  expiresAt: null,
  maxUses: 50,
  currentUses: 12,
  maxConcurrentUsers: null,
  currentConcurrentUsers: 0,
  requireAccount: false,
  requireNickname: true,
  requireEmail: false,
  requireBirthday: false,
  allowedLanguages: ['fr'],
  allowAnonymousMessages: true,
  allowAnonymousFiles: false,
  allowAnonymousImages: true,
  allowViewHistory: true,
  conversation: {
    id: CONVERSATION_ID,
    title: 'Équipe déploiement',
    description: 'Nos échanges internes',
    type: 'group',
    createdAt: '2026-09-01T10:00:00.000Z',
  },
  creator: {
    id: '64f1c2a9e8b7d6c5b4a39283',
    username: 'awa',
    firstName: 'Awa',
    lastName: 'Diallo',
    displayName: 'Awa D.',
    avatar: '2026/09/awa/photo.png',
  },
  stats: { totalParticipants: 14, memberCount: 12, anonymousCount: 2, languageCount: 3, spokenLanguages: ['fr', 'en', 'wo'] },
});

/** La même charge ENRICHIE de ce que `GET /links/:identifier` sert à côté (`retrieval.ts:342-404`). */
const poisonedPreview = () => ({
  ...servedPreview(),
  userType: 'anonymous',
  messages: [{ id: 'm1', content: SECRET_MESSAGE, sender: { displayName: SECRET_MEMBER } }],
  members: [{ id: 'p1', role: 'member', user: { id: 'u1', username: 'bruno', displayName: SECRET_MEMBER } }],
  anonymousParticipants: [{ id: 'p2', displayName: SECRET_GUEST }],
  currentUser: { id: 'u2', displayName: SECRET_MEMBER },
});

describe('decodeLinkInvitation — une invitation, et rien de ce qui IDENTIFIE un membre', () => {
  test('rend ce que la page d’accueil affiche : qui invite, son message, le groupe, les chiffres, la porte', () => {
    expect(decodeLinkInvitation(servedPreview())).toEqual({
      linkId: 'mshy_equipe_7f3a',
      title: 'Équipe déploiement',
      kind: 'group',
      inviter: { name: 'Awa D.', username: 'awa', avatar: '2026/09/awa/photo.png' },
      message: 'Rejoignez-nous',
      group: { description: 'Nos échanges internes', createdAt: '2026-09-01T10:00:00.000Z', avatar: null, banner: null },
      stats: {
        people: 14,
        languages: [
          { code: 'fr', count: null },
          { code: 'en', count: null },
          { code: 'wo', count: null },
        ],
      },
      limits: { expiresAt: null, maxUses: 50, currentUses: 12 },
      readsHistory: true,
      guest: {
        allowed: true,
        nicknameRequired: true,
        emailRequired: false,
        birthdayRequired: false,
        languages: ['fr'],
        mayWrite: true,
        mayImages: true,
        mayFiles: false,
      },
    });
  });

  test('une charge qui porte messages, membres et invités : le décodeur les JETTE, identifiants compris', () => {
    const decoded = decodeLinkInvitation(poisonedPreview());
    expect(decoded).not.toBeNull();
    expect(Object.keys(decoded ?? {}).sort()).toEqual(['group', 'guest', 'inviter', 'kind', 'limits', 'linkId', 'message', 'readsHistory', 'stats', 'title']);
    const carried = JSON.stringify(decoded);
    for (const secret of [SECRET_MESSAGE, SECRET_MEMBER, SECRET_GUEST, CONVERSATION_ID, 'bruno', '64f1c2a9e8b7d6c5b4a39283']) {
      expect({ secret, carried: carried.includes(secret) }).toEqual({ secret, carried: false });
    }
  });

  test('logo et bannière du groupe passent quand la passerelle les sert, et restent nuls sinon', () => {
    const base = servedPreview();
    const decoded = decodeLinkInvitation({ ...base, conversation: { ...base.conversation, avatar: 'g/logo.png', banner: 'g/banniere.jpg' } });
    expect(decoded?.group.avatar).toBe('g/logo.png');
    expect(decoded?.group.banner).toBe('g/banniere.jpg');
    expect(decodeLinkInvitation({ ...base, conversation: { ...base.conversation, avatar: '  ', banner: null } })?.group).toEqual({
      description: 'Nos échanges internes',
      createdAt: '2026-09-01T10:00:00.000Z',
      avatar: null,
      banner: null,
    });
  });

  test('un message d’invitation vide ou une date illisible ne s’affichent pas', () => {
    const base = servedPreview();
    const decoded = decodeLinkInvitation({ ...base, description: '   ', conversation: { ...base.conversation, createdAt: 'hier' } });
    expect(decoded?.message).toBeNull();
    expect(decoded?.group.createdAt).toBeNull();
  });

  test('les langues parlées : codes dédoublonnés et normalisés, et des COMPTES quand la passerelle en sert', () => {
    const base = servedPreview();
    expect(decodeLinkInvitation({ ...base, stats: { ...base.stats, spokenLanguages: ['FR', 'fr', ' en ', ''] } })?.stats.languages).toEqual([
      { code: 'fr', count: null },
      { code: 'en', count: null },
    ]);
    const counted = decodeLinkInvitation({
      ...base,
      stats: { ...base.stats, spokenLanguages: [{ language: 'es', count: 3 }, { language: 'ko', count: 7 }, { language: 'xx', count: -1 }] },
    });
    expect(counted?.stats.languages).toEqual([
      { code: 'ko', count: 7 },
      { code: 'es', count: 3 },
    ]);
  });

  test('sans statistiques servies, les chiffres sont INCONNUS, jamais zéro', () => {
    const { stats: _stats, ...base } = servedPreview();
    expect(decodeLinkInvitation(base)?.stats).toEqual({ people: null, languages: [] });
  });

  test('les limites : utilisations et expiration telles que servies, un compteur illisible vaut zéro', () => {
    const base = servedPreview();
    expect(decodeLinkInvitation({ ...base, expiresAt: '2026-10-01T00:00:00.000Z', maxUses: null, currentUses: null })?.limits).toEqual({
      expiresAt: '2026-10-01T00:00:00.000Z',
      maxUses: null,
      currentUses: 0,
    });
  });

  test('une permission ABSENTE est refusée : images et fichiers ne se promettent pas', () => {
    const { allowAnonymousImages: _images, allowAnonymousFiles: _files, ...base } = servedPreview();
    const guest = decodeLinkInvitation(base)?.guest;
    expect(guest?.mayImages).toBe(false);
    expect(guest?.mayFiles).toBe(false);
  });

  test('le nom de l’invitant suit `ShareLinkCreator.name` d’iOS : affiché, puis prénom nom, puis pseudo', () => {
    const base = servedPreview();
    const withCreator = (creator: Record<string, unknown>) => decodeLinkInvitation({ ...base, creator: { ...base.creator, ...creator } })?.inviter?.name;
    expect(withCreator({ displayName: null })).toBe('Awa Diallo');
    expect(withCreator({ displayName: '  ', firstName: null, lastName: '' })).toBe('awa');
  });

  test('sans invitant servi, l’invitation reste lisible, anonyme', () => {
    const { creator: _creator, ...sansInvitant } = servedPreview();
    expect(decodeLinkInvitation(sansInvitant)?.inviter).toBeNull();
  });

  test('le titre retombe sur le NOM du lien, puis sur rien', () => {
    const base = servedPreview();
    expect(decodeLinkInvitation({ ...base, conversation: { ...base.conversation, title: null } })?.title).toBe('Invitation de l’équipe');
    expect(decodeLinkInvitation({ ...base, name: null, conversation: { ...base.conversation, title: '' } })?.title).toBeNull();
  });

  test('un type inconnu ne s’invente pas, et un droit de lecture absent ne se promet pas', () => {
    const { allowViewHistory: _history, ...base } = servedPreview();
    const decoded = decodeLinkInvitation({ ...base, conversation: { ...base.conversation, type: 'secret-society' } });
    expect(decoded?.kind).toBeNull();
    expect(decoded?.readsHistory).toBe(false);
  });

  test('une charge sans conversation est illisible', () => {
    const { conversation: _conversation, ...base } = servedPreview();
    expect(decodeLinkInvitation(base)).toBeNull();
    expect(decodeLinkInvitation(null)).toBeNull();
  });
});

describe('loadLinkInvitation — GET /api/v1/anonymous/link/:identifier', () => {
  test('lit la route PUBLIQUE d’aperçu, jamais `GET /links/:identifier` qui sert les messages', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: poisonedPreview() });
    const result = await loadLinkInvitation({ source: 'gateway', transport, link: 'mshy_équipe 7f3a' });
    expect(requests.map((r) => [r.method, r.path])).toEqual([['GET', '/api/v1/anonymous/link/mshy_%C3%A9quipe%207f3a']]);
    expect(result.ok && result.data.title).toBe('Équipe déploiement');
  });

  test('un refus traverse tel quel — statut et code', async () => {
    const { transport } = fakeTransport({ ok: false, status: 410, error: 'Ce lien a expire', code: 'LINK_EXPIRED' });
    const result = await loadLinkInvitation({ source: 'gateway', transport, link: 'mshy_x' });
    expect(result).toEqual({ ok: false, status: 410, error: 'Ce lien a expire', code: 'LINK_EXPIRED' });
  });

  test('une charge illisible est un échec NOMMÉ, jamais une invitation vide', async () => {
    const { transport } = fakeTransport({ ok: true, data: { linkId: 'mshy_x' } });
    const result = await loadLinkInvitation({ source: 'gateway', transport, link: 'mshy_x' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe('UNREADABLE_INVITATION');
  });

  test('en fixtures : un lien connu s’ouvre sans réseau, un lien inconnu est introuvable', async () => {
    const { transport, requests } = fakeTransport({ ok: false, status: 0, error: 'jamais appelé' });
    const known = await loadLinkInvitation({ source: 'fixtures', transport, link: 'mshy_equipe-deploiement_7f3a' });
    const unknown = await loadLinkInvitation({ source: 'fixtures', transport, link: 'mshy_inconnu' });
    expect(known.ok).toBe(true);
    expect(!unknown.ok && unknown.status).toBe(404);
    expect(requests).toHaveLength(0);
  });
});

describe('joinLinkAsMember — POST /api/v1/links/:key/members', () => {
  const joined = (entry: Record<string, unknown>, extra: Record<string, unknown> = {}): ApiResult<unknown> => ({
    ok: true,
    data: { conversationId: CONVERSATION_ID, participantId: 'p9', entry, ...extra },
  });

  test('envoie la SEULE langue du compte — aucun pseudo, aucune donnée d’invité', async () => {
    const { transport, requests } = fakeTransport(joined({ outcome: 'new', canViewHistory: true }));
    const result = await joinLinkAsMember({ source: 'gateway', transport }, { link: 'mshy_equipe_7f3a', language: 'en' });
    expect(requests.map((r) => [r.method, r.path, r.body])).toEqual([['POST', '/api/v1/links/mshy_equipe_7f3a/members', { language: 'en' }]]);
    expect(result).toEqual({ ok: true, data: { conversationId: CONVERSATION_ID, alreadyMember: false } });
  });

  test('sans langue connue, le corps est vide : le défaut reste celui du serveur', async () => {
    const { transport, requests } = fakeTransport(joined({ outcome: 'rejoin' }));
    await joinLinkAsMember({ source: 'gateway', transport }, { link: 'mshy_x', language: null });
    expect(requests[0]?.body).toEqual({});
  });

  test('un membre existant est reconnu comme tel', async () => {
    const { transport } = fakeTransport(joined({ outcome: 'already-member' }));
    const result = await joinLinkAsMember({ source: 'gateway', transport }, { link: 'mshy_x', language: 'fr' });
    expect(result).toEqual({ ok: true, data: { conversationId: CONVERSATION_ID, alreadyMember: true } });
  });

  test('une jonction servie EN INVITÉ (jeton de session remis) n’est pas celle d’un membre', async () => {
    const { transport } = fakeTransport(joined({ outcome: 'new' }, { sessionToken: 'anon_abc' }));
    const result = await joinLinkAsMember({ source: 'gateway', transport }, { link: 'mshy_x', language: 'fr' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe('JOINED_AS_GUEST');
  });

  test('une réponse sans conversation est un échec nommé', async () => {
    const { transport } = fakeTransport({ ok: true, data: { participantId: 'p9' } });
    const result = await joinLinkAsMember({ source: 'gateway', transport }, { link: 'mshy_x', language: 'fr' });
    expect(!result.ok && result.code).toBe('UNREADABLE_JOIN');
  });

  test('un refus traverse tel quel', async () => {
    const { transport } = fakeTransport({ ok: false, status: 409, error: 'plein', code: 'LINK_EXHAUSTED' });
    const result = await joinLinkAsMember({ source: 'gateway', transport }, { link: 'mshy_x', language: 'fr' });
    expect(result).toEqual({ ok: false, status: 409, error: 'plein', code: 'LINK_EXHAUSTED' });
  });

  test('en fixtures : rejoindre ouvre une conversation connue, sans réseau', async () => {
    const { transport, requests } = fakeTransport({ ok: false, status: 0, error: 'jamais appelé' });
    const result = await joinLinkAsMember({ source: 'fixtures', transport }, { link: 'mshy_equipe-deploiement_7f3a', language: 'fr' });
    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(0);
  });
});

describe('linkRefusalOf — le CODE d’abord', () => {
  const cases: ReadonlyArray<readonly [number, string | undefined, string]> = [
    [410, 'LINK_DEACTIVATED', 'revoked'],
    [410, 'LINK_INACTIVE', 'revoked'],
    [410, 'LINK_EXPIRED', 'expired'],
    [410, 'CONVERSATION_CLOSED', 'closed'],
    [409, 'LINK_EXHAUSTED', 'full'],
    [410, 'LINK_MAX_USES', 'full'],
    [403, 'LANGUAGE_NOT_ALLOWED', 'language'],
    [403, 'BANNED', 'banned'],
    [403, 'REGION_NOT_ALLOWED', 'region'],
    [403, 'ACCOUNT_REQUIRED', 'account-required'],
    [0, 'JOINED_AS_GUEST', 'session-expired'],
    [404, undefined, 'not-found'],
    [429, undefined, 'rate-limited'],
    [0, undefined, 'offline'],
    // Une passerelle qui accepte la connexion puis se TAIT n'est pas un réseau
    // coupé : « vous êtes hors ligne » y serait un conseil faux.
    [0, 'TIMEOUT', 'unavailable'],
    [0, 'UNREADABLE_INVITATION', 'unavailable'],
    [403, 'SOMETHING_NEW', 'unavailable'],
    [500, undefined, 'unavailable'],
  ];

  for (const [status, code, expected] of cases) {
    test(`${status} ${code ?? '(sans code)'} ⇒ ${expected}`, () => {
      expect(linkRefusalOf(code === undefined ? { status } : { status, code })).toBe(expected);
    });
  }

  test('un code posé GAGNE sur le statut qui l’accompagne', () => {
    expect(linkRefusalOf({ status: 404, code: 'LINK_EXPIRED' })).toBe('expired');
    expect(linkRefusalOf({ status: 429, code: 'BANNED' })).toBe('banned');
  });

  test('un 410 sans code ne se devine pas', () => {
    expect(linkRefusalOf({ status: 410 })).toBe('unavailable');
  });
});

/* ========================================================================= *
 *  REJOINDRE SANS COMPTE (#5561)
 * ========================================================================= */

const TERMS: GuestTerms = {
  allowed: true,
  nicknameRequired: true,
  emailRequired: false,
  birthdayRequired: false,
  languages: [],
  mayWrite: true,
  mayImages: true,
  mayFiles: false,
};

const draft = (partial: Partial<GuestDraft> = {}): GuestDraft => ({
  nickname: 'Awa',
  email: '',
  birthday: '',
  language: 'fr',
  ...partial,
});

describe('validateGuestDraft — le refus de SAISIE se connaît AVANT l’aller-retour', () => {
  test('le corps n’envoie que ce qui est rempli : aucune clé vide', () => {
    const validated = validateGuestDraft(draft(), TERMS);
    expect(validated).toEqual({ ok: true, body: { language: 'fr', nickname: 'Awa' } });
  });

  test('un pseudo EXIGÉ et absent désigne son champ, et rien ne part', () => {
    expect(validateGuestDraft(draft({ nickname: '   ' }), TERMS)).toEqual({ ok: false, field: 'nickname' });
  });

  test('un pseudo FACULTATIF et absent laisse la passerelle en générer un', () => {
    const validated = validateGuestDraft(draft({ nickname: '' }), { ...TERMS, nicknameRequired: false });
    expect(validated).toEqual({ ok: true, body: { language: 'fr' } });
  });

  test('un e-mail exigé et absent, puis mal formé, désignent leur champ', () => {
    const exige = { ...TERMS, emailRequired: true };
    expect(validateGuestDraft(draft({ email: '' }), exige)).toEqual({ ok: false, field: 'email' });
    expect(validateGuestDraft(draft({ email: 'awa@' }), exige)).toEqual({ ok: false, field: 'email' });
  });

  test('un e-mail FACULTATIF mais mal formé est refusé quand même — le serveur le refuserait', () => {
    expect(validateGuestDraft(draft({ email: 'pas une adresse' }), TERMS)).toEqual({ ok: false, field: 'email' });
  });

  /**
   * L'ÉCRAN PARLE EN JOURS (`<input type="date">`), LA PASSERELLE EN INSTANTS
   * (`z.iso.datetime()`). La conversion vit ICI, une fois — un champ de date qui
   * enverrait sa propre valeur au format serveur serait la jumelle qui diverge
   * au premier écran de plus.
   */
  test('une date de naissance part en INSTANT ISO, jamais en jour nu', () => {
    const validated = validateGuestDraft(draft({ birthday: '1994-03-17' }), { ...TERMS, birthdayRequired: true });
    expect(validated.ok && validated.body.birthday).toBe('1994-03-17T00:00:00.000Z');
  });

  test('une date exigée et absente, ou d’une autre forme, désigne son champ', () => {
    const exige = { ...TERMS, birthdayRequired: true };
    expect(validateGuestDraft(draft({ birthday: '' }), exige)).toEqual({ ok: false, field: 'birthday' });
    expect(validateGuestDraft(draft({ birthday: '17/03/1994' }), exige)).toEqual({ ok: false, field: 'birthday' });
  });

  test('une langue HORS de celles que le lien accepte désigne son champ', () => {
    const restreint = { ...TERMS, languages: ['fr', 'en'] };
    expect(validateGuestDraft(draft({ language: 'de' }), restreint)).toEqual({ ok: false, field: 'language' });
    expect(validateGuestDraft(draft({ language: 'en' }), restreint).ok).toBe(true);
  });

  test('une liste de langues VIDE signifie « toutes », jamais « aucune »', () => {
    expect(validateGuestDraft(draft({ language: 'wo' }), TERMS).ok).toBe(true);
  });
});

describe('joinLinkAsGuest — POST /api/v1/links/:key/members, corps d’invité', () => {
  const served = (extra: Record<string, unknown> = {}) => ({
    ok: true as const,
    data: {
      conversationId: CONVERSATION_ID,
      participantId: 'p-invitee',
      sessionToken: 'anon_abc',
      entry: { outcome: 'new', canViewHistory: true, rights: { canSendMessages: true } },
      ...extra,
    },
  });

  test('la porte CANONIQUE, jamais l’alias déprécié `/anonymous/join/:linkId`', async () => {
    const { transport, requests } = fakeTransport(served());
    const result = await joinLinkAsGuest(
      { source: 'gateway', transport },
      { link: 'mshy_équipe 7f3a', body: { language: 'fr', nickname: 'Awa' } },
    );
    expect(requests.map((r) => [r.method, r.path, r.body])).toEqual([
      ['POST', '/api/v1/links/mshy_%C3%A9quipe%207f3a/members', { language: 'fr', nickname: 'Awa' }],
    ]);
    expect(result).toEqual({
      ok: true,
      data: { conversationId: CONVERSATION_ID, participantId: 'p-invitee', sessionToken: 'anon_abc', readsHistory: true, mayWrite: true },
    });
  });

  test('les droits ABSENTS ne se promettent pas', async () => {
    const { transport } = fakeTransport(served({ entry: { outcome: 'new' } }));
    const result = await joinLinkAsGuest({ source: 'gateway', transport }, { link: 'mshy_x', body: { language: 'fr' } });
    expect(result.ok).toBe(true);
    expect(result.ok ? result.data.readsHistory : null).toBe(false);
    expect(result.ok ? result.data.mayWrite : null).toBe(false);
  });

  /**
   * La porte est en authentification OPTIONNELLE : un Bearer encore valide dans
   * le transport ferait entrer le COMPTE sous son nom pendant que l'écran croit
   * créer un invité. Une réponse SANS jeton de session n'est donc pas une
   * jonction d'invité — le port refuse plutôt que de rendre une session qui
   * n'existe pas. C'est la SYMÉTRIE exacte de `JOINED_AS_GUEST`.
   */
  test('servie sous un COMPTE (aucun jeton de session) ⇒ échec nommé, jamais une session inventée', async () => {
    const { transport } = fakeTransport({
      ok: true,
      data: { conversationId: CONVERSATION_ID, participantId: 'p9', entry: { outcome: 'new' } },
    });
    const result = await joinLinkAsGuest({ source: 'gateway', transport }, { link: 'mshy_x', body: { language: 'fr' } });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe('MEMBER_NOT_GUEST');
  });

  test('une charge illisible est un échec NOMMÉ', async () => {
    const { transport } = fakeTransport({ ok: true, data: { sessionToken: 'anon_abc' } });
    const result = await joinLinkAsGuest({ source: 'gateway', transport }, { link: 'mshy_x', body: { language: 'fr' } });
    expect(!result.ok && result.code).toBe('UNREADABLE_GUEST_JOIN');
  });

  test('un refus traverse tel quel, sa suggestion comprise', async () => {
    const { transport } = fakeTransport({
      ok: false,
      status: 409,
      error: 'pseudo pris',
      code: NICKNAME_TAKEN,
      suggestedNickname: 'awa2',
    });
    const result = await joinLinkAsGuest({ source: 'gateway', transport }, { link: 'mshy_x', body: { language: 'fr', nickname: 'awa' } });
    expect(!result.ok && result.suggestedNickname).toBe('awa2');
  });

  test('en fixtures : rejoindre en invité n’ouvre aucune requête', async () => {
    const { transport, requests } = fakeTransport({ ok: false, status: 0, error: 'jamais appelé' });
    const result = await joinLinkAsGuest(
      { source: 'fixtures', transport },
      { link: 'mshy_equipe-deploiement_7f3a', body: { language: 'fr', nickname: 'Awa' } },
    );
    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(0);
  });
});

/**
 * LES DEUX FAMILLES DE REFUS (#5561) — les confondre fait réessayer quelqu'un
 * dont le lien est mort, ou abandonner quelqu'un dont le pseudo était juste
 * pris. Ce témoin garde la FRONTIÈRE, pas les phrases.
 */
describe('guestRefusalOf — saisie corrigeable ICI, ou lien mort', () => {
  test('pseudo pris ⇒ SAISIE, sur son champ, avec le pseudo libre proposé', () => {
    expect(guestRefusalOf({ status: 409, code: NICKNAME_TAKEN, suggestedNickname: 'awa2' })).toEqual({
      on: 'input',
      field: 'nickname',
      suggestion: 'awa2',
    });
  });

  test('pseudo pris SANS suggestion ⇒ toujours une saisie, sans remède inventé', () => {
    expect(guestRefusalOf({ status: 409, code: NICKNAME_TAKEN })).toEqual({ on: 'input', field: 'nickname', suggestion: null });
  });

  /* Un 403, et pourtant une SAISIE : la langue est un champ de ce formulaire,
     et le visiteur peut en choisir une autre. Le ranger avec les refus du lien
     retirerait le formulaire au moment précis où il suffit d'y toucher. */
  test('langue refusée ⇒ SAISIE sur le champ langue, malgré son 403', () => {
    expect(guestRefusalOf({ status: 403, code: 'LANGUAGE_NOT_ALLOWED' })).toEqual({
      on: 'input',
      field: 'language',
      suggestion: null,
    });
  });

  test('400 qui NOMME son champ ⇒ ce champ', () => {
    expect(guestRefusalOf({ status: 400, field: 'email' })).toEqual({ on: 'input', field: 'email', suggestion: null });
  });

  test('400 qui ne nomme rien ⇒ saisie SANS champ : le message se pose au-dessus, jamais sous un champ deviné', () => {
    expect(guestRefusalOf({ status: 400 })).toEqual({ on: 'input', field: null, suggestion: null });
  });

  test('400 qui nomme un champ INCONNU de ce formulaire ⇒ saisie sans champ', () => {
    expect(guestRefusalOf({ status: 400, field: 'deviceFingerprint' })).toEqual({ on: 'input', field: null, suggestion: null });
  });

  const DU_LIEN: ReadonlyArray<readonly [number, string | undefined, string]> = [
    [410, 'LINK_EXPIRED', 'expired'],
    [410, 'CONVERSATION_CLOSED', 'closed'],
    [409, 'LINK_EXHAUSTED', 'full'],
    [403, 'ACCOUNT_REQUIRED', 'account-required'],
    [403, 'BANNED', 'banned'],
    [403, 'REGION_NOT_ALLOWED', 'region'],
    [404, undefined, 'not-found'],
    [429, undefined, 'rate-limited'],
    [0, undefined, 'offline'],
  ];

  for (const [status, code, refusal] of DU_LIEN) {
    test(`${status} ${code ?? '(sans code)'} ⇒ refus du LIEN (${refusal}) : le formulaire est retiré`, () => {
      expect(guestRefusalOf(code === undefined ? { status } : { status, code })).toEqual({ on: 'link', refusal });
    });
  }
});
