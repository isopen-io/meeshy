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
import { matchesMongoWhere } from '../../helpers/mongo-where';
import {
  subscribeConversationLanguageChanges,
  type ConversationLanguageChange,
} from '../../../services/message-translation/conversationLanguageChanges';

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
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      where: {
        id: SHARE_LINK_DB_ID,
        isActive: true,
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { isSet: false } }, { expiresAt: { gt: expect.any(Date) } }] },
          { OR: [{ maxUses: null }, { currentUses: { lt: 5 } }] },
        ],
      },
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

  // #10470 (R2) — une fermeture (ou une échéance) qui tombe ENTRE la lecture
  // d'admission et la réservation : la réservation revérifie l'état du lien
  // dans son `where`, sinon l'invité entre APRÈS la fermeture et sa ligne
  // échappe à la révocation déjà partie.
  it.each([
    ['sans échéance (champ absent)', (link: Record<string, unknown>) => { const { expiresAt: _drop, ...rest } = link; return rest; }],
    ['sans échéance (null)', (link: Record<string, unknown>) => ({ ...link, expiresAt: null })],
    ['à échéance future', (link: Record<string, unknown>) => ({ ...link, expiresAt: new Date('2099-01-01T00:00:00Z') })],
  ])('un lien ouvert %s est toujours réservé', async (_label, shape) => {
    const prisma = (app as any).prisma;
    prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink });
    const linkNow = shape({ ...mockShareLink });
    prisma.conversationShareLink.updateMany.mockImplementationOnce(async ({ where }: any) => ({
      count: matchesMongoWhere(linkNow as never, where) ? 1 : 0,
    }));

    const res = await postMembers(app, { nickname: 'Ana' });

    expect(res.statusCode).toBe(201);
  });

  it.each([
    ['fermé', { isActive: false }],
    ['échu', { expiresAt: new Date('2026-01-01T00:00:00Z') }],
  ])('un lien %s entre la lecture d\'admission et la réservation ⇒ refus, aucun invité créé', async (_label, closure) => {
    const prisma = (app as any).prisma;
    prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink });
    const closedNow = { ...mockShareLink, ...closure };
    prisma.conversationShareLink.updateMany.mockImplementationOnce(async ({ where }: any) => ({
      count: matchesMongoWhere(closedNow as never, where) ? 1 : 0,
    }));
    prisma.participant.create.mockClear();

    const res = await postMembers(app, { nickname: 'Ana' });

    expect([409, 410]).toContain(res.statusCode);
    expect(prisma.participant.create).not.toHaveBeenCalled();
  });
});

// ─── POST /links/:key/members — Bearer présenté et refusé (#6741) ────────────
//
// `fakeOptionalAuth` ne lit que `x-test-identity` : un `Authorization: Bearer`
// sans cet en-tête reproduit exactement ce que rend le VRAI middleware quand
// `jwt.verify` échoue et que `requireAuth: false` — `authContext: undefined`,
// indiscernable d'une requête sans aucune créance (`middleware/auth.ts:772-780`).

describe('POST /links/:key/members — Bearer présenté et refusé (#6741)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('401 TOKEN_INVALID quand un Bearer est présenté sans authentifier, et ne crée aucun participant', async () => {
    (app as any).prisma.participant.create.mockClear();

    const res = await postMembers(app, { nickname: 'Ana' }, { authorization: 'Bearer expired.or.invalid' });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('TOKEN_INVALID');
    expect((app as any).prisma.participant.create).not.toHaveBeenCalled();
  });

  it('entre bien en invité quand AUCUN Bearer n\'est présenté — non-régression', async () => {
    const res = await postMembers(app, { nickname: 'Ana' });
    expect(res.statusCode).toBe(201);
  });

  it('entre bien en inscrit quand le Bearer authentifie réellement — non-régression', async () => {
    const res = await postMembers(app, {}, { ...asRegistered, authorization: 'Bearer whatever-the-real-middleware-verified' });
    expect(res.statusCode).toBe(201);
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

/**
 * #6091 — `canSendVideos`/`canSendAudios` suivent le LIEN, jamais un `false`
 * inventé par le site qui recopie.
 *
 * `ConversationShareLink` ne porte aucun drapeau vidéo ni audio : la loi vit
 * une couche plus bas, dans `classifyAnonymousAttachment`
 * (`services/attachments/ContentSignature.ts`) — une vidéo EST un fichier
 * (`allowAnonymousFiles`), et la voix suit le droit d'écrire
 * (`allowAnonymousMessages`), jamais `allowAnonymousFiles`/`allowAnonymousImages`.
 * Ces témoins rendent l'instantané cohérent avec cette loi, côté invité ET
 * côté utilisateur nommé.
 */
describe('POST /links/:key/members — vidéo et audio suivent le lien, jamais `false` en dur (#6091)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('invité anonyme, lien qui autorise les fichiers ⇒ `canSendVideos: true` — une vidéo EST un fichier', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      ...mockShareLink, allowAnonymousFiles: true, allowAnonymousMessages: true,
    });
    const res = await postMembers(app, { nickname: 'Ana' });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.entry.rights).toMatchObject({ canSendVideos: true, canSendAudios: true });
  });

  it('invité anonyme, lien qui refuse les fichiers ⇒ `canSendVideos: false` — l\'hôte a dit non, pas « jamais demandé »', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      ...mockShareLink, allowAnonymousFiles: false, allowAnonymousMessages: false,
    });
    const res = await postMembers(app, { nickname: 'Ana' });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.entry.rights).toMatchObject({ canSendVideos: false, canSendAudios: false });
  });

  it('invité anonyme : `canSendAudios` suit `allowAnonymousMessages`, indépendamment de `allowAnonymousFiles`', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      ...mockShareLink, allowAnonymousFiles: false, allowAnonymousMessages: true,
    });
    const res = await postMembers(app, { nickname: 'Ana' });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.entry.rights).toMatchObject({ canSendVideos: false, canSendAudios: true });
  });

  it('utilisateur nommé entrant par lien : naît avec vidéo et audio ouverts — membre à part entière (NEW_MEMBER_PERMISSIONS)', async () => {
    (app as any).prisma.participant.findMany = jest.fn().mockResolvedValue([]);
    (app as any).prisma.participant.create.mockClear();

    const res = await postMembers(app, {}, asRegistered);

    expect(res.statusCode).toBe(201);
    const created = (app as any).prisma.participant.create.mock.calls.at(-1)?.[0];
    expect(created.data.permissions.canSendVideos).toBe(true);
    expect(created.data.permissions.canSendAudios).toBe(true);
    // Critère « ce que ça ne fait PAS » — les deux droits déjà ouverts ne bougent pas.
    expect(created.data.permissions.canSendFiles).toBe(true);
    expect(created.data.permissions.canSendImages).toBe(true);
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

  /**
   * LE TÉMOIN SE POSE LÀ OÙ LA SURCHARGE ET L'INSTANTANÉ DIVERGENT — un témoin
   * qui ne mesure que le cas nominal ne peut pas tomber (leçon 261 : un témoin
   * de RANG s'écrit sur un rang AUTRE que le premier).
   *
   * `participantConversationPayload` lisait `participant.permissions.*` BRUT,
   * quand la loi unique du dépôt (`resolveParticipantRights` /
   * `resolveEntryRights`) classe `anonymousSession.rights` AU-DESSUS. La charge
   * annonçait donc « vous pouvez écrire » à quelqu'un à qui `middleware/auth.ts`
   * refuse chaque envoi depuis que l'hôte a employé `PATCH …/rights`.
   */
  it('sert les droits RÉSOLUS, jamais l’instantané que la surcharge de l’hôte contredit', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce({
      id: 'p1', isActive: true, displayName: 'ano_ana', language: 'fr', avatar: null,
      // L'instantané figé au join : le lien était ouvert en écriture.
      permissions: { canSendMessages: true, canSendFiles: true, canSendImages: true, canViewHistory: true },
      anonymousSession: {
        shareLinkId: SHARE_LINK_DB_ID,
        profile: { firstName: 'A', lastName: 'B', username: 'ano_ana' },
        session: {},
        // Ce que l'hôte a retiré depuis, par `PATCH …/participants/:id/rights`.
        rights: { canSendMessages: false, canViewHistory: false },
      },
    });
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({
      ...mockShareLink, allowViewHistory: true,
    });

    const res = await app.inject({ method: 'PATCH', url: '/guest-sessions/me', headers: { 'x-session-token': SESSION_TOKEN } });

    expect(res.statusCode).toBe(200);
    const { participant, conversation } = res.json().data;
    expect(participant.canSendMessages).toBe(false);
    // Ce que la surcharge ne NOMME pas suit l'instantané — `??` distingue une
    // abstention d'un refus.
    expect(participant.canSendFiles).toBe(true);
    expect(participant.canSendImages).toBe(true);
    // Le droit du PARTICIPANT et la colonne du LIEN divergent, et les deux sont
    // servis : c'est le premier que `historyFloorFor` applique à la lecture.
    expect(participant.canViewHistory).toBe(false);
    expect(conversation.allowViewHistory).toBe(true);
  });

  /**
   * SANS AUCUNE SURCHARGE, LE DROIT D'HISTORIQUE EST CELUI QUI EST FIGÉ — pas la
   * valeur COURANTE du lien. Une re-jonction (cookie perdu) et une modification
   * du lien entre-temps suffisent à les séparer, et c'est la valeur figée que la
   * lecture des messages respecte.
   */
  it('sert le droit d’historique FIGÉ du participant, pas la valeur courante du lien', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce({
      id: 'p1', isActive: true, displayName: 'ano_ana', language: 'fr', avatar: null,
      permissions: { canSendMessages: true, canSendFiles: false, canSendImages: false, canViewHistory: false },
      anonymousSession: { shareLinkId: SHARE_LINK_DB_ID, profile: { username: 'ano_ana' }, session: {} },
    });
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({
      ...mockShareLink, allowViewHistory: true,
    });

    const res = await app.inject({ method: 'PATCH', url: '/guest-sessions/me', headers: { 'x-session-token': SESSION_TOKEN } });

    expect(res.json().data.participant.canViewHistory).toBe(false);
    expect(res.json().data.conversation.allowViewHistory).toBe(true);
  });
});

// ─── PATCH /guest-sessions/me — participation morte (#10457) ──────────────────

/**
 * #10457 — `refreshGuestSession` juge la participation par la règle de
 * `PARTICIPATION_VIVANTE` (`participationEstVivante`) : désactivée OU bannie ⇒
 * 410 `GUEST_ACCESS_REVOKED`, sans servir la conversation ni relancer la
 * présence. Le lien expiré reste la cause première (`guestAccessEnd`).
 */
describe('PATCH /guest-sessions/me — participation morte (#10457)', () => {
  const patch = (app: FastifyInstance) =>
    app.inject({ method: 'PATCH', url: '/guest-sessions/me', headers: { 'x-session-token': SESSION_TOKEN } });
  const guestRow = (extra: Record<string, unknown>) => ({
    id: 'p1', isActive: true, displayName: 'ano_ana', language: 'fr', avatar: null,
    permissions: { canSendMessages: true, canSendFiles: false, canSendImages: false },
    anonymousSession: { shareLinkId: SHARE_LINK_DB_ID, profile: { username: 'ano_ana' }, session: {} },
    ...extra,
  });

  it('banni encore actif ⇒ 410 GUEST_ACCESS_REVOKED, rien servi, présence non relancée', async () => {
    const app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(guestRow({ bannedAt: new Date('2026-10-13T09:00:00Z') }));

    const res = await patch(app);
    await app.close();

    expect(res.statusCode).toBe(410);
    expect(res.json()).toMatchObject({ success: false, error: 'GUEST_ACCESS_REVOKED' });
    expect(res.json().data).toBeUndefined();
    expect(res.body).not.toContain('Test Conv');
    expect((app as any).prisma.participant.update).not.toHaveBeenCalled();
  });

  it('désactivé ⇒ 410 GUEST_ACCESS_REVOKED, plus 401 SESSION_INVALID', async () => {
    const app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(guestRow({ isActive: false }));

    const res = await patch(app);
    await app.close();

    expect(res.statusCode).toBe(410);
    expect(res.json()).toMatchObject({ success: false, error: 'GUEST_ACCESS_REVOKED' });
    expect((app as any).prisma.participant.update).not.toHaveBeenCalled();
  });

  // #10470 — la révocation DIFFÉRÉE d'un gros lien, rouvert depuis.
  it('marque posée, entré avant ⇒ 410 GUEST_ACCESS_REVOKED ; entré après ⇒ rafraîchi', async () => {
    const pendingSince = new Date('2026-10-13T09:30:00Z');
    const before = await buildApp();
    (before as any).prisma.participant.findFirst.mockResolvedValueOnce(guestRow({ joinedAt: new Date('2026-10-13T09:00:00Z') }));
    (before as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({ ...mockShareLink, guestRevocationPendingAt: pendingSince });
    const refused = await patch(before);
    await before.close();

    const after = await buildApp();
    (after as any).prisma.participant.findFirst.mockResolvedValueOnce(guestRow({ joinedAt: new Date('2026-10-13T09:45:00Z') }));
    (after as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({ ...mockShareLink, guestRevocationPendingAt: pendingSince });
    const refreshed = await patch(after);
    await after.close();

    expect(refused.statusCode).toBe(410);
    expect(refused.json()).toMatchObject({ error: 'GUEST_ACCESS_REVOKED' });
    expect((before as any).prisma.participant.update).not.toHaveBeenCalled();
    expect(refreshed.statusCode).toBe(200);
  });

  it('banni ET lien échu ⇒ 410 LINK_EXPIRED, la cause première', async () => {
    const app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(guestRow({ bannedAt: new Date('2026-10-13T09:00:00Z') }));
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({ ...mockShareLink, expiresAt: new Date('2020-01-01') });

    const res = await patch(app);
    await app.close();

    expect(res.statusCode).toBe(410);
    expect(res.json()).toMatchObject({ error: 'LINK_EXPIRED' });
  });
});

// ─── PATCH /guest-sessions/me — le lien se lit comme aux autres portes (#10464) ─

/**
 * #10464 — le rafraîchissement lisait le lien de l'invité sur la seule session
 * embarquée (`anonymousSession.shareLinkId`), quand les trois autres portes le
 * lisent par `guestShareLinkId` : la colonne de la participation d'abord, la
 * session en repli. Un invité dont seule la colonne porte le lien était traité
 * comme sans lien (410 LINK_DEACTIVATED) ; un invité dont les deux divergent
 * était jugé sur un autre lien que partout ailleurs.
 */
describe('PATCH /guest-sessions/me — le lien de l\'invité se lit par la colonne d\'abord (#10464)', () => {
  const OTHER_LINK_DB_ID = '507f1f77bcf86cd799439033';
  const patch = (app: FastifyInstance) =>
    app.inject({ method: 'PATCH', url: '/guest-sessions/me', headers: { 'x-session-token': SESSION_TOKEN } });
  const guestRow = (extra: Record<string, unknown>) => ({
    id: 'p1', isActive: true, displayName: 'ano_ana', language: 'fr', avatar: null,
    permissions: { canSendMessages: true, canSendFiles: false, canSendImages: false },
    ...extra,
  });

  it('lien porté par la seule COLONNE ⇒ lu et rafraîchi, plus traité comme un lien disparu', async () => {
    const app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(guestRow({
      shareLinkId: SHARE_LINK_DB_ID,
      anonymousSession: { profile: { username: 'ano_ana' }, session: {} },
    }));

    const res = await patch(app);
    await app.close();

    expect((app as any).prisma.conversationShareLink.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SHARE_LINK_DB_ID } })
    );
    expect(res.statusCode).toBe(200);
  });

  it('colonne et session divergent ⇒ la COLONNE fait foi, comme aux autres portes', async () => {
    const app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(guestRow({
      shareLinkId: SHARE_LINK_DB_ID,
      anonymousSession: { shareLinkId: OTHER_LINK_DB_ID, profile: { username: 'ano_ana' }, session: {} },
    }));

    await patch(app);
    await app.close();

    expect((app as any).prisma.conversationShareLink.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SHARE_LINK_DB_ID } })
    );
    expect((app as any).prisma.conversationShareLink.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: OTHER_LINK_DB_ID } })
    );
  });

  it('colonne vide ⇒ la session embarquée en repli', async () => {
    const app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(guestRow({
      shareLinkId: null,
      anonymousSession: { shareLinkId: SHARE_LINK_DB_ID, profile: { username: 'ano_ana' }, session: {} },
    }));

    const res = await patch(app);
    await app.close();

    expect((app as any).prisma.conversationShareLink.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SHARE_LINK_DB_ID } })
    );
    expect(res.statusCode).toBe(200);
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
    (app as any).prisma.conversationShareLink.updateMany.mockClear();

    const first = await app.inject({ method: 'DELETE', url: '/guest-sessions/me', headers: { 'x-session-token': SESSION_TOKEN } });
    const second = await app.inject({ method: 'DELETE', url: '/guest-sessions/me', headers: { 'x-session-token': SESSION_TOKEN } });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(decrements(app)).toHaveLength(1);
  });
});

const decrements = (app: FastifyInstance) =>
  ((app as any).prisma.conversationShareLink.updateMany.mock.calls as any[][])
    .map(([args]) => args)
    .filter(args => args?.data?.currentConcurrentUsers?.decrement === 1);

/**
 * #10472 — la sortie désactivait SANS condition : une révocation concurrente
 * voyait son `leftAt` réécrit et `currentConcurrentUsers` décrémenté deux fois
 * (deux sorties lues actives en même temps), et un lien SUPPRIMÉ entre la
 * lecture et l'écriture faisait lever P2025 — un 500 pour une sortie réussie.
 */
describe('DELETE /guest-sessions/me — écriture conditionnelle, décrément borné, lien supprimé toléré (#10472)', () => {
  const leave = (app: FastifyInstance) =>
    app.inject({ method: 'DELETE', url: '/guest-sessions/me', headers: { 'x-session-token': SESSION_TOKEN } });
  const activeGuest = {
    id: 'p1', conversationId: CONV_ID, isActive: true, shareLinkId: SHARE_LINK_DB_ID,
    anonymousSession: { profile: {}, session: {} },
  };

  it('désactive par une écriture CONDITIONNELLE sur `isActive: true`', async () => {
    const app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(activeGuest);

    const res = await leave(app);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect((app as any).prisma.participant.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', isActive: true },
      data: { isActive: false, isOnline: false, leftAt: expect.any(Date) },
    });
    expect((app as any).prisma.participant.update).not.toHaveBeenCalled();
  });

  it('perd la course contre une révocation (compte 0) : ni décrément, ni annonce, et la sortie réussit', async () => {
    const app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(activeGuest);
    (app as any).prisma.participant.updateMany.mockResolvedValueOnce({ count: 0 });
    const annonces: ConversationLanguageChange[] = [];
    const desabonner = subscribeConversationLanguageChanges(change => { annonces.push(change); });

    const res = await leave(app);
    desabonner();
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(decrements(app)).toHaveLength(0);
    expect(annonces).toEqual([]);
  });

  it('le décrément est BORNÉ : il ne s\'applique qu\'à un compteur positif', async () => {
    const app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(activeGuest);

    await leave(app);
    await app.close();

    expect(decrements(app)).toEqual([{
      where: { id: SHARE_LINK_DB_ID, currentConcurrentUsers: { gt: 0 } },
      data: { currentConcurrentUsers: { decrement: 1 } },
    }]);
  });

  it('un lien SUPPRIMÉ entre-temps ne fait pas échouer la sortie (jamais de 500 P2025)', async () => {
    const app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(activeGuest);
    const p2025 = Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
    (app as any).prisma.conversationShareLink.update.mockRejectedValue(p2025);
    (app as any).prisma.conversationShareLink.updateMany.mockResolvedValue({ count: 0 });

    const res = await leave(app);
    await app.close();

    expect(res.statusCode).toBe(200);
  });
});

/**
 * #10468 — la sortie d'un invité décrémentait `currentConcurrentUsers` sur la
 * seule session embarquée : un invité dont seule la COLONNE porte le lien ne
 * libérait jamais sa place, et un invité dont les deux divergent la libérait
 * sur un autre lien que celui qui l'avait compté. Même lecture que les autres
 * portes : `guestShareLinkId`.
 */
describe('DELETE /guest-sessions/me — la place se libère sur le lien lu par la colonne d\'abord (#10468)', () => {
  const OTHER_LINK_DB_ID = '507f1f77bcf86cd799439033';
  const leave = (app: FastifyInstance) =>
    app.inject({ method: 'DELETE', url: '/guest-sessions/me', headers: { 'x-session-token': SESSION_TOKEN } });

  it('lien porté par la seule COLONNE ⇒ la place se libère sur ce lien', async () => {
    const app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce({
      id: 'p1', conversationId: CONV_ID, isActive: true, shareLinkId: SHARE_LINK_DB_ID,
      anonymousSession: { profile: {}, session: {} },
    });

    const res = await leave(app);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(decrements(app)).toEqual([expect.objectContaining({ where: expect.objectContaining({ id: SHARE_LINK_DB_ID }) })]);
  });

  it('colonne et session divergent ⇒ la COLONNE fait foi', async () => {
    const app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce({
      id: 'p1', conversationId: CONV_ID, isActive: true, shareLinkId: SHARE_LINK_DB_ID,
      anonymousSession: { shareLinkId: OTHER_LINK_DB_ID, profile: {}, session: {} },
    });

    await leave(app);
    await app.close();

    expect(decrements(app)).toEqual([expect.objectContaining({ where: expect.objectContaining({ id: SHARE_LINK_DB_ID }) })]);
  });
});

// ─── #9708 — l'entrée et la sortie par lien sont annoncées à la composition linguistique ──

describe('#9708 — une porte de lien annonce chaque arrivée et chaque départ', () => {
  let app: FastifyInstance;
  let annonces: ConversationLanguageChange[] = [];
  let desabonner: () => void = () => undefined;
  beforeAll(async () => {
    app = await buildApp();
    desabonner = subscribeConversationLanguageChanges((change) => { annonces.push(change); });
  });
  afterAll(async () => { desabonner(); await app.close(); });

  const avec = async (geste: () => Promise<unknown>) => {
    annonces = [];
    await geste();
    return annonces;
  };

  it('un invité anonyme `en` qui entre est annoncé avec SA langue — le cas de la recette #9707', async () => {
    const vues = await avec(() => postMembers(app, { nickname: 'Guest', language: 'en' }));
    expect(vues).toEqual([{ kind: 'arrival', conversationId: CONV_ID, language: 'en', readerUserId: null }]);
  });

  it('un inscrit qui entre par lien est annoncé avec la langue de son compte', async () => {
    (app as any).prisma.participant.findMany = jest.fn().mockResolvedValue([]);
    (app as any).prisma.user.findUnique.mockResolvedValueOnce({
      displayName: 'Ana', username: 'ana', systemLanguage: 'de', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
    });
    const vues = await avec(() => postMembers(app, {}, asRegistered));
    expect(vues).toEqual([{ kind: 'arrival', conversationId: CONV_ID, language: 'de', readerUserId: REGISTERED_USER_ID }]);
  });

  it('un déjà-membre n’annonce rien — aucune écriture, aucune composition changée', async () => {
    (app as any).prisma.participant.findMany = jest.fn().mockResolvedValue([
      { id: 'p-here', isActive: true, bannedAt: null, joinedAt: new Date('2026-01-01') },
    ]);
    const vues = await avec(() => postMembers(app, {}, asRegistered));
    expect(vues).toEqual([]);
    (app as any).prisma.participant.findMany = jest.fn().mockResolvedValue([]);
  });

  it('un invité qui met fin à sa session est annoncé comme un départ', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce({
      id: 'p1', conversationId: CONV_ID, isActive: true,
      anonymousSession: { shareLinkId: SHARE_LINK_DB_ID, profile: {}, session: {} },
    });
    const vues = await avec(() =>
      app.inject({ method: 'DELETE', url: '/guest-sessions/me', headers: { 'x-session-token': SESSION_TOKEN } })
    );
    expect(vues).toEqual([{ kind: 'departure', conversationId: CONV_ID }]);
  });
});
