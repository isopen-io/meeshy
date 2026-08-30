/**
 * Unit tests for links/retrieval routes.
 * Tests GET /links/:identifier
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  UnifiedAuthRequest: {},
}));

const mockAuthMiddleware = jest.fn<any>();

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
    },
  },
}));

// Mock the link utility functions
const mockFindShareLinkByIdentifier = jest.fn<any>();
const mockGetConversationMessages = jest.fn<any>().mockResolvedValue([]);
const mockCountConversationMessages = jest.fn<any>().mockResolvedValue(0);
const mockFormatMessageWithUnifiedSender = jest.fn<any>((msg: any) => msg);
const mockCreateLegacyHybridRequest = jest.fn<any>();
// #4165 — cinq requêtes CIBLÉES qui remplacent l'ancienne relation
// `participants` chargée en bloc SANS `take` (voir `prisma-queries.ts`).
// Plutôt que de réécrire les VINGT-QUATRE sites de ce fichier qui posent
// `mockFindShareLinkByIdentifier.mockResolvedValue{,Once}(shareLinkFixture)`,
// ces cinq doubles se DÉRIVENT de la fixture déjà en place : ils relisent le
// DERNIER `shareLink` résolu par `findShareLinkByIdentifier` (`mock.results`,
// que Jest tient à jour à CHAQUE appel) et filtrent
// `conversation.participants` — exactement la donnée que la production lisait
// avant #4165. Zéro fixture dupliquée, zéro site de test à toucher : la
// bascule est invisible pour les 24 sites existants, qui continuent de poser
// UNE SEULE fixture par scénario.
async function lastResolvedShareLink(): Promise<any> {
  const results = mockFindShareLinkByIdentifier.mock.results;
  const last = results[results.length - 1];
  if (!last || last.type !== 'return') return null;
  try {
    return await last.value;
  } catch {
    return null;
  }
}

async function lastParticipants(): Promise<any[]> {
  const shareLink = await lastResolvedShareLink();
  return shareLink?.conversation?.participants ?? [];
}

const mockFindActiveUserParticipant = jest.fn<any>().mockImplementation(
  async (_prisma: unknown, _conversationId: string, userId: string) => {
    const participants = await lastParticipants();
    const found = participants.find((p: any) => p.type === 'user' && p.userId === userId && p.isActive);
    return found ? { id: found.id } : null;
  }
);
const mockFindLinkMembers = jest.fn<any>().mockImplementation(async () => {
  const participants = await lastParticipants();
  return participants
    .filter((p: any) => p.type === 'user')
    .map((p: any) => ({ id: p.id, role: p.role, joinedAt: p.joinedAt, user: p.user }));
});
const mockFindLinkAnonymousParticipants = jest.fn<any>().mockImplementation(async () => {
  const participants = await lastParticipants();
  return participants
    .filter((p: any) => p.type === 'anonymous')
    .map((p: any) => ({
      id: p.id, displayName: p.displayName, avatar: p.avatar, language: p.language,
      isOnline: p.isOnline, lastActiveAt: p.lastActiveAt, joinedAt: p.joinedAt,
      permissions: p.permissions, anonymousSession: p.anonymousSession,
    }));
});
const mockCountLinkParticipantsByType = jest.fn<any>().mockImplementation(async () => {
  const participants = await lastParticipants();
  return {
    totalMembers: participants.filter((p: any) => p.type === 'user').length,
    totalAnonymousParticipants: participants.filter((p: any) => p.type === 'anonymous').length,
  };
});
const mockCountOnlineAnonymousParticipants = jest.fn<any>().mockImplementation(async () => {
  const participants = await lastParticipants();
  return participants.filter((p: any) => p.type === 'anonymous' && p.isOnline).length;
});

jest.mock('../../../routes/links/utils/prisma-queries', () => ({
  findShareLinkByIdentifier: (...a: any[]) => mockFindShareLinkByIdentifier(...a),
  getConversationMessages: (...a: any[]) => mockGetConversationMessages(...a),
  countConversationMessages: (...a: any[]) => mockCountConversationMessages(...a),
  findActiveUserParticipant: (...a: any[]) => mockFindActiveUserParticipant(...a),
  findLinkMembers: (...a: any[]) => mockFindLinkMembers(...a),
  findLinkAnonymousParticipants: (...a: any[]) => mockFindLinkAnonymousParticipants(...a),
  countLinkParticipantsByType: (...a: any[]) => mockCountLinkParticipantsByType(...a),
  countOnlineAnonymousParticipants: (...a: any[]) => mockCountOnlineAnonymousParticipants(...a),
}));

// `loadReaderHistoryFloor` fait sa PROPRE lecture Prisma (`participant.findFirst`,
// indépendante de `prisma-queries.ts`) — `historyReaderFromAuthContext` reste
// RÉEL (fonction pure, patron `jest.requireActual` du dépôt). Repli par
// défaut : `null` (aucun plancher), correct pour tous les blocs SAUF « plancher
// d'historique » ci-dessous, qui débraye ce double sur la VRAIE implémentation
// (`actualHistoryFloor.loadReaderHistoryFloor`) le temps de ses quatre tests —
// les RÈGLES de plancher (rôle admin, droit figé…) sont déjà couvertes par les
// témoins propres de `historyFloor.ts` ; ici on ne vérifie que le CÂBLAGE.
const mockLoadReaderHistoryFloor = jest.fn<any>().mockResolvedValue(null);
jest.mock('../../../services/historyFloor', () => {
  const actual = jest.requireActual('../../../services/historyFloor') as object;
  return {
    ...actual,
    loadReaderHistoryFloor: (...a: any[]) => mockLoadReaderHistoryFloor(...a),
  };
});
const actualHistoryFloor = jest.requireActual('../../../services/historyFloor') as {
  loadReaderHistoryFloor: (...a: any[]) => Promise<Date | null>;
};

jest.mock('../../../routes/links/utils/message-formatters', () => ({
  formatMessageWithUnifiedSender: (...a: any[]) => mockFormatMessageWithUnifiedSender(...a),
}));

jest.mock('../../../routes/links/utils/link-helpers', () => ({
  createLegacyHybridRequest: (...a: any[]) => mockCreateLegacyHybridRequest(...a),
}));

jest.mock('../../../routes/links/types', () => ({
  conversationSummarySchema: { type: 'object', properties: {}, additionalProperties: true },
  messageSchema: { type: 'object', properties: {}, additionalProperties: true },
  updateLinkSchema: { parse: (b: any) => b },
  updateLinkBodySchema: { type: 'object', properties: {}, additionalProperties: true },
  shareLinkSchema: { type: 'object', properties: {}, additionalProperties: true },
  createLinkSchema: { parse: (b: any) => b },
  createLinkBodySchema: { type: 'object', properties: {}, additionalProperties: true },
  sendMessageSchema: { parse: (b: any) => b },
  sendMessageBodySchema: { type: 'object', properties: {}, additionalProperties: true },
  messageSenderSchema: { type: 'object', additionalProperties: true },
  SendMessageInput: {},
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerRetrievalRoutes } from '../../../routes/links/retrieval';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const LINK_ID = 'mshy_link_abc123';

const mockShareLink = {
  id: '507f1f77bcf86cd799439099',
  linkId: LINK_ID,
  conversationId: CONV_ID,
  name: 'Test Link',
  description: null,
  isActive: true,
  expiresAt: null,
  allowViewHistory: true,
  allowAnonymousMessages: true,
  allowAnonymousFiles: false,
  allowAnonymousImages: false,
  requireAccount: false,
  requireEmail: false,
  requireNickname: false,
  requireBirthday: false,
  conversation: {
    id: CONV_ID,
    title: 'Test Conversation',
    description: null,
    identifier: 'test-conv',
    type: 'group',
    createdAt: new Date('2025-01-01'),
    participants: [
      {
        id: 'part-1', type: 'user', userId: USER_ID, isActive: true, role: 'member',
        joinedAt: new Date(), username: 'alice', firstName: 'Alice', lastName: 'Smith',
        displayName: 'Alice', language: 'fr', isOnline: false, canSendMessages: true,
        canSendFiles: true, canSendImages: true,
        user: { id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice', avatar: null, isOnline: false, lastActiveAt: null, systemLanguage: 'fr' }
      }
    ]
  }
};

// ─── App factory ──────────────────────────────────────────────────────────────

// `authContext` gouverne `viewerFromRequest` (présence anonyme, directive
// produit 2026-08-25) — indépendant de `hybridRequest`, qui gouverne l'accès
// (`createLegacyHybridRequest`). Par défaut ABSENT : la plupart des scénarios
// de ce fichier portent sur l'accès, jamais sur la présence, et un
// `authContext` absent résout `viewer = null` (visiteur non privilégié).
// `prisma` : optionnel, `{}` par défaut — SEUL le bloc « plancher d'historique »
// en a besoin (`participant.findFirst`, quand `loadReaderHistoryFloor` y est
// débrayé sur sa vraie implémentation, voir plus bas). Les 24 autres appels
// à deux arguments sont inchangés.
async function buildApp(hybridRequest: any = {}, authContext?: any, prisma: any = {}): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    if (authContext) req.authContext = authContext;
  });
  mockCreateLegacyHybridRequest.mockReturnValue(hybridRequest);

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as any);
  await registerRetrievalRoutes(app);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /links/:identifier — link not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(null);
    app = await buildApp({ isAuthenticated: false, isAnonymous: false });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when share link not found', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /links/:identifier — unauthenticated, allowViewHistory=true', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(mockShareLink);
    app = await buildApp({ isAuthenticated: false, isAnonymous: false, user: null });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when anonymous visitor can view history', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().data.link.linkId).toBe(LINK_ID);
  });
});

describe('GET /links/:identifier — unauthenticated, allowViewHistory=false', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue({ ...mockShareLink, allowViewHistory: false });
    app = await buildApp({ isAuthenticated: false, isAnonymous: false, user: null });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when anonymous visitor cannot view history', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /links/:identifier — authenticated member of conversation', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(mockShareLink);
    app = await buildApp({
      isAuthenticated: true, isAnonymous: false,
      user: { id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice', systemLanguage: 'fr' },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with redirectTo for conversation members', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.userType).toBe('member');
    expect(data.redirectTo).toBe(`/conversations/${CONV_ID}`);
  });
});

describe('GET /links/:identifier — authenticated non-member, allowViewHistory=true', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(mockShareLink);
    app = await buildApp({
      isAuthenticated: true, isAnonymous: false,
      user: { id: 'other-user-id', username: 'bob', firstName: 'Bob', lastName: 'Jones', displayName: 'Bob', systemLanguage: 'en' },
    });
  });
  afterAll(async () => { await app.close(); });

  // Un membre connecté qui ouvre un lien de partage doit voir le MÊME aperçu
  // qu'un visiteur déconnecté — sinon être identifié punit : /chat/:linkId
  // rendrait 403 pour un utilisateur connecté là où la navigation privée
  // affiche la conversation. L'aperçu est ensuite doublé de la modale
  // « Rejoindre » côté web.
  it('returns 200 preview when the share link allows history', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.userType).toBe('anonymous');
    expect(data.redirectTo).toBeUndefined();
    expect(data.currentUser.id).toBe('other-user-id');
  });
});

describe('GET /links/:identifier — authenticated non-member, allowViewHistory=false', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue({ ...mockShareLink, allowViewHistory: false });
    app = await buildApp({
      isAuthenticated: true, isAnonymous: false,
      user: { id: 'other-user-id', username: 'bob', firstName: 'Bob', lastName: 'Jones', displayName: 'Bob', systemLanguage: 'en' },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when the share link forbids history', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /links/:identifier — identity payloads survive serialization', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue({
      ...mockShareLink,
      conversation: {
        ...mockShareLink.conversation,
        participants: [
          ...mockShareLink.conversation.participants,
          // Forme RÉELLE d'un participant anonyme : l'identité vit dans
          // `anonymousSession.profile`, les droits dans `permissions` — le
          // modèle Prisma `Participant` ne porte NI username NI firstName.
          {
            id: 'part-2', type: 'anonymous', userId: null, isActive: true, role: 'member',
            joinedAt: new Date(), displayName: 'Guest One', avatar: null,
            language: 'es', isOnline: true, lastActiveAt: new Date(), user: null,
            permissions: { canSendMessages: true, canSendFiles: false, canSendImages: true },
            anonymousSession: {
              profile: { firstName: 'Guest', lastName: 'One', username: 'guest', email: null, birthday: null },
            },
          },
        ],
      },
    });
    app = await buildApp({
      isAuthenticated: false, isAnonymous: true,
      anonymousParticipant: {
        shareLinkId: '507f1f77bcf86cd799439099',
        id: 'anon-part-1', username: 'guest', firstName: 'Guest', lastName: 'One',
        language: 'es', canSendMessages: true, canSendFiles: false, canSendImages: false,
      },
    });
  });
  afterAll(async () => { await app.close(); });

  // `currentUser`, `members` et `anonymousParticipants` étaient déclarés comme
  // des objets SANS `properties` : fast-json-stringify les réduisait à `{}`.
  // La vue partagée lit l'identité et la liste des participants dans ces trois
  // champs — sans elles, /chat/:linkId ne sait pas qui parle.
  it('returns the identity of the current anonymous participant', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.currentUser).toMatchObject({
      id: 'anon-part-1',
      username: 'guest',
      isMeeshyer: false,
      permissions: { canSendMessages: true, canSendFiles: false, canSendImages: false },
    });
  });

  it('returns member identities', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    const [member] = res.json().data.members;
    expect(member).toMatchObject({ role: 'member' });
    expect(member.user).toMatchObject({ id: USER_ID, username: 'alice', displayName: 'Alice' });
  });

  // Directive produit 2026-08-25 — TROU #4. Cette route est CONSULTABLE SANS
  // AUTHENTIFICATION : le visiteur de ce bloc est anonyme (`isAuthenticated:
  // false`), donc `viewer = null` — jamais privilégié. `isOnline` masque à
  // `false` même si le participant est réellement en ligne (fixture:
  // `isOnline: true`) : co-partager le lien n'est pas une amitié.
  it('masque la présence du participant anonyme pour un visiteur non privilégié', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    const [participant] = res.json().data.anonymousParticipants;
    expect(participant).toMatchObject({
      id: 'part-2',
      username: 'guest',
      firstName: 'Guest',
      lastName: 'One',
      displayName: 'Guest One',
      language: 'es',
      isOnline: false,
      canSendMessages: true,
      canSendFiles: false,
      canSendImages: true,
    });
  });

  it("compte `stats.onlineAnonymousParticipants` à 0 pour ce même visiteur — pas un 0 fabriqué, la loi appliquée à l'agrégat", async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.json().data.stats.onlineAnonymousParticipants).toBe(0);
    // Le total, lui, N'EST PAS de la présence — il reste exact.
    expect(res.json().data.stats.totalAnonymousParticipants).toBe(1);
  });

  it('never leaks the anonymous session envelope', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.payload).not.toContain('sessionTokenHash');
    expect(res.payload).not.toContain('deviceFingerprint');
    expect(res.json().data.anonymousParticipants[0].anonymousSession).toBeUndefined();
  });
});

// Directive produit 2026-08-25 — TROU #4, quatre témoins. Un participant
// anonyme n'a pas de `userId` (pas de ligne `User`) : ni amitié ni
// préférences à résoudre, seul le bypass ADMIN/BIGBOSS inconditionnel de la
// directive s'applique. Ce lien est consultable SANS authentification, donc
// « visiteur non privilégié » couvre à la fois l'anonyme ET l'utilisateur
// enregistré non-admin.
// `joinedAt` et `lastActiveAt` sont DISTINCTS à dessein : le site servait
// `lastActiveAt: participant.joinedAt` — une date d'arrivée déguisée en
// dernière activité — et deux `new Date()` pris dans la même milliseconde
// n'auraient jamais rougi sur cette substitution.
const ANONYMOUS_JOINED_AT = new Date('2026-08-01T10:00:00.000Z');
const ANONYMOUS_LAST_ACTIVE_AT = new Date('2026-08-20T12:34:56.000Z');

describe('GET /links/:identifier — présence des participants anonymes (directive produit 2026-08-25)', () => {
  const shareLinkWithAnonymousPeer = () => ({
    ...mockShareLink,
    conversation: {
      ...mockShareLink.conversation,
      participants: [
        ...mockShareLink.conversation.participants,
        {
          id: 'part-2', type: 'anonymous', userId: null, isActive: true, role: 'member',
          joinedAt: ANONYMOUS_JOINED_AT, displayName: 'Guest One', avatar: null,
          language: 'es', isOnline: true, lastActiveAt: ANONYMOUS_LAST_ACTIVE_AT, user: null,
          permissions: { canSendMessages: true, canSendFiles: false, canSendImages: true },
          anonymousSession: {
            profile: { firstName: 'Guest', lastName: 'One', username: 'guest', email: null, birthday: null },
          },
        },
      ],
    },
  });

  it('USER authentifié non-ami ⇒ présence masquée (co-visiter un lien public n’est pas une relation)', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(shareLinkWithAnonymousPeer());
    const app = await buildApp(
      { isAuthenticated: true, isAnonymous: false, user: { id: 'other-user-id', username: 'bob', firstName: 'Bob', lastName: 'Jones', displayName: 'Bob', systemLanguage: 'en' } },
      { type: 'user', isAuthenticated: true, isAnonymous: false, userId: 'other-user-id', registeredUser: { id: 'other-user-id', role: 'USER' } },
    );
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.json().data.anonymousParticipants[0].isOnline).toBe(false);
    expect(res.json().data.stats.onlineAnonymousParticipants).toBe(0);
    await app.close();
  });

  it('ADMIN authentifié ⇒ présence visible — entitlement inconditionnel de la directive', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(shareLinkWithAnonymousPeer());
    const app = await buildApp(
      { isAuthenticated: true, isAnonymous: false, user: { id: 'admin-id', username: 'root', firstName: 'Root', lastName: 'Admin', displayName: 'Root', systemLanguage: 'en' } },
      { type: 'user', isAuthenticated: true, isAnonymous: false, userId: 'admin-id', registeredUser: { id: 'admin-id', role: 'ADMIN' } },
    );
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.json().data.anonymousParticipants[0].isOnline).toBe(true);
    expect(res.json().data.stats.onlineAnonymousParticipants).toBe(1);
    await app.close();
  });

  it('BIGBOSS authentifié ⇒ présence visible', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(shareLinkWithAnonymousPeer());
    const app = await buildApp(
      { isAuthenticated: true, isAnonymous: false, user: { id: 'boss-id', username: 'boss', firstName: 'Big', lastName: 'Boss', displayName: 'Big Boss', systemLanguage: 'en' } },
      { type: 'user', isAuthenticated: true, isAnonymous: false, userId: 'boss-id', registeredUser: { id: 'boss-id', role: 'BIGBOSS' } },
    );
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.json().data.anonymousParticipants[0].isOnline).toBe(true);
    await app.close();
  });

  // Le bypass de ce site suit `isGlobalAdmin` — « Admin et supérieur » — et
  // jamais `isGlobalModerator` : MODERATOR est le seul rang où les deux
  // prédicats divergent, donc le seul témoin qui rougit si le site rétrograde.
  it('MODERATOR authentifié ⇒ masqué, comme un utilisateur ordinaire', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(shareLinkWithAnonymousPeer());
    const app = await buildApp(
      { isAuthenticated: true, isAnonymous: false, user: { id: 'mod-id', username: 'mod', firstName: 'Mo', lastName: 'Derator', displayName: 'Mod', systemLanguage: 'en' } },
      { type: 'user', isAuthenticated: true, isAnonymous: false, userId: 'mod-id', registeredUser: { id: 'mod-id', role: 'MODERATOR' } },
    );
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.json().data.anonymousParticipants[0].isOnline).toBe(false);
    expect(res.json().data.stats.onlineAnonymousParticipants).toBe(0);
    await app.close();
  });

  it('visiteur totalement anonyme (aucun `authContext`, aucun jeton) ⇒ masqué', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(shareLinkWithAnonymousPeer());
    const app = await buildApp({ isAuthenticated: false, isAnonymous: false, user: null });
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.json().data.anonymousParticipants[0].isOnline).toBe(false);
    expect(res.json().data.stats.onlineAnonymousParticipants).toBe(0);
    await app.close();
  });
});

// Revue adversariale 2026-08-26 (F2, constat 1). Le gate ci-dessus masquait
// `isOnline` et laissait, LIGNE SUIVANTE du même objet, `lastActiveAt:
// participant.joinedAt` sans condition — pour les anonymes comme pour les
// membres inscrits (`isOnline: false` en dur, `lastActiveAt: member.joinedAt`).
// Le web (`participant-mapper.ts` → `StreamSidebar.UserItem`) dérive une
// pastille de `lastActiveAt` via `getUserPresenceStatus` : la présence
// masquée sur un champ ressortait par son voisin. Directive : hors amitié /
// soi / ADMIN+, ni `isOnline` NI `lastActiveAt` d'un autre ; et `joinedAt`
// n'est PAS une dernière activité — l'ADMIN reçoit la valeur RÉELLE
// (`Participant.lastActiveAt`, écrite par `StatusService`), jamais un
// substitut fabriqué.
describe('GET /links/:identifier — dernière activité (`lastActiveAt`) gatée comme `isOnline` (F2, 2026-08-26)', () => {
  const shareLinkWithAnonymousPeer = () => ({
    ...mockShareLink,
    conversation: {
      ...mockShareLink.conversation,
      participants: [
        ...mockShareLink.conversation.participants,
        {
          id: 'part-2', type: 'anonymous', userId: null, isActive: true, role: 'member',
          joinedAt: ANONYMOUS_JOINED_AT, displayName: 'Guest One', avatar: null,
          language: 'es', isOnline: true, lastActiveAt: ANONYMOUS_LAST_ACTIVE_AT, user: null,
          permissions: { canSendMessages: true, canSendFiles: false, canSendImages: true },
          anonymousSession: {
            profile: { firstName: 'Guest', lastName: 'One', username: 'guest', email: null, birthday: null },
          },
        },
      ],
    },
  });

  const registered = (id: string, role: string) => [
    { isAuthenticated: true, isAnonymous: false, user: { id, username: id, firstName: 'X', lastName: 'Y', displayName: id, systemLanguage: 'en' } },
    { type: 'user', isAuthenticated: true, isAnonymous: false, userId: id, registeredUser: { id, role } },
  ] as const;

  it('USER authentifié non-ami ⇒ `lastActiveAt: null` sur les DEUX listes', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(shareLinkWithAnonymousPeer());
    const app = await buildApp(...registered('other-user-id', 'USER'));
    const { data } = (await app.inject({ method: 'GET', url: `/links/${LINK_ID}` })).json();
    expect(data.anonymousParticipants[0].lastActiveAt).toBeNull();
    expect(data.members[0].user.lastActiveAt).toBeNull();
    await app.close();
  });

  it('visiteur totalement anonyme ⇒ `lastActiveAt: null` sur les DEUX listes', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(shareLinkWithAnonymousPeer());
    const app = await buildApp({ isAuthenticated: false, isAnonymous: false, user: null });
    const { data } = (await app.inject({ method: 'GET', url: `/links/${LINK_ID}` })).json();
    expect(data.anonymousParticipants[0].lastActiveAt).toBeNull();
    expect(data.members[0].user.lastActiveAt).toBeNull();
    await app.close();
  });

  it('MODERATOR ⇒ `lastActiveAt: null`, comme un utilisateur ordinaire', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(shareLinkWithAnonymousPeer());
    const app = await buildApp(...registered('mod-id', 'MODERATOR'));
    const { data } = (await app.inject({ method: 'GET', url: `/links/${LINK_ID}` })).json();
    expect(data.anonymousParticipants[0].lastActiveAt).toBeNull();
    expect(data.members[0].user.lastActiveAt).toBeNull();
    await app.close();
  });

  // Même prédicat que `isOnline` : l'ADMIN lit la dernière activité RÉELLE du
  // participant anonyme — pas sa date d'arrivée. Les membres inscrits gardent
  // le choix plus strict du site (`isOnline: false` pour tous) : `lastActiveAt`
  // y est `null` aussi, jamais `joinedAt`.
  it('ADMIN ⇒ la dernière activité RÉELLE de l’anonyme (≠ `joinedAt`) ; `null` pour les inscrits', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(shareLinkWithAnonymousPeer());
    const app = await buildApp(...registered('admin-id', 'ADMIN'));
    const { data } = (await app.inject({ method: 'GET', url: `/links/${LINK_ID}` })).json();
    expect(data.anonymousParticipants[0].lastActiveAt).toBe(ANONYMOUS_LAST_ACTIVE_AT.toISOString());
    expect(data.anonymousParticipants[0].lastActiveAt).not.toBe(ANONYMOUS_JOINED_AT.toISOString());
    expect(data.anonymousParticipants[0].joinedAt).toBe(ANONYMOUS_JOINED_AT.toISOString());
    expect(data.members[0].user.lastActiveAt).toBeNull();
    expect(data.members[0].joinedAt).toEqual(expect.any(String));
    await app.close();
  });
});

describe('GET /links/:identifier — join requirements exposed to the client', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue({
      ...mockShareLink,
      requireAccount: true,
      requireEmail: true,
      requireNickname: true,
      requireBirthday: true,
    });
    app = await buildApp({ isAuthenticated: false, isAnonymous: false, user: null });
  });
  afterAll(async () => { await app.close(); });

  // La modale de jonction rendue par /chat/:linkId lit ces quatre drapeaux pour
  // décider quels champs afficher. Ils étaient absents du schéma de réponse,
  // donc retirés par la sérialisation Fastify.
  it('returns requireAccount and requireBirthday alongside the other requirements', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.link).toMatchObject({
      requireAccount: true,
      requireEmail: true,
      requireNickname: true,
      requireBirthday: true,
    });
  });
});

describe('GET /links/:identifier — meeshy conversation (all users have access)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue({
      ...mockShareLink,
      conversation: { ...mockShareLink.conversation, identifier: 'meeshy' },
    });
    app = await buildApp({
      isAuthenticated: true, isAnonymous: false,
      user: { id: 'any-user-id', username: 'charlie', firstName: 'Charlie', lastName: 'Brown', displayName: 'Charlie', systemLanguage: 'fr' },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 for any authenticated user on meeshy conversation', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /links/:identifier — anonymous participant with matching shareLinkId', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(mockShareLink);
    app = await buildApp({
      isAuthenticated: false, isAnonymous: true,
      anonymousParticipant: {
        shareLinkId: '507f1f77bcf86cd799439099',
        id: 'anon-part-1', username: 'guest', firstName: 'Guest', lastName: null,
        displayName: 'Guest', language: 'fr', canSendMessages: true, canSendFiles: false, canSendImages: false,
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 for anonymous participant with correct shareLinkId', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.userType).toBe('anonymous');
    expect(data.currentUser).not.toBeNull();
  });
});

describe('GET /links/:identifier — anonymous participant wrong shareLinkId', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(mockShareLink);
    app = await buildApp({
      isAuthenticated: false, isAnonymous: true,
      anonymousParticipant: { shareLinkId: 'wrong-id' },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 for anonymous participant with wrong shareLinkId', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /links/:identifier — with messages', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(mockShareLink);
    mockGetConversationMessages.mockResolvedValue([
      { id: 'msg-1', content: 'Hello', createdAt: new Date() },
      { id: 'msg-2', content: 'World', createdAt: new Date() },
    ]);
    mockCountConversationMessages.mockResolvedValue(2);
    app = await buildApp({ isAuthenticated: false, isAnonymous: false, user: null });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with messages and stats', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}?limit=10&offset=0` });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.stats.totalMessages).toBe(2);
    expect(data.messages).toHaveLength(2);
  });
});

describe('GET /links/:identifier — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockFindShareLinkByIdentifier.mockRejectedValue(new Error('DB failure'));
    app = await buildApp({ isAuthenticated: false, isAnonymous: false });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── Plancher d'historique ────────────────────────────────────────────────────
//
// `GET /links/:identifier` sert des messages lui aussi. Le lecteur y est
// reconnu sur sa ligne parmi les participants chargés AVEC le lien — un
// anonyme par `Participant.id`, un inscrit par `userId` — et la borne voyage
// jusqu'aux deux helpers (page et total). Un visiteur en aperçu n'a pas de
// ligne : rien ne le borne, `canPreview` exige déjà `allowViewHistory`.

describe('GET /links/:identifier — plancher d’historique du lecteur', () => {
  const JOINED_AT = new Date('2026-06-15T00:00:00Z');
  const ANON_ROW_ID = '507f1f77bcf86cd799439aaa';
  const memberRow = (over: Record<string, unknown> = {}) => ({
    ...mockShareLink.conversation.participants[0],
    permissions: { canViewHistory: false },
    joinedAt: JOINED_AT,
    shareLinkId: null,
    historyVisibleFrom: null,
    ...over,
  });
  const anonymousRow = () => ({
    id: ANON_ROW_ID, type: 'anonymous', userId: null, isActive: true, role: 'member',
    joinedAt: JOINED_AT, displayName: 'ano_guest', language: 'fr', isOnline: false,
    shareLinkId: mockShareLink.id, historyVisibleFrom: null, permissions: {},
    anonymousSession: { profile: { firstName: 'Guest', lastName: 'X', username: 'ano_guest' } },
    user: null,
  });
  const withParticipants = (participants: unknown[], over: Record<string, unknown> = {}) => ({
    ...mockShareLink,
    ...over,
    conversation: { ...mockShareLink.conversation, participants },
  });
  const readOptionsOf = () => ({
    page: mockGetConversationMessages.mock.calls[0][4],
    total: mockCountConversationMessages.mock.calls[0][2],
  });

  beforeEach(() => {
    mockGetConversationMessages.mockClear();
    mockCountConversationMessages.mockClear();
  });

  // #4165 — `retrieval.ts` délègue désormais le plancher à
  // `loadReaderHistoryFloor` (SSOT partagée avec `/conversations/:id/reactions`
  // et `/conversations/:id/status`) plutôt qu'à un scan de la relation
  // `participants` chargée en bloc. Ces quatre témoins vérifient le CÂBLAGE
  // (le plancher rendu par la lecture atteint bien `getConversationMessages`/
  // `countConversationMessages`) — les RÈGLES qui décident CE plancher (rôle
  // admin, droit figé, lien fermé…) sont la responsabilité de
  // `loadReaderHistoryFloor` elle-même, déjà couverte ailleurs. D'où le
  // débrayage sur sa VRAIE implémentation ici : ré-simuler ces règles dans le
  // double serait dupliquer la production dans un helper de test (interdit,
  // `services/gateway/CLAUDE.md` § Tests).
  beforeAll(() => {
    mockLoadReaderHistoryFloor.mockImplementation(actualHistoryFloor.loadReaderHistoryFloor);
  });
  afterAll(() => {
    mockLoadReaderHistoryFloor.mockResolvedValue(null);
  });

  it('borne un membre INSCRIT au droit figé fermé à son arrivée — page et total', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(withParticipants([memberRow()]));
    const app = await buildApp(
      { isAuthenticated: true, isAnonymous: false, user: { id: USER_ID, username: 'alice', systemLanguage: 'fr' } },
      { type: 'user', isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } },
      { participant: { findFirst: jest.fn<any>().mockResolvedValue(memberRow()) } }
    );

    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(200);
    expect(readOptionsOf()).toEqual({ page: { historyFloor: JOINED_AT }, total: { historyFloor: JOINED_AT } });
    await app.close();
  });

  it('borne un ANONYME entré par un lien qui ferme l’historique, reconnu par `Participant.id`', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(
      withParticipants([memberRow({ permissions: { canViewHistory: true } }), anonymousRow()], { allowViewHistory: false })
    );
    const app = await buildApp(
      {
        isAuthenticated: false, isAnonymous: true,
        anonymousParticipant: {
          shareLinkId: mockShareLink.id, id: 'session-token', username: 'ano_guest', firstName: 'Guest', lastName: 'X',
          displayName: 'Guest', language: 'fr', canSendMessages: true, canSendFiles: false, canSendImages: false,
        },
      },
      { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: ANON_ROW_ID, participantId: ANON_ROW_ID },
      { participant: { findFirst: jest.fn<any>().mockResolvedValue(anonymousRow()) } }
    );

    const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(res.statusCode).toBe(200);
    expect(readOptionsOf()).toEqual({ page: { historyFloor: JOINED_AT }, total: { historyFloor: JOINED_AT } });
    await app.close();
  });

  it('ouvre tout à un administrateur de la conversation', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(withParticipants([memberRow({ role: 'admin' })]));
    const app = await buildApp(
      { isAuthenticated: true, isAnonymous: false, user: { id: USER_ID, username: 'alice', systemLanguage: 'fr' } },
      { type: 'user', isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } },
      { participant: { findFirst: jest.fn<any>().mockResolvedValue(memberRow({ role: 'admin' })) } }
    );

    await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(readOptionsOf()).toEqual({ page: { historyFloor: null }, total: { historyFloor: null } });
    await app.close();
  });

  it('ne borne RIEN pour un visiteur en simple aperçu — il n’a pas de ligne', async () => {
    mockFindShareLinkByIdentifier.mockResolvedValue(withParticipants([memberRow()]));
    const app = await buildApp({ isAuthenticated: false, isAnonymous: false, user: null });

    await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
    expect(readOptionsOf()).toEqual({ page: { historyFloor: null }, total: { historyFloor: null } });
    await app.close();
  });
});
