/**
 * `POST /links/:key/members` (porte CANONIQUE, S1 invité · S2 inscrit) et
 * `PATCH|DELETE /guest-sessions/me` — #4167.
 *
 * Les schémas partagés (`@meeshy/shared/types/api-schemas`) ne sont PAS
 * mockés ici, à la différence des suites `anonymous*.test.ts` : ce fichier
 * traverse la VRAIE sérialisation, pour que les codes de refus (`error`,
 * `code`) soient effectivement observables sur le fil — cf. la règle du
 * dépôt « un témoin qui n'exerce pas la sérialisation atteste un contrat
 * que personne ne respecte » (`services/gateway/CLAUDE.md`).
 *
 * L'identité INSCRITE n'a pas besoin d'un vrai JWT : `optionalAuth` est un
 * PARAMÈTRE de `registerLinkAdmissionRoutes`, jamais construit à l'intérieur
 * — un faux hook lit un en-tête de test et pose `authContext` directement,
 * exactement ce que `createUnifiedAuthMiddleware` ferait après vérification.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((s: string) => s),
    sanitizeUsername: jest.fn((s: string) => s),
  },
}));

import { registerLinkAdmissionRoutes } from '../../../routes/conversations/link-admission';

const LINK_ID = 'mshy_link_abc123';
const SHARE_LINK_DB_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const REGISTERED_USER_ID = '507f1f77bcf86cd799439044';
const SESSION_TOKEN = 'anon_test_session_token';

const mockShareLink = {
  id: SHARE_LINK_DB_ID, linkId: LINK_ID, identifier: 'test-link',
  conversationId: CONV_ID, isActive: true, expiresAt: null, maxUses: null,
  currentUses: 0, maxConcurrentUsers: null, currentConcurrentUsers: 0,
  maxUniqueSessions: null, currentUniqueSessions: 0,
  requireAccount: false, requireNickname: false, requireEmail: false, requireBirthday: false,
  allowedCountries: ['US'], // délibérément restrictif — #4167 critère 5 : jamais appliqué
  allowedLanguages: [], allowedIpRanges: [],
  allowAnonymousMessages: true, allowAnonymousFiles: false, allowAnonymousImages: false,
  allowViewHistory: false,
  conversation: { id: CONV_ID, title: 'Test Conv', type: 'group', isActive: true, closedAt: null },
};

/** Un faux `optionalAuth` : lit `x-test-identity`, pose `authContext` comme le ferait le vrai middleware. */
async function fakeOptionalAuth(request: FastifyRequest): Promise<void> {
  const identity = request.headers['x-test-identity'];
  (request as any).authContext =
    identity === 'registered'
      ? { type: 'user', isAuthenticated: true, isAnonymous: false, userId: REGISTERED_USER_ID, displayName: 'Ana', userLanguage: 'fr', hasFullAccess: true, canSendMessages: true }
      : undefined;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    conversationShareLink: {
      findFirst: jest.fn().mockResolvedValue(mockShareLink),
      findUnique: jest.fn().mockResolvedValue({ ...mockShareLink }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ displayName: 'Ana Registered', username: 'ana' }) },
    participant: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]), // `resolveConversationEntry` (identité inscrite)
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'participant-1', avatar: null, ...data })),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'participant-1', avatar: null, ...data })),
    },
    message: { create: jest.fn().mockResolvedValue({ id: 'msg-1' }) },
  } as never);
  registerLinkAdmissionRoutes(app as never, (app as any).prisma, fakeOptionalAuth, fakeOptionalAuth);
  await app.ready();
  return app;
}

const postMembers = (app: FastifyInstance, payload: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: `/links/${LINK_ID}/members`, payload, headers });

const asRegistered = { 'x-test-identity': 'registered' };

// ─── POST /links/:key/members — invité ───────────────────────────────────────

describe('POST /links/:key/members — invité (S1)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('404 quand le lien est introuvable', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    const res = await postMembers(app, { nickname: 'Ana' });
    expect(res.statusCode).toBe(404);
  });

  it('410 LINK_EXPIRED quand le lien est inactif', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, isActive: false });
    const res = await postMembers(app, { nickname: 'Ana' });
    expect(res.statusCode).toBe(410);
    expect(res.json().error).toBe('LINK_EXPIRED');
  });

  it('410 CONVERSATION_CLOSED quand la conversation est terminée', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      ...mockShareLink, conversation: { ...mockShareLink.conversation, isActive: false, closedAt: new Date('2026-01-01') },
    });
    const res = await postMembers(app, { nickname: 'Ana' });
    expect(res.statusCode).toBe(410);
    expect(res.json().error).toBe('CONVERSATION_CLOSED');
  });

  it('409 LINK_EXHAUSTED quand `maxUses` est atteint', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, maxUses: 1, currentUses: 1 });
    const res = await postMembers(app, { nickname: 'Ana' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('LINK_EXHAUSTED');
  });

  it('403 REGION_NOT_ALLOWED quand l\'IP n\'est dans aucune plage autorisée', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, allowedIpRanges: ['10.0.0.0/8'] });
    const res = await postMembers(app, { nickname: 'Ana' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('REGION_NOT_ALLOWED');
  });

  it('n\'est JAMAIS bloqué par `allowedCountries` — critère 5, décision 2026-08-29', async () => {
    // `mockShareLink.allowedCountries: ['US']` par défaut, sur toute la suite.
    const res = await postMembers(app, { nickname: 'Ana' });
    expect(res.statusCode).toBe(201);
  });

  it('403 ACCOUNT_REQUIRED quand le lien exige un compte', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, requireAccount: true });
    const res = await postMembers(app, { nickname: 'Ana' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('ACCOUNT_REQUIRED');
  });

  it('400 quand l\'email est requis et absent', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, requireEmail: true });
    const res = await postMembers(app, { nickname: 'Ana' });
    expect(res.statusCode).toBe(400);
  });

  it('201 — jointure réussie, jeton remis, droits complets', async () => {
    const res = await postMembers(app, { nickname: 'Ana', language: 'fr' });
    expect(res.statusCode).toBe(201);
    const { data } = res.json();
    expect(data.sessionToken).toEqual(expect.any(String));
    expect(data.conversationId).toBe(CONV_ID);
    expect(data.entry).toMatchObject({ outcome: 'new', canViewHistory: false });
    expect(data.entry.rights).toMatchObject({ canSendMessages: true, canSendFiles: false });
  });

  // Critère de fin #3 — preuve de l'ATOMICITÉ, pas seulement de sa PRÉSENCE :
  // l'incrément passe par un `updateMany` gardé par le MÊME `WHERE` que
  // l'admission vient de vérifier, revérifié au moment de l'ÉCRITURE.
  it('l\'incrément de `currentUses` passe par un `updateMany` guardé par le `WHERE` — critère 3', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, maxUses: 5, currentUses: 3 });
    (app as any).prisma.conversationShareLink.updateMany.mockClear();

    const res = await postMembers(app, { nickname: 'Ana' });

    expect(res.statusCode).toBe(201);
    expect((app as any).prisma.conversationShareLink.updateMany).toHaveBeenCalledWith({
      where: { id: SHARE_LINK_DB_ID, OR: [{ maxUses: null }, { currentUses: { lt: 5 } }] },
      data: { currentUses: { increment: 1 }, currentConcurrentUsers: { increment: 1 }, currentUniqueSessions: { increment: 1 } },
    });
  });

  // La course lecture-puis-écriture QUE le critère 3 ferme : le verdict
  // d'admission (lecture) a vu `currentUses: 3 < maxUses: 5` et a GRANTÉ —
  // mais entre cette lecture et l'écriture, une requête concurrente a pris
  // la dernière place. `updateMany` le revérifie à l'exécution et rend
  // `count: 0` : la jointure est refusée MALGRÉ un verdict d'admission
  // favorable. Sans l'atomicité, cette requête aurait créé un participant
  // au-delà de la capacité déclarée du lien.
  it('perd la course : `updateMany` rend `count: 0` malgré une admission accordée ⇒ 409 LINK_EXHAUSTED', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, maxUses: 5, currentUses: 3 });
    (app as any).prisma.conversationShareLink.updateMany.mockResolvedValueOnce({ count: 0 });
    (app as any).prisma.participant.create.mockClear();

    const res = await postMembers(app, { nickname: 'Ana' });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('LINK_EXHAUSTED');
    expect((app as any).prisma.participant.create).not.toHaveBeenCalled();
  });
});

// ─── POST /links/:key/members — inscrit ──────────────────────────────────────

describe('POST /links/:key/members — inscrit (S2)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  // Le bug de tête de #4167 : « un lien à usage unique est réutilisable
  // indéfiniment par un compte inscrit ». Posé ici, côté INSCRIT — la porte
  // anonyme le gardait déjà, ce témoin ne prouverait rien posé là (critère 6).
  it('409 LINK_EXHAUSTED — le bug de tête de #4167, prouvé côté INSCRIT', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, maxUses: 1, currentUses: 1 });
    const res = await postMembers(app, {}, asRegistered);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('LINK_EXHAUSTED');
  });

  it('410 LINK_EXPIRED quand le lien est inactif', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, isActive: false });
    const res = await postMembers(app, {}, asRegistered);
    expect(res.statusCode).toBe(410);
  });

  it('410 CONVERSATION_CLOSED quand la conversation est terminée', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      ...mockShareLink, conversation: { ...mockShareLink.conversation, isActive: false, closedAt: new Date('2026-01-01') },
    });
    const res = await postMembers(app, {}, asRegistered);
    expect(res.statusCode).toBe(410);
  });

  it('403 REGION_NOT_ALLOWED s\'applique À UN INSCRIT AUSSI — même police des deux côtés', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, allowedIpRanges: ['10.0.0.0/8'] });
    const res = await postMembers(app, {}, asRegistered);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('REGION_NOT_ALLOWED');
  });

  it('requireAccount n\'affecte PAS un inscrit — il a déjà un compte', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, requireAccount: true });
    const res = await postMembers(app, {}, asRegistered);
    expect(res.statusCode).toBe(201);
  });

  it('403 BANNED quand une ligne bannie existe pour cet utilisateur', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(null); // pas d'appel anonyme ici
    // `resolveConversationEntry` lit via `findMany`, pas `findFirst` — ajouté au double.
    (app as any).prisma.participant.findMany = jest.fn().mockResolvedValue([
      { id: 'p-banned', isActive: false, bannedAt: new Date('2026-01-01'), joinedAt: new Date('2026-01-01') },
    ]);
    const res = await postMembers(app, {}, asRegistered);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('BANNED');
    (app as any).prisma.participant.findMany = jest.fn().mockResolvedValue([]);
  });

  it('201 — première jointure (create), sans `rights` dans la réponse', async () => {
    (app as any).prisma.participant.findMany = jest.fn().mockResolvedValue([]);
    const res = await postMembers(app, {}, asRegistered);
    expect(res.statusCode).toBe(201);
    const { data } = res.json();
    expect(data.sessionToken).toBeUndefined();
    expect(data.entry.outcome).toBe('new');
    expect(data.entry.rights).toBeUndefined();
  });

  it('200 — retour d\'un ancien membre (rejoin), sur SA ligne, jamais dupliqué', async () => {
    (app as any).prisma.participant.findMany = jest.fn().mockResolvedValue([
      { id: 'p-left', isActive: false, bannedAt: null, joinedAt: new Date('2026-01-01') },
    ]);
    const res = await postMembers(app, {}, asRegistered);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.entry.outcome).toBe('rejoin');
    expect((app as any).prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p-left' } })
    );
    (app as any).prisma.participant.findMany = jest.fn().mockResolvedValue([]);
  });

  it('200 — déjà membre : aucune écriture, `currentUses` non consommé', async () => {
    (app as any).prisma.participant.findMany = jest.fn().mockResolvedValue([
      { id: 'p-active', isActive: true, bannedAt: null, joinedAt: new Date('2026-01-01') },
    ]);
    (app as any).prisma.participant.findUnique = jest.fn().mockResolvedValue({
      id: 'p-active', permissions: { canSendMessages: true, canViewHistory: true }, anonymousSession: null,
    });
    (app as any).prisma.conversationShareLink.updateMany.mockClear();

    const res = await postMembers(app, {}, asRegistered);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.entry.outcome).toBe('already-member');
    expect((app as any).prisma.conversationShareLink.updateMany).not.toHaveBeenCalled();
    (app as any).prisma.participant.findMany = jest.fn().mockResolvedValue([]);
  });
});

// ─── PATCH /guest-sessions/me ─────────────────────────────────────────────────

describe('PATCH /guest-sessions/me', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('400 quand l\'en-tête X-Session-Token est absent — le jeton ne voyage plus dans le corps', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/guest-sessions/me' });
    expect(res.statusCode).toBe(400);
  });

  it('401 quand le jeton ne correspond à aucun participant actif', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'PATCH', url: '/guest-sessions/me', headers: { 'x-session-token': SESSION_TOKEN } });
    expect(res.statusCode).toBe(401);
  });

  it('410 CONVERSATION_CLOSED — la garde qui manquait sur `POST /anonymous/refresh` (critère 4)', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce({
      id: 'p1', isActive: true, anonymousSession: { shareLinkId: SHARE_LINK_DB_ID, profile: {}, session: {} },
    });
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({
      ...mockShareLink, conversation: { ...mockShareLink.conversation, isActive: false, closedAt: new Date('2026-01-01') },
    });
    const res = await app.inject({ method: 'PATCH', url: '/guest-sessions/me', headers: { 'x-session-token': SESSION_TOKEN } });
    expect(res.statusCode).toBe(410);
    expect(res.json().error).toBe('CONVERSATION_CLOSED');
  });

  it('200 — rafraîchissement réussi', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce({
      id: 'p1', isActive: true, displayName: 'ano_ana', language: 'fr', avatar: null,
      permissions: { canSendMessages: true, canSendFiles: false, canSendImages: false },
      anonymousSession: { shareLinkId: SHARE_LINK_DB_ID, profile: { firstName: 'A', lastName: 'B', username: 'ano_ana' }, session: {} },
    });
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({ ...mockShareLink });
    const res = await app.inject({ method: 'PATCH', url: '/guest-sessions/me', headers: { 'x-session-token': SESSION_TOKEN } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.participant.id).toBe('p1');
  });
});

// ─── DELETE /guest-sessions/me — idempotence (critère 4 + critère 6) ─────────

describe('DELETE /guest-sessions/me', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('400 quand l\'en-tête X-Session-Token est absent', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/guest-sessions/me' });
    expect(res.statusCode).toBe(400);
  });

  it('404 quand le jeton ne correspond à aucun participant', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/guest-sessions/me', headers: { 'x-session-token': SESSION_TOKEN } });
    expect(res.statusCode).toBe(404);
  });

  it('appelée deux fois : `currentConcurrentUsers` ne décrémente qu\'UNE fois — jamais négatif', async () => {
    const activeParticipant = {
      id: 'p1', isActive: true,
      anonymousSession: { shareLinkId: SHARE_LINK_DB_ID, profile: {}, session: {} },
    };
    (app as any).prisma.participant.findFirst
      .mockResolvedValueOnce(activeParticipant) // 1er appel : encore actif
      .mockResolvedValueOnce({ ...activeParticipant, isActive: false }); // 2e appel : déjà parti
    (app as any).prisma.conversationShareLink.update.mockClear();

    const first = await app.inject({ method: 'DELETE', url: '/guest-sessions/me', headers: { 'x-session-token': SESSION_TOKEN } });
    const second = await app.inject({ method: 'DELETE', url: '/guest-sessions/me', headers: { 'x-session-token': SESSION_TOKEN } });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect((app as any).prisma.conversationShareLink.update).toHaveBeenCalledTimes(1);
    expect((app as any).prisma.conversationShareLink.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentConcurrentUsers: { decrement: 1 } } })
    );
  });
});
