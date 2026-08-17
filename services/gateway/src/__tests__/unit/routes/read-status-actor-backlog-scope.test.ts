/**
 * Route tests — l'arriéré de l'acteur ne concerne QUE l'acteur.
 *
 * Un `read-status:updated` de type `read` transporte deux champs qui ne
 * décrivent pas la conversation mais UNE personne : `lastReadAt` (sa frontière
 * de lecture) et `unreadCount` (ce qu'il lui reste à lire). Ils existent pour la
 * synchronisation MULTI-APPAREILS de l'acteur — ses autres sessions recalent
 * leur curseur sans refetch.
 *
 * Ils partaient pourtant dans l'ÉVENTAIL : `emitToConversationParticipants`
 * chaîne la room de conversation et la room personnelle de chaque participant
 * actif, donc chaque pair recevait la frontière de lecture et le compteur de
 * non-lus de celui qui vient de lire.
 *
 * Le raisonnement qui l'interdit était déjà écrit dans le fichier, mais appliqué
 * à l'autre branche seulement — le commentaire de la branche `received`
 * justifie l'ABSENCE de ces champs en partie parce qu'ils « divulgueraient
 * inutilement l'arriéré de l'acteur à tous les pairs de la room ». La même
 * phrase vaut mot pour mot pour la branche `read`, où ils SONT diffusés.
 *
 * Rien ne s'y perd : les trois consommateurs qui lisent ces champs les
 * conditionnent tous à « l'acteur, c'est moi » (iOS `ConversationStoreSocketBridge`
 * teste `event.userId == me` ; web et Android ne déclarent même pas les champs).
 * Un pair les recevait donc pour les jeter.
 *
 * Ce que ces tests verrouillent, aux DEUX routes qui diffusent l'événement :
 *   1. le payload de l'éventail ne porte NI `lastReadAt` NI `unreadCount` ;
 *   2. la room personnelle de l'acteur reçoit, elle, la version complète ;
 *   3. l'acteur est EXCLU de l'éventail — sans quoi la room de conversation lui
 *      livrerait une seconde copie, amputée, du même événement ;
 *   4. le résumé (`summary`), lui, reste une donnée de conversation et continue
 *      d'atteindre tout le monde.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import messageReadStatusRoutes from '../../../routes/message-read-status';
import { makeChainableIO } from '../../helpers/chainable-io';
import { findFirstIn, type MongoDocument } from '../../helpers/mongo-where';

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const ACTOR_USER_ID = '507f1f77bcf86cd799439077';
const ACTOR_PARTICIPANT_ID = '507f1f77bcf86cd799439066';
const PEER_USER_ID = '507f1f77bcf86cd799439055';
const PEER_PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const ANONYMOUS_PARTICIPANT_ID = '507f1f77bcf86cd799439088';
const UNREAD_COUNT = 7;
const LAST_READ_AT = new Date('2026-08-15T10:00:00.000Z');

/**
 * Le SEUL nom d'accusé de lecture sur le fil. L'alias
 * `message:read-status-updated`, dual-émis du 2026-07-05 au cycle 64, n'a jamais
 * eu de client — voir tasks/socketio-events-cleanup.md § 3.
 */
const READ_STATUS_EVENTS = ['read-status:updated'] as const;

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

const mockAuthContext: { current: Record<string, unknown> } = { current: {} };
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (request: any) => {
    request.authContext = mockAuthContext.current;
  }
}));

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn()
}));

const mockGetUnreadCount = jest.fn();
const mockMarkMessagesAsRead = jest.fn();
const mockMarkMessagesAsReceived = jest.fn();
const mockGetLatestMessageSummary = jest.fn();
jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getMessageReadStatus: jest.fn(),
    getConversationReadStatuses: jest.fn(),
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

const ROWS: MongoDocument[] = [
  { id: ACTOR_PARTICIPANT_ID, userId: ACTOR_USER_ID, conversationId: CONVERSATION_ID, isActive: true },
  { id: PEER_PARTICIPANT_ID, userId: PEER_USER_ID, conversationId: CONVERSATION_ID, isActive: true },
  { id: ANONYMOUS_PARTICIPANT_ID, userId: null, conversationId: CONVERSATION_ID, isActive: true }
];

const ACTIVE_PARTICIPANTS = [
  { id: ACTOR_PARTICIPANT_ID, userId: ACTOR_USER_ID },
  { id: PEER_PARTICIPANT_ID, userId: PEER_USER_ID },
  { id: ANONYMOUS_PARTICIPANT_ID, userId: null }
];

const mockPrisma: any = {
  participant: {
    findFirst: jest.fn(findFirstIn(ROWS)),
    findMany: jest.fn(),
    findUnique: jest.fn()
  },
  message: { findUnique: jest.fn(), findFirst: jest.fn(), count: jest.fn(), findMany: jest.fn() },
  messageStatusEntry: { findMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn() },
  conversationReadCursor: {
    upsert: jest.fn(), updateMany: jest.fn(), create: jest.fn(),
    findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn()
  }
};

let io: ReturnType<typeof makeChainableIO>;

function registeredContext() {
  return {
    type: 'user',
    isAuthenticated: true,
    isAnonymous: false,
    userId: ACTOR_USER_ID,
    hasFullAccess: true
  };
}

function anonymousContext() {
  return {
    type: 'anonymous',
    isAuthenticated: true,
    isAnonymous: true,
    participantId: ANONYMOUS_PARTICIPANT_ID,
    // Rappel du cycle 38 : `userId` porte un `Participant.id` pour un anonyme.
    userId: ANONYMOUS_PARTICIPANT_ID,
    hasFullAccess: false
  };
}

/** L'émission de l'éventail : celle dont la chaîne compte plus d'une room. */
function fanOutSends() {
  return io._sendsFor('read-status:updated').filter((send) => send.rooms.length > 1);
}

/** L'émission ciblée : la chaîne d'une seule room personnelle. */
function personalSendTo(room: string) {
  return io
    ._sendsFor('read-status:updated')
    .find((send) => send.rooms.length === 1 && send.rooms[0] === room);
}

describe('read-status — la portée de l\'arriéré de l\'acteur', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);
    app.decorate('socketIOHandler', {
      getManager: () => ({ getIO: () => io })
    } as never);
    await app.register(messageReadStatusRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    io = makeChainableIO();
    mockResolveConversationId.mockReset().mockResolvedValue(CONVERSATION_ID);
    mockShouldShowReadReceipts.mockReset().mockResolvedValue(true);
    mockGetUnreadCount.mockReset().mockResolvedValue(UNREAD_COUNT);
    mockMarkMessagesAsRead.mockReset().mockResolvedValue(undefined);
    mockMarkMessagesAsReceived.mockReset().mockResolvedValue(undefined);
    mockGetLatestMessageSummary.mockReset().mockResolvedValue({
      messageId: 'm_1', totalMembers: 3, deliveredCount: 2, readCount: 1
    });
    mockPrisma.participant.findMany.mockReset().mockResolvedValue(ACTIVE_PARTICIPANTS);
    mockPrisma.participant.findUnique.mockReset().mockResolvedValue(null);
    mockPrisma.conversationReadCursor.findUnique.mockReset().mockResolvedValue({ lastReadAt: LAST_READ_AT });
    mockAuthContext.current = registeredContext();
  });

  it('ne diffuse à la conversation NI la frontière de lecture NI l\'arriéré de l\'acteur', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    expect(response.statusCode).toBe(200);

    const sends = fanOutSends();
    // Un éventail, une émission.
    expect(sends).toHaveLength(1);
    for (const send of sends) {
      expect(send.payload).not.toHaveProperty('lastReadAt');
      expect(send.payload).not.toHaveProperty('unreadCount');
    }
  });

  it('livre la version complète à la room personnelle de l\'acteur, elle seule', async () => {
    await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    const send = personalSendTo(`user:${ACTOR_USER_ID}`);
    expect(send).toBeDefined();
    expect(send!.payload).toMatchObject({
      conversationId: CONVERSATION_ID,
      participantId: ACTOR_PARTICIPANT_ID,
      userId: ACTOR_USER_ID,
      type: 'read',
      lastReadAt: LAST_READ_AT,
      unreadCount: UNREAD_COUNT
    });

    // Aucune autre room personnelle ne reçoit d'émission ciblée.
    expect(personalSendTo(`user:${PEER_USER_ID}`)).toBeUndefined();
    expect(personalSendTo(`user:${ANONYMOUS_PARTICIPANT_ID}`)).toBeUndefined();
  });

  it('exclut l\'acteur de l\'éventail, pour qu\'il ne reçoive pas DEUX copies', async () => {
    await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    // La room de conversation est chaînée : sans `except`, l'acteur qui a le fil
    // ouvert recevrait la copie amputée EN PLUS de la sienne.
    expect(io._roomsFor('read-status:updated')).toContain(`conversation:${CONVERSATION_ID}`);
    expect(io._exceptsFor('read-status:updated')).toContain(`user:${ACTOR_USER_ID}`);
    for (const send of fanOutSends()) {
      expect(send.rooms).not.toContain(`user:${ACTOR_USER_ID}`);
    }
  });

  it('continue de porter le résumé aux pairs — c\'est une donnée de conversation', async () => {
    await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    const sends = fanOutSends();
    expect(sends).not.toHaveLength(0);
    for (const send of sends) {
      expect(send.payload).toMatchObject({
        conversationId: CONVERSATION_ID,
        participantId: ACTOR_PARTICIPANT_ID,
        userId: ACTOR_USER_ID,
        type: 'read',
        summary: { messageId: 'm_1', totalMembers: 3, deliveredCount: 2, readCount: 1 }
      });
      expect(send.rooms).toEqual(
        expect.arrayContaining([`user:${PEER_USER_ID}`, `user:${ANONYMOUS_PARTICIPANT_ID}`])
      );
    }
  });

  it('nomme la room de l\'acteur SANS compte par son Participant.id', async () => {
    mockAuthContext.current = anonymousContext();

    await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    const send = personalSendTo(`user:${ANONYMOUS_PARTICIPANT_ID}`);
    expect(send).toBeDefined();
    // Le champ du contrat reste `null` pour un invité (PR #3052) ; c'est la clé
    // de room qui retombe sur le `Participant.id`, jamais le champ.
    expect(send!.payload).toMatchObject({
      userId: null,
      participantId: ANONYMOUS_PARTICIPANT_ID,
      lastReadAt: LAST_READ_AT,
      unreadCount: UNREAD_COUNT
    });
    expect(io._exceptsFor('read-status:updated')).toContain(`user:${ANONYMOUS_PARTICIPANT_ID}`);
  });

  it('n\'ouvre aucun canal quand l\'acteur a coupé ses accusés de lecture', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(false);

    await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    // Ni éventail ni émission ciblée : la préférence coupe l'événement entier,
    // et la remise à zéro du badge passe par `conversation:unread-updated`.
    expect(io._sendsFor('read-status:updated')).toHaveLength(0);
    expect(io._roomsFor('conversation:unread-updated')).toContain(`user:${ACTOR_USER_ID}`);
  });

  it('laisse un accusé de RÉCEPTION intact — il n\'a jamais porté ces champs', async () => {
    await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-received`
    });

    const sends = io._sendsFor('read-status:updated');
    expect(sends).not.toHaveLength(0);
    for (const send of sends) {
      expect(send.payload).toMatchObject({ type: 'received' });
      expect(send.payload).not.toHaveProperty('lastReadAt');
      expect(send.payload).not.toHaveProperty('unreadCount');
      // Rien à retirer de l'éventail : aucun champ privé ne l'emprunte.
      expect(send.excepts).toEqual([]);
      expect(send.rooms).toEqual(
        expect.arrayContaining([`conversation:${CONVERSATION_ID}`, `user:${ACTOR_USER_ID}`])
      );
    }
  });
});
