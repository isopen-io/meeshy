/**
 * La COLLECTION unique d'accusés — `POST` / `GET
 * /conversations/:conversationId/receipts` (#4349, suivi de #4179).
 *
 * Ce fichier mesure les SIX critères de l'issue, et rien d'autre. Trois règles
 * de méthode le gouvernent :
 *
 * 1. **tout témoin de lecture traverse le sérialiseur** — `app.inject()` sur un
 *    vrai Fastify, avec les schémas de réponse réels — et NOMME au moins un
 *    champ de `data` : `statusCode` n'est pas une observation de la charge
 *    utile. C'est le défaut exact que #4179 a relevé sur `POST
 *    /conversations/:id/read`, dont le `{ markedCount }` était supprimé par son
 *    propre schéma 200 sans que personne ne s'en aperçoive ;
 * 2. **chaque garde est EXERCÉE**, jamais seulement déclarée ;
 * 3. **la parité clé à clé** entre chaque porte historique et son adaptateur —
 *    c'est elle qui autorisera le retrait des adresses historiques plus tard.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

import { conversationReceiptsRoutes } from '../../../routes/conversations/receipts';
import messageReadStatusRoutes from '../../../routes/message-read-status';

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const OTHER_CONVERSATION_ID = '507f1f77bcf86cd7994390ff';
const MESSAGE_ID = '507f1f77bcf86cd799439013';
const SECOND_MESSAGE_ID = '507f1f77bcf86cd799439014';
const PARTICIPANT_ID = '507f1f77bcf86cd799439011';
const SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439099';
const USER_ID = 'user-receipts-1';

/** DÉLIBÉRÉMENT distinct de `UNREAD_COUNT` — voir le critère 4. */
const FROZEN_COUNT = 6;
const UNREAD_COUNT = 2;

// --- doubles de module (le préfixe `mock` est requis par le hoisting) --------

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args),
}));

const mockShouldShowReadReceipts = jest.fn<any>();
jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({
    shouldShowReadReceipts: mockShouldShowReadReceipts,
  })),
}));

/**
 * Auth pilotable PAR REQUÊTE via un en-tête de test : une SEULE application
 * (donc un seul magasin de compteurs) doit pouvoir servir deux comptes
 * distincts — c'est ce qui rend mesurable la clé du limiteur au critère 6.
 */
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (request: any, reply: any) => {
    if (!request.headers['authorization']) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' });
    }
    const asUser = (request.headers['x-test-user-id'] as string) ?? USER_ID;
    request.authContext = {
      userId: asUser,
      type: 'registered',
      isAnonymous: false,
      hasFullAccess: true,
    };
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => ({ PrismaClient: jest.fn() }));

const mockMarkMessagesAsRead = jest.fn<any>();
const mockMarkMessagesAsReceived = jest.fn<any>();
const mockGetUnreadCount = jest.fn<any>();
const mockGetConversationReadStatuses = jest.fn<any>();
const mockGetMessageStatusDetails = jest.fn<any>();
const mockFilterReadReceiptVisible = jest.fn<any>();
const mockGetLatestMessageSummary = jest.fn<any>();
const mockGetMessageReadStatus = jest.fn<any>();

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    markMessagesAsRead: mockMarkMessagesAsRead,
    markMessagesAsReceived: mockMarkMessagesAsReceived,
    getUnreadCount: mockGetUnreadCount,
    getConversationReadStatuses: mockGetConversationReadStatuses,
    getMessageStatusDetails: mockGetMessageStatusDetails,
    filterReadReceiptVisible: mockFilterReadReceiptVisible,
    getLatestMessageSummary: mockGetLatestMessageSummary,
    getMessageReadStatus: mockGetMessageReadStatus,
  })),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

// --- Prisma doublé -----------------------------------------------------------

const mockPrisma: any = {
  participant: { findFirst: jest.fn<any>(), findMany: jest.fn<any>(), findUnique: jest.fn<any>() },
  message: { findFirst: jest.fn<any>(), findMany: jest.fn<any>(), findUnique: jest.fn<any>(), count: jest.fn<any>() },
  conversationReadCursor: { findUnique: jest.fn<any>(), findMany: jest.fn<any>(), upsert: jest.fn<any>(), update: jest.fn<any>(), updateMany: jest.fn<any>() },
};

const AUTH = { authorization: 'Bearer test-token' };

/**
 * Un message VIVANT de cette conversation, dont l'appelant n'est PAS
 * l'expéditeur — l'état nominal que la garde d'appartenance doit laisser passer.
 */
const messageRow = (id: string, senderId = SENDER_PARTICIPANT_ID) => ({
  id,
  senderId,
  createdAt: new Date('2024-06-01T00:00:00Z'),
});

async function buildApp(options: { rateLimited?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', mockPrisma);
  if (options.rateLimited) {
    // Plugin RÉEL, magasin mémoire : rien ne doit retomber sur un défaut global.
    await app.register(rateLimit, { global: false });
  }
  await app.register(conversationReceiptsRoutes);
  await app.ready();
  return app;
}

async function buildLegacyApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', mockPrisma);
  await app.register(messageReadStatusRoutes);
  await app.ready();
  return app;
}

const postReceipt = (app: FastifyInstance, payload: unknown, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'POST',
    url: `/conversations/${CONVERSATION_ID}/receipts`,
    headers: { ...AUTH, ...headers },
    payload: payload as any,
  });

beforeEach(() => {
  jest.clearAllMocks();

  mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
  mockShouldShowReadReceipts.mockResolvedValue(false);

  // Participant SANS restriction d'historique (`shareLinkId: null` ⇒ plancher
  // réglé avant toute lecture de lien, donc `null`).
  mockPrisma.participant.findFirst.mockResolvedValue({
    id: PARTICIPANT_ID,
    role: 'member',
    joinedAt: new Date('2020-01-01T00:00:00Z'),
    shareLinkId: null,
    historyVisibleFrom: null,
    permissions: null,
    anonymousSession: null,
    user: null,
  });
  mockPrisma.participant.findMany.mockResolvedValue([]);
  mockPrisma.message.findMany.mockImplementation(async (args: any) =>
    (args?.where?.id?.in ?? []).map((id: string) => messageRow(id))
  );
  mockPrisma.message.findFirst.mockResolvedValue(messageRow(MESSAGE_ID));

  mockMarkMessagesAsRead.mockResolvedValue(FROZEN_COUNT);
  mockMarkMessagesAsReceived.mockResolvedValue(FROZEN_COUNT);
  mockGetUnreadCount.mockResolvedValue(UNREAD_COUNT);
  mockGetConversationReadStatuses.mockResolvedValue(new Map());
  mockGetMessageStatusDetails.mockResolvedValue({
    statuses: [],
    pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
  });
  mockFilterReadReceiptVisible.mockImplementation(async (rows: any[]) => rows);
  mockGetLatestMessageSummary.mockResolvedValue({});
});

// ===========================================================================
// Critère 1 — POST …/receipts est l'écriture UNIQUE
// ===========================================================================

describe('#4349 critère 1 — POST /conversations/:conversationId/receipts', () => {
  it('sert `{ type, markedCount, unreadCount }` À TRAVERS le sérialiseur', async () => {
    const app = await buildApp();

    const response = await postReceipt(app, { type: 'read' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    // Les TROIS clés du contrat, nommées — pas un `statusCode` seul : le défaut
    // de `POST …/read` (#4179) était un `data` supprimé par son propre schéma.
    expect(body.data).toEqual({
      type: 'read',
      markedCount: FROZEN_COUNT,
      unreadCount: UNREAD_COUNT,
    });
  });

  it('accepte les trois `type` et refuse tout autre mot', async () => {
    const app = await buildApp();

    for (const type of ['read', 'received', 'delivered'] as const) {
      const response = await postReceipt(app, { type, messageIds: [MESSAGE_ID] });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.type).toBe(type);
    }

    const refused = await postReceipt(app, { type: 'skimmed' });
    expect(refused.statusCode).toBe(400);
  });

  it('transmet la langue et les exceptions par message au marquage exact', async () => {
    const app = await buildApp();

    const response = await postReceipt(app, {
      type: 'read',
      messageIds: [MESSAGE_ID],
      language: 'fr',
      messageLanguages: { [MESSAGE_ID]: 'en' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockMarkMessagesAsRead).toHaveBeenCalledWith(
      PARTICIPANT_ID,
      CONVERSATION_ID,
      undefined,
      expect.objectContaining({
        messageIds: [MESSAGE_ID],
        language: 'fr',
        messageLanguages: { [MESSAGE_ID]: 'en' },
      })
    );
  });
});

// ===========================================================================
// Critère 2 — GET …/receipts est la lecture UNIQUE
// ===========================================================================

describe('#4349 critère 2 — GET /conversations/:conversationId/receipts', () => {
  const get = (app: FastifyInstance, query: string) =>
    app.inject({ method: 'GET', url: `/conversations/${CONVERSATION_ID}/receipts?${query}`, headers: AUTH });

  it('detail=summary rend une carte par messageId, dates SÉRIALISÉES', async () => {
    mockGetConversationReadStatuses.mockResolvedValue(
      new Map([
        [
          MESSAGE_ID,
          {
            totalMembers: 4,
            receivedCount: 3,
            readCount: 2,
            deliveredToAllAt: new Date('2026-08-01T12:00:00.000Z'),
            readByAllAt: null,
          },
        ],
      ])
    );
    const app = await buildApp();

    const response = await get(app, `messageIds=${MESSAGE_ID}`);

    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.detail).toBe('summary');
    expect(data.messageIds).toEqual([MESSAGE_ID]);
    expect(data.summary[MESSAGE_ID]).toEqual({
      totalMembers: 4,
      receivedCount: 3,
      readCount: 2,
      deliveredToAllAt: '2026-08-01T12:00:00.000Z',
      readByAllAt: null,
    });
  });

  it('scope=recent résout lui-même les messages récents, sans messageIds', async () => {
    mockPrisma.message.findMany.mockResolvedValue([{ id: MESSAGE_ID }, { id: SECOND_MESSAGE_ID }]);
    const app = await buildApp();

    const response = await get(app, 'scope=recent');

    expect(response.statusCode).toBe(200);
    expect(response.json().data.messageIds).toEqual([MESSAGE_ID, SECOND_MESSAGE_ID]);
  });

  it('detail=people rend la liste NOMINATIVE paginée et son curseur', async () => {
    mockGetMessageStatusDetails.mockResolvedValue({
      statuses: [
        {
          participantId: PARTICIPANT_ID,
          displayName: 'Alice',
          avatar: null,
          deliveredAt: new Date('2026-08-01T12:00:00.000Z'),
          receivedAt: new Date('2026-08-01T12:00:00.000Z'),
          readAt: null,
          readDevice: 'ios',
        },
      ],
      pagination: { total: 3, limit: 1, offset: 0, hasMore: true },
    });
    mockPrisma.participant.findMany.mockResolvedValue([{ id: PARTICIPANT_ID, userId: USER_ID }]);
    const app = await buildApp();

    const response = await get(app, `messageIds=${MESSAGE_ID}&detail=people&limit=1`);

    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.detail).toBe('people');
    expect(data.people).toHaveLength(1);
    expect(data.people[0]).toMatchObject({
      participantId: PARTICIPANT_ID,
      displayName: 'Alice',
      deliveredAt: '2026-08-01T12:00:00.000Z',
      readAt: null,
      readDevice: 'ios',
    });
    expect(data.pagination).toMatchObject({ total: 3, hasMore: true });
    expect(typeof data.pagination.nextCursor).toBe('string');
  });

  it('le curseur rendu ramène la page SUIVANTE au service', async () => {
    mockGetMessageStatusDetails.mockResolvedValue({
      statuses: [],
      pagination: { total: 3, limit: 1, offset: 0, hasMore: true },
    });
    const app = await buildApp();

    const first = await get(app, `messageIds=${MESSAGE_ID}&detail=people&limit=1`);
    const cursor = first.json().data.pagination.nextCursor;

    await get(app, `messageIds=${MESSAGE_ID}&detail=people&limit=1&cursor=${cursor}`);

    expect(mockGetMessageStatusDetails).toHaveBeenLastCalledWith(
      MESSAGE_ID,
      expect.objectContaining({ offset: 1, limit: 1 })
    );
  });

  it('`filter` traverse jusqu’au service', async () => {
    const app = await buildApp();

    await get(app, `messageIds=${MESSAGE_ID}&detail=people&filter=read`);

    expect(mockGetMessageStatusDetails).toHaveBeenCalledWith(
      MESSAGE_ID,
      expect.objectContaining({ filter: 'read' })
    );
  });

  it('If-None-Match rend 304 sur une charge inchangée, et 200 sinon', async () => {
    const app = await buildApp();

    const first = await get(app, `messageIds=${MESSAGE_ID}`);
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();

    const revalidated = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/receipts?messageIds=${MESSAGE_ID}`,
      headers: { ...AUTH, 'if-none-match': etag },
    });
    expect(revalidated.statusCode).toBe(304);

    const stale = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/receipts?messageIds=${MESSAGE_ID}`,
      headers: { ...AUTH, 'if-none-match': '"un-autre-validateur"' },
    });
    expect(stale.statusCode).toBe(200);
    expect(stale.json().data.detail).toBe('summary');
  });
});

// ===========================================================================
// Critère 3 — les gardes COMMUNES, chacune EXERCÉE
// ===========================================================================

describe('#4349 critère 3 — les gardes communes', () => {
  /**
   * L'anti-spoof que SEULE `delivery-receipt` portait. Exercé depuis un compte
   * qui n'est PAS l'expéditeur : ce qui refuse est donc bien l'APPARTENANCE de
   * l'id à la conversation, jamais la propriété du message — deux règles que le
   * même témoin confondrait s'il partait de l'expéditeur.
   */
  it("un messageId d'une AUTRE conversation est refusé, pour les TROIS type", async () => {
    const app = await buildApp();
    // La ligne existe, mais pas dans CETTE conversation : le filtre Prisma de la
    // garde ne la rend pas.
    mockPrisma.message.findMany.mockImplementation(async (args: any) =>
      args?.where?.conversationId === OTHER_CONVERSATION_ID ? [messageRow(MESSAGE_ID)] : []
    );

    for (const type of ['read', 'received', 'delivered'] as const) {
      const response = await postReceipt(app, { type, messageIds: [MESSAGE_ID] });
      expect(response.statusCode).toBe(404);
      expect(response.json().success).toBe(false);
    }
    expect(mockMarkMessagesAsRead).not.toHaveBeenCalled();
    expect(mockMarkMessagesAsReceived).not.toHaveBeenCalled();
  });

  it('un `caughtUpToMessageId` étranger est refusé — il pilote un curseur, pas un gel', async () => {
    const app = await buildApp();
    mockPrisma.message.findFirst.mockResolvedValue(null);

    const response = await postReceipt(app, { type: 'read', caughtUpToMessageId: MESSAGE_ID });

    expect(response.statusCode).toBe(404);
    expect(mockMarkMessagesAsRead).not.toHaveBeenCalled();
  });

  it("le PLANCHER d'historique refuse un message antérieur à l'arrivée du lecteur", async () => {
    const app = await buildApp();
    // Participant RESTREINT : `canViewHistory: false` se règle avant toute
    // lecture de lien, le plancher devient donc `joinedAt`.
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: PARTICIPANT_ID,
      role: 'member',
      joinedAt: new Date('2026-01-01T00:00:00Z'),
      shareLinkId: null,
      historyVisibleFrom: null,
      permissions: { canViewHistory: false },
      anonymousSession: null,
      user: null,
    });
    mockPrisma.message.findMany.mockResolvedValue([
      { id: MESSAGE_ID, senderId: SENDER_PARTICIPANT_ID, createdAt: new Date('2020-01-01T00:00:00Z') },
    ]);

    const response = await postReceipt(app, { type: 'read', messageIds: [MESSAGE_ID] });

    expect(response.statusCode).toBe(404);
    expect(mockMarkMessagesAsRead).not.toHaveBeenCalled();
  });

  it("un message de l'APPELANT est ÉCARTÉ, pas refusé — et rien ne part", async () => {
    const app = await buildApp();
    mockPrisma.message.findMany.mockResolvedValue([messageRow(MESSAGE_ID, PARTICIPANT_ID)]);

    const response = await postReceipt(app, { type: 'delivered', messageIds: [MESSAGE_ID] });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.markedCount).toBe(0);
    expect(mockMarkMessagesAsReceived).not.toHaveBeenCalled();
  });

  it('la cardinalité est bornée des DEUX côtés : 201 en écriture, 101 en lecture', async () => {
    const app = await buildApp();

    const tooManyWrites = await postReceipt(app, {
      type: 'read',
      messageIds: Array.from({ length: 201 }, (_, i) => MESSAGE_ID.slice(0, 20) + String(1000 + i)),
    });
    expect(tooManyWrites.statusCode).toBe(400);

    const tooManyReads = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/receipts?messageIds=${Array.from(
        { length: 101 },
        (_, i) => MESSAGE_ID.slice(0, 20) + String(1000 + i)
      ).join(',')}`,
      headers: AUTH,
    });
    expect(tooManyReads.statusCode).toBe(400);
    expect(tooManyReads.json().success).toBe(false);
  });

  it('exactement 200 en écriture et 100 en lecture passent', async () => {
    const app = await buildApp();

    const atWriteCap = await postReceipt(app, {
      type: 'read',
      messageIds: Array.from({ length: 200 }, (_, i) => MESSAGE_ID.slice(0, 20) + String(1000 + i)),
    });
    expect(atWriteCap.statusCode).toBe(200);

    const atReadCap = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/receipts?messageIds=${Array.from(
        { length: 100 },
        (_, i) => MESSAGE_ID.slice(0, 20) + String(1000 + i)
      ).join(',')}`,
      headers: AUTH,
    });
    expect(atReadCap.statusCode).toBe(200);
    expect(atReadCap.json().data.detail).toBe('summary');
  });

  it('`detail=people` passe SYSTÉMATIQUEMENT par filterReadReceiptVisible', async () => {
    mockGetMessageStatusDetails.mockResolvedValue({
      statuses: [
        { participantId: PARTICIPANT_ID, displayName: 'Alice', avatar: null, deliveredAt: null, receivedAt: null, readAt: null, readDevice: null },
        { participantId: SENDER_PARTICIPANT_ID, displayName: 'Bob', avatar: null, deliveredAt: null, receivedAt: null, readAt: null, readDevice: null },
      ],
      pagination: { total: 2, limit: 20, offset: 0, hasMore: false },
    });
    mockPrisma.participant.findMany.mockResolvedValue([
      { id: PARTICIPANT_ID, userId: USER_ID },
      { id: SENDER_PARTICIPANT_ID, userId: 'user-opted-out' },
    ]);
    // Bob a coupé ses accusés : la garde le retire, et le témoin le CONSTATE sur
    // la charge SERVIE, pas sur l'appel.
    mockFilterReadReceiptVisible.mockResolvedValue([{ id: PARTICIPANT_ID, userId: USER_ID }]);
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/receipts?messageIds=${MESSAGE_ID}&detail=people`,
      headers: AUTH,
    });

    expect(mockFilterReadReceiptVisible).toHaveBeenCalled();
    const names = response.json().data.people.map((row: { displayName: string }) => row.displayName);
    expect(names).toEqual(['Alice']);
  });

  it('un non-participant est refusé (403) et rien ne part au marquage', async () => {
    const app = await buildApp();
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    const response = await postReceipt(app, { type: 'read' });

    expect(response.statusCode).toBe(403);
    expect(mockMarkMessagesAsRead).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Critère 4 — `markedCount` a UNE définition
// ===========================================================================

describe('#4349 critère 4 — markedCount est le nombre RÉELLEMENT FIGÉ', () => {
  it('markedCount suit le marquage, jamais le compte de non-lus', async () => {
    const app = await buildApp();

    const response = await postReceipt(app, { type: 'read' });

    const data = response.json().data;
    expect(data.markedCount).toBe(FROZEN_COUNT);
    // La grandeur que ce nom désignait AVANT #4349 sur `mark-as-received` (et en
    // mode fenêtre sur `mark-read` / `mark-as-read`) : le compte de non-lus.
    // Elle existe toujours — sous son propre nom.
    expect(data.markedCount).not.toBe(UNREAD_COUNT);
    expect(data.unreadCount).toBe(UNREAD_COUNT);
  });

  it('`read` et `received` rendent le MÊME markedCount sur le MÊME état figé', async () => {
    const app = await buildApp();
    mockMarkMessagesAsRead.mockResolvedValue(3);
    mockMarkMessagesAsReceived.mockResolvedValue(3);

    const read = await postReceipt(app, { type: 'read', messageIds: [MESSAGE_ID] });
    const received = await postReceipt(app, { type: 'received' });

    expect(read.json().data.markedCount).toBe(3);
    expect(received.json().data.markedCount).toBe(3);
  });

  it('le compte servi est celui que le service REND, pas la taille du lot rapporté', async () => {
    const app = await buildApp();
    // Deux ids rapportés, UNE seule entrée réellement figée (l'autre l'était
    // déjà) : c'est la différence que « le nombre d'ids » masquerait.
    mockMarkMessagesAsRead.mockResolvedValue(1);

    const response = await postReceipt(app, {
      type: 'read',
      messageIds: [MESSAGE_ID, SECOND_MESSAGE_ID],
    });

    expect(response.json().data.markedCount).toBe(1);
    expect(response.json().data.markedCount).not.toBe(2);
  });
});

// ===========================================================================
// Critère 5 — `delivered` a une branche : plus de 500 déterministe
// ===========================================================================

describe('#4349 critère 5 — type: delivered', () => {
  it("n'est PAS un 500 : la branche existe et sert la charge du contrat", async () => {
    const app = await buildApp();

    const response = await postReceipt(app, { type: 'delivered', messageIds: [MESSAGE_ID] });

    expect(response.statusCode).not.toBe(500);
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      type: 'delivered',
      markedCount: FROZEN_COUNT,
      unreadCount: UNREAD_COUNT,
    });
  });

  it('borne la livraison aux messages RAPPORTÉS, un par un', async () => {
    const app = await buildApp();

    await postReceipt(app, { type: 'delivered', messageIds: [MESSAGE_ID, SECOND_MESSAGE_ID] });

    expect(mockMarkMessagesAsReceived).toHaveBeenCalledWith(PARTICIPANT_ID, CONVERSATION_ID, MESSAGE_ID);
    expect(mockMarkMessagesAsReceived).toHaveBeenCalledWith(PARTICIPANT_ID, CONVERSATION_ID, SECOND_MESSAGE_ID);
  });

  it('sans messageIds, retombe sur la forme CONVERSATION de `received`', async () => {
    const app = await buildApp();

    const response = await postReceipt(app, { type: 'delivered' });

    expect(response.statusCode).toBe(200);
    expect(mockMarkMessagesAsReceived).toHaveBeenCalledWith(PARTICIPANT_ID, CONVERSATION_ID);
  });
});

// ===========================================================================
// Critère 6 — 120/min par COMPTE, hook preHandler, sans bypass d'adresse
// ===========================================================================

describe('#4349 critère 6 — le débit se compte par COMPTE', () => {
  it('la configuration déclare 120/min, `hook: preHandler`, une clé `user:` et aucun bypass', async () => {
    const captured: any[] = [];
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', mockPrisma);
    app.addHook('onRoute', (routeOptions: any) => {
      if (routeOptions.method === 'POST') captured.push(routeOptions.config?.rateLimit);
    });
    await app.register(conversationReceiptsRoutes);
    await app.ready();

    expect(captured).toHaveLength(1);
    const cfg = captured[0];
    expect(cfg.max).toBe(120);
    expect(cfg.max).not.toBe(30);
    expect(cfg.timeWindow).toBe('1 minute');
    // Le hook par DÉFAUT d'@fastify/rate-limit est `onRequest`, qui court avant
    // `preValidation` — donc avant que l'auth ne pose `authContext`. Sans cette
    // ligne, la clé `user:` ci-dessous est une fiction qui compte par adresse.
    expect(cfg.hook).toBe('preHandler');
    expect(cfg.skipOnError).toBe(false);
    // Aucune exemption fondée sur la FORME d'une adresse (`isLocalIp`).
    expect(cfg.skip).toBeUndefined();
    expect(cfg.allowList).toBeUndefined();

    const keyed = cfg.keyGenerator({ authContext: { userId: 'compte-a' }, ip: '203.0.113.9' });
    expect(keyed).toContain('compte-a');
    expect(keyed).not.toContain('203.0.113.9');

    await app.close();
  });

  /**
   * La MESURE, pas la déclaration : DEUX comptes derrière UNE seule adresse, sur
   * le vrai plugin. `app.inject()` sert toutes ses requêtes depuis la même IP —
   * c'est précisément le montage sous lequel une clé retombée sur l'adresse
   * ferait tomber le second compte avec le premier.
   */
  it('deux comptes derrière la MÊME adresse ne partagent pas leur crédit', async () => {
    const app = await buildApp({ rateLimited: true });

    for (let i = 0; i < 120; i++) {
      const ok = await postReceipt(app, { type: 'read' }, { 'x-test-user-id': 'compte-a' });
      expect(ok.statusCode).toBe(200);
    }

    const blockedA = await postReceipt(app, { type: 'read' }, { 'x-test-user-id': 'compte-a' });
    const stillOkB = await postReceipt(app, { type: 'read' }, { 'x-test-user-id': 'compte-b' });

    expect(blockedA.statusCode).toBe(429);
    expect(stillOkB.statusCode).toBe(200);
    expect(stillOkB.json().data.type).toBe('read');

    await app.close();
  });
});

// ===========================================================================
// Parité — chaque porte historique contre son adaptateur
// ===========================================================================

describe('#4349 — parité clé à clé entre les portes historiques et la collection', () => {
  it('mark-as-read sert LES MÊMES clés qu’avant, avec la valeur de la collection', async () => {
    const legacy = await buildLegacyApp();
    const canonical = await buildApp();

    const legacyResponse = await legacy.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`,
      headers: AUTH,
    });
    const canonicalResponse = await postReceipt(canonical, { type: 'read' });

    expect(legacyResponse.statusCode).toBe(200);
    // La forme HISTORIQUE : une seule clé, celle que les clients décodent.
    expect(Object.keys(legacyResponse.json().data)).toEqual(['markedCount']);
    // Et la MÊME valeur que la collection sert sous ce nom.
    expect(legacyResponse.json().data.markedCount).toBe(
      canonicalResponse.json().data.markedCount
    );

    await legacy.close();
    await canonical.close();
  });

  it('mark-as-received sert LES MÊMES clés qu’avant, avec la valeur de la collection', async () => {
    const legacy = await buildLegacyApp();
    const canonical = await buildApp();

    const legacyResponse = await legacy.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-received`,
      headers: AUTH,
    });
    const canonicalResponse = await postReceipt(canonical, { type: 'received' });

    expect(Object.keys(legacyResponse.json().data)).toEqual(['markedCount']);
    expect(legacyResponse.json().data.markedCount).toBe(
      canonicalResponse.json().data.markedCount
    );

    await legacy.close();
    await canonical.close();
  });

  it('delivery-receipt garde son `message`, et distingue toujours le no-op', async () => {
    const legacy = await buildLegacyApp();

    const done = await legacy.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/delivery-receipt`,
      headers: AUTH,
    });
    expect(done.json().data).toEqual({ message: 'Message marqué comme livré' });

    mockPrisma.message.findMany.mockResolvedValue([messageRow(MESSAGE_ID, PARTICIPANT_ID)]);
    const noop = await legacy.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/delivery-receipt`,
      headers: AUTH,
    });
    expect(noop.json().data).toEqual({ message: 'Aucune action requise' });

    await legacy.close();
  });

  it('read-statuses sert la carte NUE, la collection la même carte SOUS `summary`', async () => {
    const row = {
      totalMembers: 4,
      receivedCount: 3,
      readCount: 2,
      deliveredToAllAt: null,
      readByAllAt: null,
    };
    mockGetConversationReadStatuses.mockResolvedValue(new Map([[MESSAGE_ID, row]]));
    const legacy = await buildLegacyApp();
    const canonical = await buildApp();

    const legacyResponse = await legacy.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses?messageIds=${MESSAGE_ID}`,
      headers: AUTH,
    });
    const canonicalResponse = await canonical.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/receipts?messageIds=${MESSAGE_ID}`,
      headers: AUTH,
    });

    expect(legacyResponse.json().data[MESSAGE_ID]).toEqual(row);
    expect(canonicalResponse.json().data.summary[MESSAGE_ID]).toEqual(row);

    await legacy.close();
    await canonical.close();
  });

  it('read-statuses hérite de la cardinalité bornée que la collection porte', async () => {
    const legacy = await buildLegacyApp();

    const response = await legacy.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses?messageIds=${Array.from(
        { length: 101 },
        (_, i) => MESSAGE_ID.slice(0, 20) + String(1000 + i)
      ).join(',')}`,
      headers: AUTH,
    });

    expect(response.statusCode).toBe(400);
    expect(mockGetConversationReadStatuses).not.toHaveBeenCalled();

    await legacy.close();
  });
});
