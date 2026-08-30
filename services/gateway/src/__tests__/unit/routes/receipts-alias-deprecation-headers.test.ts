/**
 * CINQ des SIX portes historiques d'accusés de lecture ANNONCENT leur sursis
 * (#4423, suivi de #4349/#4179) : quatre dans `message-read-status.ts`, une
 * dans `conversations/messages.ts` (`POST /conversations/:id/mark-read`).
 *
 * Traverse la VRAIE réponse (`app.inject()`), jamais un double du handler —
 * comme `conversation-links-deprecation.test.ts` pour le même mécanisme
 * (`depreciee`, #4274). Chaque témoin de succès vérifie l'adresse successeur
 * EXACTE : les portes ne portent pas le même paramètre de chemin (`:id`
 * contre `:conversationId`), et trois enferment leur `type` d'accusé dans le
 * CHEMIN historique plutôt que dans le corps de leur successeur.
 *
 * Et l'annonce part sur un REFUS (401/403/404) autant que sur un succès
 * (200) — posée en `onRequest`, donc AVANT `preValidation`/`preHandler` :
 * c'est l'ADRESSE qui est en sursis, pas seulement son chemin heureux. Un
 * appelant refusé est celui qui a le plus besoin de savoir migrer.
 *
 * La SIXIÈME, `GET /messages/:messageId/read-status`, N'ANNONCE RIEN — un
 * SILENCE ASSUMÉ, pas un oubli : voir son propre `describe` plus bas, qui
 * prouve l'ABSENCE des trois en-têtes plutôt qu'une adresse en gabarit. Un
 * premier essai de cette porte servait `:conversationId` en clair dans le
 * `Link` ; la garde élargie (`deprecated-alias-headers-guard.test.ts`) l'a
 * fait tomber, à raison — voir son doc-comment de tête.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, beforeEach, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Mocks partagés par les deux suites (déclarés avant les imports, hoistés
// par Jest). Recette éprouvée par `message-read-status-extra.test.ts` :
// auth qui respecte l'en-tête `Authorization` (401 naturel sans lui), et
// `MessageReadStatusService` mocké pour ne pas retomber sur Prisma.
// ---------------------------------------------------------------------------

const AUTH_USER_ID = 'user-deprecation-headers-1';
const AUTH_HEADER = 'Bearer test-token';

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (request: any, reply: any) => {
    if (!request.headers['authorization']) {
      return reply
        .code(401)
        .send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    }
    request.authContext = {
      userId: AUTH_USER_ID,
      type: 'registered',
      isAnonymous: false,
      hasFullAccess: true,
    };
  },
}));

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args),
}));

const mockGetMessageReadStatus = jest.fn();
const mockGetConversationReadStatuses = jest.fn();
const mockGetUnreadCount = jest.fn();
const mockMarkMessagesAsRead = jest.fn();
const mockMarkMessagesAsReceived = jest.fn();

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getMessageReadStatus: mockGetMessageReadStatus,
    getConversationReadStatuses: mockGetConversationReadStatuses,
    getUnreadCount: mockGetUnreadCount,
    markMessagesAsRead: mockMarkMessagesAsRead,
    markMessagesAsReceived: mockMarkMessagesAsReceived,
    filterReadReceiptVisible: jest.fn().mockResolvedValue([]),
    getMessageStatusDetails: jest.fn(),
  })),
}));

jest.mock('../../../utils/rate-limiter', () => ({
  createCustomRateLimiter: () => ({
    middleware: () => async (_req: unknown, _reply: unknown) => {
      /* no-op */
    },
  }),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
  performanceLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

// ---------------------------------------------------------------------------
// Import après les mocks
// ---------------------------------------------------------------------------

import messageReadStatusRoutes from '../../../routes/message-read-status';
import { registerMessagesRoutes } from '../../../routes/conversations/messages';

const linkFor = (path: string) => `<${path}>; rel="successor-version"`;

// ===========================================================================
// 1. Les CINQ portes de message-read-status.ts
// ===========================================================================

describe('message-read-status.ts — les cinq portes annoncent leur sursis', () => {
  const CONVERSATION_ID = '507f1f77bcf86cd799439012';
  const MESSAGE_ID = '507f1f77bcf86cd799439013';
  const PARTICIPANT_ID = '507f1f77bcf86cd799439011';

  const mockPrisma: any = {
    participant: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    message: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    conversationReadCursor: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };

  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);
    app.decorate('socketIOHandler', { getManager: () => null } as never);
    await app.register(messageReadStatusRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
    // Rôle `admin` : `loadReaderHistoryFloor` s'arrête au bypass rang (aucune
    // requête `conversationShareLink` supplémentaire à mocker) — sans effet
    // sur le VERDICT des témoins ci-dessous, qui ne portent que sur les
    // en-têtes de dépréciation, jamais sur le plancher d'historique.
    mockPrisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID, role: 'admin' });
    mockPrisma.message.findUnique.mockResolvedValue({
      id: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      senderId: 'someone-else',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    mockPrisma.message.findMany.mockResolvedValue([
      { id: MESSAGE_ID, senderId: 'someone-else', createdAt: new Date('2026-01-01T00:00:00Z') },
    ]);
    mockGetMessageReadStatus.mockResolvedValue({ messageId: MESSAGE_ID, readCount: 1, deliveredCount: 2 });
    mockGetConversationReadStatuses.mockResolvedValue(new Map());
    mockGetUnreadCount.mockResolvedValue(0);
    mockMarkMessagesAsRead.mockResolvedValue(0);
    mockMarkMessagesAsReceived.mockResolvedValue(0);
  });

  describe('GET /messages/:messageId/read-status — SILENCE ASSUMÉ, pas encore couvert', () => {
    // Revu après le retour du coordinateur : un premier essai servait
    // `:conversationId` en gabarit dans le `Link` — la garde élargie
    // (`deprecated-alias-headers-guard.test.ts`) l'a refusé à raison, un
    // `Link` que le client ne peut pas suivre tel quel désinforme plus qu'il
    // n'informe. Cette porte est la SEULE des six sans `conversationId`
    // nulle part sur la requête (mesuré : ni params, ni query validée, ni
    // en-tête, ni hook antérieur — `onRequest` est le premier du cycle) ;
    // `AdresseDepreciee.successeur` est REQUIS (`utils/deprecation.ts`), donc
    // aucune forme honnête n'existe aujourd'hui. Voir
    // `message-read-status.ts` § « NE PORTE PAS d'annonce » et
    // `alias-deprecation-guard.test.ts` § `SILENCES_ASSUMES`.
    const url = () => `/messages/${MESSAGE_ID}/read-status`;

    it("succès (200) : AUCUNE annonce — ni Deprecation, ni Link, ni Sunset", async () => {
      const res = await app.inject({ method: 'GET', url: url(), headers: { authorization: AUTH_HEADER } });

      expect(res.statusCode).toBe(200);
      expect(res.headers['deprecation']).toBeUndefined();
      expect(res.headers['link']).toBeUndefined();
      expect(res.headers['sunset']).toBeUndefined();
    });

    it('un 404 (message introuvable) ne porte pas non plus d\'annonce — rien à désinformer', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: url(), headers: { authorization: AUTH_HEADER } });

      expect(res.statusCode).toBe(404);
      expect(res.headers['deprecation']).toBeUndefined();
      expect(res.headers['link']).toBeUndefined();
    });
  });

  describe('GET /conversations/:conversationId/read-statuses', () => {
    const url = () => `/conversations/${CONVERSATION_ID}/read-statuses?messageIds=${MESSAGE_ID}`;

    it('succès (200) : `detail=summary` voyage dans le Link, sur la collection', async () => {
      const res = await app.inject({ method: 'GET', url: url(), headers: { authorization: AUTH_HEADER } });

      expect(res.statusCode).toBe(200);
      expect(res.headers['deprecation']).toMatch(/^@\d+$/);
      expect(res.headers['link']).toBe(
        linkFor(`/api/v1/conversations/${CONVERSATION_ID}/receipts?detail=summary`)
      );
    });

    it("l'annonce part MÊME sur un 403 (non membre)", async () => {
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: url(), headers: { authorization: AUTH_HEADER } });

      expect(res.statusCode).toBe(403);
      expect(res.headers['deprecation']).toMatch(/^@\d+$/);
      expect(res.headers['link']).toBe(
        linkFor(`/api/v1/conversations/${CONVERSATION_ID}/receipts?detail=summary`)
      );
    });
  });

  describe('POST /conversations/:conversationId/mark-as-read', () => {
    it('succès (200) : `type` reste dans le CORPS du successeur, jamais dans son URL', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/conversations/${CONVERSATION_ID}/mark-as-read`,
        headers: { authorization: AUTH_HEADER },
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['deprecation']).toMatch(/^@\d+$/);
      expect(res.headers['link']).toBe(linkFor(`/api/v1/conversations/${CONVERSATION_ID}/receipts`));
    });
  });

  describe('POST /conversations/:conversationId/mark-as-received', () => {
    it('succès (200) : MÊME successeur que mark-as-read — `type` seul distingue les deux', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/conversations/${CONVERSATION_ID}/mark-as-received`,
        headers: { authorization: AUTH_HEADER },
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['deprecation']).toMatch(/^@\d+$/);
      expect(res.headers['link']).toBe(linkFor(`/api/v1/conversations/${CONVERSATION_ID}/receipts`));
    });
  });

  describe('POST /conversations/:conversationId/messages/:messageId/delivery-receipt', () => {
    const url = () => `/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/delivery-receipt`;

    it('succès (200) : MÊME successeur — `messageId` reste dans le CORPS (`messageIds`), jamais dans l\'URL', async () => {
      const res = await app.inject({
        method: 'POST',
        url: url(),
        headers: { authorization: AUTH_HEADER },
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['deprecation']).toMatch(/^@\d+$/);
      expect(res.headers['link']).toBe(linkFor(`/api/v1/conversations/${CONVERSATION_ID}/receipts`));
    });

    it("l'annonce part MÊME sur un 404 (message hors conversation — anti-spoof)", async () => {
      mockPrisma.message.findMany.mockResolvedValue([]); // fail-closed : aucune ligne prouvée ⇒ 404

      const res = await app.inject({
        method: 'POST',
        url: url(),
        headers: { authorization: AUTH_HEADER },
        payload: {},
      });

      expect(res.statusCode).toBe(404);
      expect(res.headers['deprecation']).toMatch(/^@\d+$/);
      expect(res.headers['link']).toBe(linkFor(`/api/v1/conversations/${CONVERSATION_ID}/receipts`));
    });
  });
});

// ===========================================================================
// 2. La SIXIÈME porte : conversations/messages.ts
// ===========================================================================

describe('conversations/messages.ts — POST /conversations/:id/mark-read annonce son sursis', () => {
  const CONV_ID = '507f1f77bcf86cd799439021';
  const PARTICIPANT_ID = '507f1f77bcf86cd799439022';

  function buildApp(membership: unknown): FastifyInstance {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    (app as any).socketIOHandler = { getManager: () => null };
    (app as any).notificationService = null;

    const prisma: any = {
      participant: { findFirst: jest.fn().mockResolvedValue(membership) },
    };
    const noop = async (_req: any) => {
      /* routes non ciblées par ce fichier : jamais exercées */
    };

    registerMessagesRoutes(app, prisma, {} as any, noop, noop);
    return app;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockGetUnreadCount.mockResolvedValue(0);
  });

  it('porte Deprecation et le Link EXACT (`id` résolu, jamais `conversationId`) — succès', async () => {
    const app = buildApp({ id: PARTICIPANT_ID, role: 'member' });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/mark-read`,
      headers: { authorization: AUTH_HEADER },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['deprecation']).toMatch(/^@\d+$/);
    expect(res.headers['link']).toBe(linkFor(`/api/v1/conversations/${CONV_ID}/receipts`));
    expect(res.headers['sunset']).toBeUndefined();

    await app.close();
  });

  it("l'annonce part MÊME sur un refus (403, non membre) — c'est l'ADRESSE qui est en sursis", async () => {
    const app = buildApp(null);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/mark-read`,
      headers: { authorization: AUTH_HEADER },
      payload: {},
    });

    expect(res.statusCode).toBe(403);
    expect(res.headers['deprecation']).toMatch(/^@\d+$/);
    expect(res.headers['link']).toBe(linkFor(`/api/v1/conversations/${CONV_ID}/receipts`));

    await app.close();
  });

  it('le successeur porte le VRAI id de la requête, jamais un gabarit `:id`', async () => {
    const otherConvId = '507f1f77bcf86cd799439099';
    mockResolveConversationId.mockResolvedValue(otherConvId);
    const app = buildApp({ id: PARTICIPANT_ID, role: 'member' });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${otherConvId}/mark-read`,
      headers: { authorization: AUTH_HEADER },
      payload: {},
    });

    expect(res.headers['link']).toBe(linkFor(`/api/v1/conversations/${otherConvId}/receipts`));

    await app.close();
  });
});
