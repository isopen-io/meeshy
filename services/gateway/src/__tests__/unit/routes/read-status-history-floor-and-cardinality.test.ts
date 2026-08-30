/**
 * Route tests — #4179 : plancher d'historique, cardinalité et débit des DEUX
 * lectures de `message-read-status.ts`.
 *
 * `GET /conversations/:id/status` (messages-advanced.ts, hors territoire de
 * cette issue) applique déjà le plancher d'historique du lecteur et borne le
 * débit d'écriture à 120/min — mais AUCUNE des deux lectures de CE fichier ne
 * le faisait, alors qu'elles rendent la MÊME sorte de donnée : un accusé
 * NOMINATIF (qui a reçu/lu un message précis, et quand) est de l'historique
 * au même titre que le texte du message lui-même. Un membre pouvait donc
 * interroger le statut d'un message envoyé avant son arrivée (ou avant la
 * date que son octroi d'admin autorise), et `GET …/read-statuses` n'avait de
 * surcroît AUCUNE borne sur le nombre de `messageIds` demandés en une seule
 * requête (chaîne CSV validée id par id, jamais en cardinalité).
 *
 * Les témoins ci-dessous posent le plancher sur les DEUX routes qui ne
 * l'avaient PAS — les poser sur `GET /conversations/:id/status`, qui
 * l'applique déjà, ne prouverait rien (§ critère 8 de l'issue).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import messageReadStatusRoutes from '../../../routes/message-read-status';

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const MESSAGE_ID = '507f1f77bcf86cd799439013';
const PARTICIPANT_ID = '507f1f77bcf86cd799439011';
const USER_ID = 'user-history-floor-1';
const AUTH_HEADER = 'Bearer test-token';
// Plancher fixé au 1er juin 2024 — les messages testés se placent nettement
// avant ou après pour ne dépendre d'aucune limite de zone horaire.
const HISTORY_FLOOR = new Date('2024-06-01T00:00:00Z');
const BEFORE_FLOOR = new Date('2024-01-01T00:00:00Z');
const AFTER_FLOOR = new Date('2024-09-01T00:00:00Z');

// --- module mocks (préfixe `mock` requis par le hoisting de jest) ---

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args)
}));

jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({
    shouldShowReadReceipts: jest.fn().mockResolvedValue(false)
  }))
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (request: any, reply: any) => {
    if (!request.headers['authorization']) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    }
    request.authContext = { userId: USER_ID, type: 'registered', hasFullAccess: true };
  }
}));

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn()
}));

const mockGetMessageReadStatus = jest.fn();
const mockGetConversationReadStatuses = jest.fn();

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getMessageReadStatus: mockGetMessageReadStatus,
    getConversationReadStatuses: mockGetConversationReadStatuses,
    getUnreadCount: jest.fn(),
    markMessagesAsRead: jest.fn(),
    markMessagesAsReceived: jest.fn()
  }))
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
  }
}));

// --- Prisma mocké ---

const mockPrisma: any = {
  participant: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn()
  },
  message: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn()
  },
  conversationReadCursor: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn()
  }
};

/**
 * Ligne `Participant` qui décide d'un plancher AUTRE que `null`, sans avoir
 * besoin de mocker `conversationShareLink` (hors du `Pick<PrismaClient, …>`
 * que `loadReaderHistoryFloor` déclare) : un octroi `canViewHistory: false`
 * se règle avant toute lecture de lien (`historyFloor.ts`,
 * `settleBeforeLink`), le plancher devenant `joinedAt`. La MÊME ligne sert
 * les DEUX lectures que `resolveCallerParticipant` et `loadReaderHistoryFloor`
 * font sur `participant.findFirst` — Prisma étant mocké, aucune des deux ne
 * filtre par `select`.
 */
function restrictedParticipant() {
  return {
    id: PARTICIPANT_ID,
    role: 'member',
    joinedAt: HISTORY_FLOOR,
    shareLinkId: null,
    historyVisibleFrom: null,
    permissions: { canViewHistory: false },
    anonymousSession: null,
    user: null
  };
}

// ===========================================================================
// 1. Débit — 120/min, pas 30
// ===========================================================================

/**
 * #4349 critère 6 — le débit des écritures est DÉCLARÉ par route
 * (`config.rateLimit`, @fastify/rate-limit) depuis que les quatre portes de ce
 * fichier sont des adaptateurs de la collection. La configuration se relève
 * donc au `onRoute`, sur ce que Fastify a réellement enregistré, plutôt qu'en
 * doublant la fabrique de limiteur.
 *
 * Trois faits, et le deuxième est celui qu'on oublie : `hook: 'preHandler'`.
 * Sans lui, `config.rateLimit` s'évalue au hook `onRequest`, AVANT que
 * `unifiedAuth` (posé en `preValidation`) n'écrive `authContext` — le
 * générateur retombe alors sur l'IP et la clé « par compte » est une fiction.
 * La MESURE de bout en bout, sur le vrai plugin et deux comptes derrière une
 * seule adresse, vit dans `conversation-receipts.test.ts`.
 */
describe('#4349 — le débit des écritures : 120/min, par COMPTE, hook preHandler', () => {
  const captured: Array<{ method: string; url: string; config: any }> = [];

  beforeAll(async () => {
    captured.length = 0;
    const app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);
    app.addHook('onRoute', (routeOptions: any) => {
      captured.push({ method: routeOptions.method, url: routeOptions.url, config: routeOptions.config });
    });
    await app.register(messageReadStatusRoutes);
    await app.ready();
    await app.close();
  });

  const WRITE_ROUTES = [
    '/conversations/:conversationId/mark-as-read',
    '/conversations/:conversationId/mark-as-received',
    '/conversations/:conversationId/messages/:messageId/delivery-receipt'
  ];

  it('les TROIS écritures déclarent 120/min, pas 30', () => {
    for (const url of WRITE_ROUTES) {
      const route = captured.find((r) => r.method === 'POST' && r.url === url);
      expect(route).toBeDefined();
      expect(route?.config?.rateLimit?.max).toBe(120);
      expect(route?.config?.rateLimit?.max).not.toBe(30);
      expect(route?.config?.rateLimit?.timeWindow).toBe('1 minute');
    }
  });

  it('la clé est le COMPTE et le hook est `preHandler` — sans quoi elle serait une fiction', () => {
    for (const url of WRITE_ROUTES) {
      const cfg = captured.find((r) => r.method === 'POST' && r.url === url)?.config?.rateLimit;
      expect(cfg?.hook).toBe('preHandler');

      const keyForAuthed = cfg.keyGenerator({ authContext: { userId: 'user-x' }, ip: '203.0.113.9' });
      const keyForAnon = cfg.keyGenerator({ authContext: undefined, ip: '203.0.113.9' });
      expect(keyForAuthed).toContain('user-x');
      expect(keyForAuthed).not.toContain('203.0.113.9');
      // Le repli IP reste LÉGITIME là où l'appelant peut n'avoir aucun compte.
      expect(keyForAnon).toContain('203.0.113.9');
    }
  });

  it("aucun bypass d'adresse : la configuration ne porte ni `skip` ni `allowList`", () => {
    for (const url of WRITE_ROUTES) {
      const cfg = captured.find((r) => r.method === 'POST' && r.url === url)?.config?.rateLimit;
      expect(cfg?.skip).toBeUndefined();
      expect(cfg?.allowList).toBeUndefined();
    }
  });
});

// ===========================================================================
// 2. GET /messages/:messageId/read-status — plancher d'historique
// ===========================================================================

describe('#4179 — GET /messages/:messageId/read-status respecte le plancher d\'historique', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);
    await app.register(messageReadStatusRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.participant.findFirst.mockResolvedValue(restrictedParticipant());
    mockGetMessageReadStatus.mockResolvedValue({ messageId: MESSAGE_ID, readCount: 1, deliveredCount: 2 });
  });

  it('rend 404 pour un message antérieur au plancher — sans jamais appeler le service', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      id: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      createdAt: BEFORE_FLOOR
    });

    const response = await app.inject({
      method: 'GET',
      url: `/messages/${MESSAGE_ID}/read-status`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(404);
    expect(mockGetMessageReadStatus).not.toHaveBeenCalled();
  });

  it('sert un message postérieur au plancher normalement', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      id: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      createdAt: AFTER_FLOOR
    });

    const response = await app.inject({
      method: 'GET',
      url: `/messages/${MESSAGE_ID}/read-status`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(200);
    expect(mockGetMessageReadStatus).toHaveBeenCalledWith(MESSAGE_ID, CONVERSATION_ID);
  });

  it('sert normalement un membre SANS restriction (plancher null — pas de régression)', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });
    mockPrisma.message.findUnique.mockResolvedValue({
      id: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      createdAt: BEFORE_FLOOR
    });

    const response = await app.inject({
      method: 'GET',
      url: `/messages/${MESSAGE_ID}/read-status`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(200);
    expect(mockGetMessageReadStatus).toHaveBeenCalledWith(MESSAGE_ID, CONVERSATION_ID);
  });
});

// ===========================================================================
// 3. GET /conversations/:conversationId/read-statuses — plancher + cardinalité
// ===========================================================================

describe('#4179 — GET /conversations/:conversationId/read-statuses', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);
    await app.register(messageReadStatusRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
    mockPrisma.participant.findFirst.mockResolvedValue(restrictedParticipant());
    mockGetConversationReadStatuses.mockResolvedValue(new Map());
  });

  it('transmet le plancher calculé au service, pas null, pour un lecteur restreint', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses?messageIds=${MESSAGE_ID}`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(200);
    expect(mockGetConversationReadStatuses).toHaveBeenCalledWith(
      CONVERSATION_ID,
      [MESSAGE_ID],
      HISTORY_FLOOR
    );
  });

  it('refuse au-delà de 100 messageIds avec 400 — sans appeler le service', async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `507f1f77bcf86cd7994${String(39100 + i).padStart(5, '0')}`);

    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses?messageIds=${tooMany.join(',')}`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(400);
    expect(mockGetConversationReadStatuses).not.toHaveBeenCalled();
  });

  it('accepte exactement 100 messageIds', async () => {
    const exactlyMax = Array.from({ length: 100 }, (_, i) => `507f1f77bcf86cd7994${String(39100 + i).padStart(5, '0')}`);

    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses?messageIds=${exactlyMax.join(',')}`,
      headers: { authorization: AUTH_HEADER }
    });

    expect(response.statusCode).toBe(200);
    expect(mockGetConversationReadStatuses).toHaveBeenCalled();
  });
});
