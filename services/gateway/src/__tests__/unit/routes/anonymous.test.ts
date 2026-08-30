/**
 * Unit tests for anonymous routes (anonymous.ts)
 * Uses shared Fastify instances per describe block to avoid per-test OOM.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((s) => s),
    sanitizeUsername: jest.fn((s) => s),
  },
}));

jest.mock('../../../utils/session-token', () => ({
  hashSessionToken: jest.fn((token) => 'hashed-' + token),
  // #4167 — `routes/anonymous.ts` déléguait sa PROPRE génération avant ce lot ;
  // `performLinkJoin` (`routes/conversations/link-admission.ts`) appelle
  // désormais le SEUL exemplaire du dépôt (`utils/session-token.ts`), que ce
  // double doit donc fournir lui aussi.
  generateSessionToken: jest.fn(() => 'anon_test_session_token'),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: {} },
  anonymousParticipantSchema: { type: 'object', additionalProperties: true },
  conversationLinkSchema: { type: 'object', additionalProperties: true },
  conversationMinimalSchema: { type: 'object', additionalProperties: true },
  userMinimalSchema: { type: 'object', additionalProperties: true },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { anonymousRoutes } from '../../../routes/anonymous';

// ─── Constants ────────────────────────────────────────────────────────────────

const LINK_ID = 'mshy_link_abc123';
const SHARE_LINK_DB_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const PART_ID = '507f1f77bcf86cd799439033';

const mockShareLink = {
  id: SHARE_LINK_DB_ID, linkId: LINK_ID, identifier: 'test-link',
  conversationId: CONV_ID, isActive: true, expiresAt: null, maxUses: null,
  currentUses: 0, maxConcurrentUsers: null, currentConcurrentUsers: 0,
  currentUniqueSessions: 0, requireAccount: false, requireNickname: false,
  requireEmail: false, requireBirthday: false, allowedCountries: [],
  allowedLanguages: [], allowedIpRanges: [], allowAnonymousMessages: true,
  allowAnonymousFiles: false, allowAnonymousImages: false, allowViewHistory: false,
  name: 'Test Link', description: null,
  conversation: { id: CONV_ID, title: 'Test Conv', type: 'group' },
  creator: { id: 'user-1', username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice Smith', avatar: null },
};

const mockParticipant = {
  id: PART_ID, conversationId: CONV_ID, type: 'anonymous', displayName: 'bob_sm123',
  language: 'fr', sessionTokenHash: 'hashed-session', shareLinkId: SHARE_LINK_DB_ID,
  role: 'member', isActive: true, avatar: null,
  permissions: { canSendMessages: true, canSendFiles: false, canSendImages: false },
  anonymousSession: {
    shareLinkId: SHARE_LINK_DB_ID,
    profile: { firstName: 'Bob', lastName: 'Smith', username: 'bob_sm123', email: null, birthday: null },
    session: { sessionTokenHash: 'hashed-session' },
  },
};

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    conversationShareLink: {
      findFirst: jest.fn().mockResolvedValue(mockShareLink),
      findUnique: jest.fn().mockResolvedValue({ ...mockShareLink }),
      update: jest.fn().mockResolvedValue({}),
      // #4167 — l'incrément de `currentUses` est désormais ATOMIQUE
      // (`updateMany` guardé par un `WHERE`, critère de fin #3) : `count: 1`
      // dit « la capacité a bien été prise ».
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
    participant: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(mockParticipant),
      update: jest.fn().mockResolvedValue(mockParticipant),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    message: {
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'sys-1', ...data })),
    },
  });
  await anonymousRoutes(app);
  await app.ready();
  return app;
}

// ─── POST /anonymous/join/:linkId ─────────────────────────────────────────────

describe('POST /anonymous/join/:linkId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when share link not found', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(404);
  });

  it('returns 410 when link is inactive', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, isActive: false });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(410);
  });

  it('returns 410 when link is expired', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, expiresAt: new Date(0) });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(410);
  });

  // #4167 — `maxUses`/`maxConcurrentUsers` épuisés rendaient 410/429 chacun de
  // son côté ; `admitLinkEntry` (loi d'admission UNIQUE, appelée pour les deux
  // identités) les fusionne en `409 LINK_EXHAUSTED` — même famille de refus,
  // même code, sur les deux portes. Ce n'est pas une régression : c'est
  // exactement l'unification que #4167 demande (« deux portes, deux polices »
  // devient une police).
  // `.error`/`code` ne s'assertent pas ici : ce fichier mocke
  // `errorResponseSchema` en `{ properties: {} }` (schéma allégé pour le test
  // de TRANSPORT), donc le sérialiseur les efface avant qu'un test ne
  // puisse les lire — cf. `linkAdmission.test.ts` pour un témoin qui
  // traverse la vraie enveloppe (`code`/`error` asserted there).
  it('returns 409 LINK_EXHAUSTED when max uses exceeded', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, maxUses: 5, currentUses: 5 });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(409);
  });

  it('returns 409 LINK_EXHAUSTED when max concurrent users reached', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, maxConcurrentUsers: 10, currentConcurrentUsers: 10 });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(409);
  });

  it('returns 403 when language not allowed', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, allowedLanguages: ['en', 'de'] });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when link requires account', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, requireAccount: true });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(403);
  });

  it('annonce l’arrivée avec le pseudo, le nom donné et les règles du lien dans le metadata', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/anonymous/join/' + LINK_ID,
      payload: { firstName: 'Bob', lastName: 'Smith', username: 'bob', language: 'fr' },
    });
    expect(res.statusCode).toBe(201);

    const createCalls = (app as any).prisma.message.create.mock.calls;
    const systemCall = createCalls.find((c: any) => c[0]?.data?.messageType === 'system');
    expect(systemCall).toBeDefined();
    const metadata = systemCall[0].data.metadata;
    expect(metadata).toMatchObject({
      kind: 'member-joined',
      isAnonymous: true,
      viaShareLink: true,
      username: 'ano_bob',
      givenName: 'Bob Smith',
      linkRules: { canSendMessages: true, canSendFiles: false, canSendImages: false },
    });
  });

  it('returns 400 when email required but missing', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, requireEmail: true });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(400);
  });

  // Rendait 409 : un anonyme se voyait refuser l'entrée parce qu'un INSCRIT
  // portait ce nom, quelque part sur le site, dans une conversation qu'il ne
  // verra jamais. La comparaison a disparu — c'est le GLYPHE FANTÔME, pas le
  // nom, qui dit lequel des deux a un compte.
  it('admet le joignant même quand un compte porte ce nom — le fantôme les distingue', async () => {
    (app as any).prisma.user.findFirst.mockResolvedValueOnce({ id: 'other', username: 'bob_sm123' });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', username: 'bob_sm123', language: 'fr' } });
    expect(res.statusCode).toBe(201);
    const written = (app as any).prisma.participant.create.mock.calls.at(-1)[0].data;
    expect(written.displayName).toBe('ano_bob_sm123');
  });

  it('returns 201 on successful join', async () => {
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
  });

  // #4167 + #4274 — un alias qui ne dit rien au client n'existe pas pour lui.
  // La garde de source (`deprecated-alias-headers-guard.test.ts`) prouve que
  // `depreciee(...)` est APPELÉ ; elle ne prouve pas qu'il est SERVI. Ce
  // témoin traverse la VRAIE réponse HTTP — y compris sur un refus (410), pas
  // seulement le chemin de succès, puisque `onRequest` court avant toute
  // décision du handler.
  it('porte les en-têtes de dépréciation (Deprecation, Link) — succès ET refus', async () => {
    const ok = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(ok.headers['deprecation']).toMatch(/^@\d+$/);
    expect(ok.headers['link']).toBe(`</api/v1/links/${LINK_ID}/members>; rel="successor-version"`);

    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    const notFound = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.headers['deprecation']).toMatch(/^@\d+$/);
  });

  // La porte compare le `body.language` du joignant (canonicalisé au boundary
  // Zod via `normalizeLanguageForDedup`) aux `allowedLanguages` du lien. Ces
  // dernières viennent de la BASE, configurées par le créateur du lien, et
  // peuvent porter des tags de région, des codes 3-lettres ou une casse mixte.
  // Un `.toLowerCase()` brut sur le côté lien les fait diverger de la forme
  // canonique du joignant, et REFUSE un accès qui doit être accordé — c'est une
  // décision d'accès, pas un défaut d'affichage.
  it('admet un joignant `fr` quand le lien autorise la forme région-taguée `fr-FR`', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, allowedLanguages: ['fr-FR', 'de'] });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(201);
  });

  it('admet un joignant `fr` quand le lien autorise le code 3-lettres `fra`', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, allowedLanguages: ['fra'] });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(201);
  });

  it('admet un joignant région-tagué `fr-FR` quand le lien autorise `fr` (les deux côtés canonicalisés)', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, allowedLanguages: ['fr'] });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr-FR' } });
    expect(res.statusCode).toBe(201);
  });

  // CONTRE-ÉPREUVE : la canonicalisation des deux côtés ne doit JAMAIS ouvrir la
  // porte à une langue réellement absente du lien.
  it('refuse toujours un joignant `fr` quand le lien n’autorise que `en`/`de`, même après canonicalisation', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, allowedLanguages: ['en-US', 'de'] });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(403);
  });

  // Les neuf refus ci-dessus portent tous sur le LIEN. Aucun ne portait sur ce
  // vers quoi il POINTE — et une clôture n'éteint aucun lien de partage. Pour
  // un anonyme le dégât est terminal : ce participant EST son identité, il n'a
  // aucun autre chemin vers la conversation.
  it('returns 410 when the conversation itself is closed, even though every link property is valid', async () => {
    (app as any).prisma.participant.create.mockClear();
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      ...mockShareLink,
      conversation: { ...mockShareLink.conversation, isActive: false, closedAt: new Date('2026-03-01') },
    });

    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });

    expect(res.statusCode).toBe(410);
    expect((app as any).prisma.participant.create).not.toHaveBeenCalled();
  });

  it('refuses on `isActive: false` alone — rows closed by the old `leave.ts` carry no `closedAt`', async () => {
    (app as any).prisma.participant.create.mockClear();
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      ...mockShareLink,
      conversation: { ...mockShareLink.conversation, isActive: false, closedAt: null },
    });

    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });

    expect(res.statusCode).toBe(410);
    expect((app as any).prisma.participant.create).not.toHaveBeenCalled();
  });

  it('CONTRE-ÉPREUVE — a live conversation still admits the anonymous joiner', async () => {
    (app as any).prisma.participant.create.mockClear();
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      ...mockShareLink,
      conversation: { ...mockShareLink.conversation, isActive: true, closedAt: null },
    });

    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });

    expect(res.statusCode).toBe(201);
    expect((app as any).prisma.participant.create).toHaveBeenCalledTimes(1);
  });

  // Les trois témoins ci-dessus portent sur la RÉPONSE qu'on souffle au double,
  // jamais sur la REQUÊTE : le double rend le `conversation` qu'on lui dicte,
  // `select` ou pas. Ils ne peuvent donc pas voir une régression du `select`.
  //
  // Le typage en couvre la moitié : retirer les DEUX colonnes fait échouer la
  // compilation, `isConversationClosed` n'acceptant pas une ligne sans aucune
  // propriété commune avec `ConversationTerminalStateRow` (TS2559 — vérifié).
  //
  // L'autre moitié passe. Retirer UNE seule colonne compile, et c'est la
  // régression qui coûte : sans `isActive`, les conversations fermées par
  // l'ancien `leave.ts` — `isActive: false`, `closedAt` absent, et rien ne les
  // rétro-remplit — redeviennent « ouvertes » pour cette porte. Mutation
  // mesurée : les 24 autres témoins de ce fichier restent VERTS, seul celui-ci
  // tombe.
  it('DEMANDE les deux colonnes au lien — seul témoin qui tombe si le `select` en perd une', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockClear();

    await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });

    const select = (app as any).prisma.conversationShareLink.findFirst.mock.calls[0][0]
      ?.include?.conversation?.select;
    expect(select).toMatchObject({ isActive: true, closedAt: true });
  });
});

// ─── POST /anonymous/refresh ──────────────────────────────────────────────────

describe('POST /anonymous/refresh', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValue(mockParticipant);
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when session not found', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: '/anonymous/refresh', payload: { sessionToken: 'invalid-token' } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 410 when share link not found', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce({ ...mockParticipant, anonymousSession: { shareLinkId: null } });
    const res = await app.inject({ method: 'POST', url: '/anonymous/refresh', payload: { sessionToken: 'some-token' } });
    expect(res.statusCode).toBe(410);
  });

  it('returns 410 when link is deactivated', async () => {
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({ ...mockShareLink, isActive: false, conversation: mockShareLink.conversation });
    const res = await app.inject({ method: 'POST', url: '/anonymous/refresh', payload: { sessionToken: 'some-token' } });
    expect(res.statusCode).toBe(410);
  });

  it('returns 200 on successful refresh', async () => {
    const res = await app.inject({ method: 'POST', url: '/anonymous/refresh', payload: { sessionToken: 'some-token' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('porte les en-têtes de dépréciation — alias de PATCH /guest-sessions/me (#4167/#4274)', async () => {
    const res = await app.inject({ method: 'POST', url: '/anonymous/refresh', payload: { sessionToken: 'some-token' } });
    expect(res.headers['deprecation']).toMatch(/^@\d+$/);
    expect(res.headers['link']).toBe('</api/v1/guest-sessions/me>; rel="successor-version"');
  });
});

// ─── POST /anonymous/leave ────────────────────────────────────────────────────

describe('POST /anonymous/leave', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValue(mockParticipant);
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when participant not found', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: '/anonymous/leave', payload: { sessionToken: 'invalid-token' } });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 on successful leave', async () => {
    const res = await app.inject({ method: 'POST', url: '/anonymous/leave', payload: { sessionToken: 'some-token' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('porte les en-têtes de dépréciation — alias de DELETE /guest-sessions/me (#4167/#4274)', async () => {
    const res = await app.inject({ method: 'POST', url: '/anonymous/leave', payload: { sessionToken: 'some-token' } });
    expect(res.headers['deprecation']).toMatch(/^@\d+$/);
    expect(res.headers['link']).toBe('</api/v1/guest-sessions/me>; rel="successor-version"');
  });
});

// ─── GET /anonymous/link/:identifier ─────────────────────────────────────────

describe('GET /anonymous/link/:identifier', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    (app as any).prisma.participant.count.mockResolvedValue(2);
    (app as any).prisma.participant.findMany.mockResolvedValue([
      { type: 'user', language: 'fr', user: { systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null } },
      { type: 'anonymous', language: 'en', user: null },
    ]);
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when mshy_ link not found', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/anonymous/link/mshy_nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when link by ObjectID not found', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/anonymous/link/507f1f77bcf86cd799439011' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 410 when link is inactive', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({
      ...mockShareLink, isActive: false,
      conversation: { id: CONV_ID, title: 'T', description: null, type: 'group', createdAt: new Date() },
    });
    const res = await app.inject({ method: 'GET', url: '/anonymous/link/' + LINK_ID });
    expect(res.statusCode).toBe(410);
  });

  it('returns 200 with link info on success', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({
      ...mockShareLink,
      conversation: { id: CONV_ID, title: 'Conv', description: null, type: 'group', createdAt: new Date() },
    });
    const res = await app.inject({ method: 'GET', url: '/anonymous/link/' + LINK_ID });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('dedupes BCP-47/region-tagged languages into a single canonical spokenLanguages entry', async () => {
    // A user carrying a region-tagged pref ('en-US') and another with the bare
    // canonical code ('en') describe the SAME spoken language. A raw .toLowerCase()
    // would leave 'en-us' ≠ 'en' → the public stat reports 2 languages and leaks a
    // malformed 'en-us' code.
    (app as any).prisma.participant.findMany.mockResolvedValueOnce([
      { type: 'user', language: null, user: { systemLanguage: 'en-US', regionalLanguage: 'fr_FR', customDestinationLanguage: null } },
      { type: 'user', language: null, user: { systemLanguage: 'EN', regionalLanguage: null, customDestinationLanguage: null } },
      { type: 'anonymous', language: 'fr', user: null },
    ]);
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({
      ...mockShareLink,
      conversation: { id: CONV_ID, title: 'Conv', description: null, type: 'group', createdAt: new Date() },
    });
    const res = await app.inject({ method: 'GET', url: '/anonymous/link/' + LINK_ID });
    expect(res.statusCode).toBe(200);
    const stats = res.json().data.stats;
    expect(stats.spokenLanguages).toEqual(['en', 'fr']);
    expect(stats.languageCount).toBe(2);
  });
});

// ─── GET /anonymous/link/:identifier — select racine explicite (#4166 c1) ────
//
// Témoin sur l'APPEL PRISMA : la ligne `ConversationShareLink` était chargée
// via `include` sans `select` à la racine (toute colonne future du modèle
// part automatiquement). Capture l'argument des deux branches
// (`mshy_*` et ObjectId) et vérifie un `select` explicite, jamais `include`.

describe('GET /anonymous/link/:identifier — select racine explicite', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('branche mshy_* : findUnique porte select (jamais include), avec conversation et creator imbriqués', async () => {
    const findUnique = (app as any).prisma.conversationShareLink.findUnique;
    findUnique.mockClear();
    findUnique.mockResolvedValueOnce({ ...mockShareLink });

    await app.inject({ method: 'GET', url: '/anonymous/link/' + LINK_ID });

    expect(findUnique).toHaveBeenCalledTimes(1);
    const call = findUnique.mock.calls[0][0];
    expect(call).not.toHaveProperty('include');
    expect(call.select).toMatchObject({
      id: true,
      linkId: true,
      name: true,
      requireAccount: true,
      allowedLanguages: true,
    });
    expect(call.select.conversation).toBeDefined();
    expect(call.select.creator).toBeDefined();
  });

  it('branche ObjectId : findUnique porte le même select — jamais include', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    const findUnique = (app as any).prisma.conversationShareLink.findUnique;
    findUnique.mockClear();
    findUnique.mockResolvedValueOnce({ ...mockShareLink });

    await app.inject({ method: 'GET', url: '/anonymous/link/507f1f77bcf86cd799439011' });

    expect(findUnique).toHaveBeenCalledTimes(1);
    const call = findUnique.mock.calls[0][0];
    expect(call).not.toHaveProperty('include');
    expect(call.select).toBeDefined();
  });
});
