/**
 * Route tests — le suivi de lecture d'un participant SANS COMPTE.
 *
 * Un invité de lien partagé est un participant de plein droit : il lit, il
 * envoie, il réagit. Le serveur compte même ses non-lus et lui pousse le badge
 * dans sa room personnelle (`ROOMS.user(userId ?? id)`, rejointe par
 * `AuthHandler` pour les sockets anonymes). Il ne lui manquait que la moitié qui
 * REMET LE BADGE À ZÉRO, et elle lui manquait deux fois :
 *
 *   1. la porte — `allowAnonymous: false` répondait 403 avant de regarder la
 *      conversation ;
 *   2. la clé — chaque garde d'appartenance filtrait `Participant.userId` avec
 *      `authContext.userId`, qui vaut un **Participant.id** pour un anonyme
 *      (`middleware/auth.ts`). La comparaison n'appariait donc rien.
 *
 * Ces tests verrouillent les deux moitiés. Le double Prisma APPARIE RÉELLEMENT
 * le `where` : une garde revenue à `userId` seul ne trouve plus le participant
 * et le test rougit, ce qu'un `mockResolvedValue` constant n'aurait jamais vu.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import messageReadStatusRoutes from '../../../routes/message-read-status';
import { findFirstIn, type MongoDocument } from '../../helpers/mongo-where';

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const MESSAGE_ID = '507f1f77bcf86cd799439013';
const ANONYMOUS_PARTICIPANT_ID = '507f1f77bcf86cd799439088';
const REGISTERED_USER_ID = '507f1f77bcf86cd799439077';
const REGISTERED_PARTICIPANT_ID = '507f1f77bcf86cd799439066';
const UNREAD_COUNT = 4;

// --- module mocks (le préfixe `mock` est requis par le hoisting de jest) ---

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args)
}));

const mockShouldShowReadReceipts = jest.fn();
jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({
    shouldShowReadReceipts: mockShouldShowReadReceipts
  }))
}));

/**
 * Le contexte d'auth est mutable pour que chaque test choisisse SON appelant.
 * `mockAuthOptions` capture les options du middleware : c'est la seule façon de
 * verrouiller `allowAnonymous` sans monter la vraie chaîne d'authentification.
 */
const mockAuthContext: { current: Record<string, unknown> } = { current: {} };
const mockAuthOptions: Array<Record<string, unknown>> = [];
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (_prisma: unknown, options: Record<string, unknown>) => {
    mockAuthOptions.push(options);
    return async (request: any) => {
      request.authContext = mockAuthContext.current;
    };
  }
}));

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn()
}));

const mockGetMessageReadStatus = jest.fn();
const mockGetConversationReadStatuses = jest.fn();
const mockGetUnreadCount = jest.fn();
const mockMarkMessagesAsRead = jest.fn();
const mockMarkMessagesAsReceived = jest.fn();
const mockGetLatestMessageSummary = jest.fn();
jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getMessageReadStatus: mockGetMessageReadStatus,
    getConversationReadStatuses: mockGetConversationReadStatuses,
    getUnreadCount: mockGetUnreadCount,
    markMessagesAsRead: mockMarkMessagesAsRead,
    markMessagesAsReceived: mockMarkMessagesAsReceived,
    getLatestMessageSummary: mockGetLatestMessageSummary
  }))
}));

jest.mock('../../../utils/rate-limiter', () => ({
  createCustomRateLimiter: () => ({
    middleware: () => async () => undefined
  })
}));

// --- double Prisma : deux lignes `Participant`, appariées pour de vrai ---
//
// `findFirstIn` ÉVALUE le `where` (helpers/mongo-where) : une garde revenue à
// `userId` seul cesse de trouver la ligne anonyme, et le test le voit. Aucune
// ligne ne porte `bannedAt` — c'est la branche `isSet: false` d'`unsetOrNull`
// qui l'apparie, exactement comme en base.

const ROWS: MongoDocument[] = [
  { id: ANONYMOUS_PARTICIPANT_ID, userId: null, conversationId: CONVERSATION_ID, isActive: true },
  { id: REGISTERED_PARTICIPANT_ID, userId: REGISTERED_USER_ID, conversationId: CONVERSATION_ID, isActive: true }
];

const participantFindFirst = jest.fn(findFirstIn(ROWS));

const mockPrisma: any = {
  participant: { findFirst: participantFindFirst, findMany: jest.fn(), findUnique: jest.fn() },
  message: { findUnique: jest.fn(), findFirst: jest.fn(), count: jest.fn(), findMany: jest.fn() },
  messageStatusEntry: { findMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn() },
  conversationReadCursor: {
    upsert: jest.fn(), updateMany: jest.fn(), create: jest.fn(),
    findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn()
  }
};

function anonymousContext() {
  return {
    type: 'anonymous',
    isAuthenticated: true,
    isAnonymous: true,
    participantId: ANONYMOUS_PARTICIPANT_ID,
    // C'est le piège que ces tests verrouillent : `userId` porte un
    // `Participant.id` pour un anonyme.
    userId: ANONYMOUS_PARTICIPANT_ID,
    hasFullAccess: false
  };
}

function registeredContext() {
  return {
    type: 'user',
    isAuthenticated: true,
    isAnonymous: false,
    userId: REGISTERED_USER_ID,
    hasFullAccess: true
  };
}

describe('read-status routes — un participant sans compte', () => {
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
    participantFindFirst.mockClear();
    mockResolveConversationId.mockReset().mockResolvedValue(CONVERSATION_ID);
    mockShouldShowReadReceipts.mockReset().mockResolvedValue(false);
    mockGetUnreadCount.mockReset().mockResolvedValue(UNREAD_COUNT);
    mockMarkMessagesAsRead.mockReset().mockResolvedValue(undefined);
    mockMarkMessagesAsReceived.mockReset().mockResolvedValue(undefined);
    mockGetLatestMessageSummary.mockReset().mockResolvedValue(null);
    mockGetConversationReadStatuses.mockReset().mockResolvedValue(new Map([[MESSAGE_ID, { readBy: [] }]]));
    mockGetMessageReadStatus.mockReset().mockResolvedValue({ readBy: [] });
    mockPrisma.message.findUnique.mockReset().mockResolvedValue({ id: MESSAGE_ID, conversationId: CONVERSATION_ID, senderId: 'someone-else' });
    mockPrisma.participant.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.participant.findUnique.mockReset().mockResolvedValue(null);
    mockAuthContext.current = anonymousContext();
  });

  it('ouvre la porte aux participants sans compte (allowAnonymous), sans ouvrir aux non-authentifiés', () => {
    expect(mockAuthOptions).not.toHaveLength(0);
    for (const options of mockAuthOptions) {
      expect(options).toMatchObject({ requireAuth: true, allowAnonymous: true });
    }
  });

  it('mark-as-read résout l\'appelant par Participant.id, jamais par la colonne userId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.markedCount).toBe(UNREAD_COUNT);
    expect(mockMarkMessagesAsRead).toHaveBeenCalledWith(
      ANONYMOUS_PARTICIPANT_ID,
      CONVERSATION_ID,
      undefined,
      undefined
    );
    const wheres = participantFindFirst.mock.calls.map((call: any) => call[0].where);
    expect(wheres).toContainEqual(expect.objectContaining({ id: ANONYMOUS_PARTICIPANT_ID }));
    expect(wheres.every((where: any) => where.userId === undefined)).toBe(true);
  });

  it('mark-as-received avance le curseur du participant sans compte', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-received`
    });

    expect(response.statusCode).toBe(200);
    expect(mockMarkMessagesAsReceived).toHaveBeenCalledWith(ANONYMOUS_PARTICIPANT_ID, CONVERSATION_ID);
  });

  it('read-statuses répond au participant sans compte', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses?messageIds=${MESSAGE_ID}`
    });

    expect(response.statusCode).toBe(200);
  });

  it('le statut de lecture d\'un message reste lisible par le participant sans compte', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/messages/${MESSAGE_ID}/read-status`
    });

    expect(response.statusCode).toBe(200);
  });

  it('les préférences de confidentialité d\'un anonyme sont demandées EN TANT QU\'anonyme', async () => {
    await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    expect(mockShouldShowReadReceipts).toHaveBeenCalledWith(ANONYMOUS_PARTICIPANT_ID, true);
  });

  it('refuse un participant sans compte étranger à la conversation', async () => {
    mockAuthContext.current = { ...anonymousContext(), participantId: 'un-participant-ailleurs', userId: 'un-participant-ailleurs' };

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    expect(response.statusCode).toBe(403);
  });

  it('un utilisateur enregistré reste résolu par sa colonne userId', async () => {
    mockAuthContext.current = registeredContext();

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    expect(response.statusCode).toBe(200);
    expect(mockMarkMessagesAsRead).toHaveBeenCalledWith(
      REGISTERED_PARTICIPANT_ID,
      CONVERSATION_ID,
      undefined,
      undefined
    );
    expect(mockShouldShowReadReceipts).toHaveBeenCalledWith(REGISTERED_USER_ID, false);
  });
});
