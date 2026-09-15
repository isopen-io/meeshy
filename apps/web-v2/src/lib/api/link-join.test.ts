import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { decodeLinkInvitation, joinLinkAsMember, linkRefusalOf, loadLinkInvitation } from './link-join';

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

describe('decodeLinkInvitation — une invitation, et rien de la conversation', () => {
  test('rend EXACTEMENT ce que l’écran affiche : qui invite, le titre, le type, le droit de lecture', () => {
    expect(decodeLinkInvitation(servedPreview())).toEqual({
      title: 'Équipe déploiement',
      kind: 'group',
      inviter: { name: 'Awa D.', avatar: '2026/09/awa/photo.png' },
      readsHistory: true,
    });
  });

  test('une charge qui porte messages, membres et invités : le décodeur les JETTE', () => {
    const decoded = decodeLinkInvitation(poisonedPreview());
    expect(decoded).not.toBeNull();
    expect(Object.keys(decoded ?? {}).sort()).toEqual(['inviter', 'kind', 'readsHistory', 'title']);
    const carried = JSON.stringify(decoded);
    for (const secret of [SECRET_MESSAGE, SECRET_MEMBER, SECRET_GUEST, CONVERSATION_ID, 'Nos échanges internes', 'wo', 'bruno']) {
      expect({ secret, carried: carried.includes(secret) }).toEqual({ secret, carried: false });
    }
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
