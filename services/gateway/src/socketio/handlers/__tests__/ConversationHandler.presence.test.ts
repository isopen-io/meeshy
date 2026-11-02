/**
 * Unit tests for ConversationHandler — `sendConversationStatsToSocket`,
 * `onlineUsers` projetée par LECTEUR.
 *
 * Extrait de `ConversationHandler.test.ts` (#13308, budget de taille des
 * suites #4531) : la croissance de #13298 (ADMIN qui bloque) faisait monter
 * le fichier source de 1026 à 1039 lignes, ce que la règle 3 du cliquet
 * interdit de regeler à la hausse. Ce bloc est cohésif (une seule méthode,
 * un seul réglage produit — directive 2026-08-25) et se découpe sans perte.
 *
 * Directive produit (2026-08-25) : hors amitié ACCEPTÉE, personne ne voit
 * l'état en ligne d'un autre ; ADMIN/BIGBOSS voient tout ; MODERATOR est un
 * lecteur ordinaire ; partager une conversation ne donne RIEN. Les stats sont
 * calculées et mises en cache SANS lecteur — c'est à l'émission, par socket,
 * que la liste nominative est projetée. Ces témoins ROUGIRAIENT sans la porte.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNormalizeConversationId = jest.fn() as jest.Mock<any>;
const mockValidateSocketEvent = jest.fn() as jest.Mock<any>;
const mockUpdateOnNewMessage = jest.fn() as jest.Mock<any>;
const mockGetOrCompute = jest.fn() as jest.Mock<any>;
const mockCheckLimit = jest.fn() as jest.Mock<any>;

jest.mock('../../utils/socket-helpers', () => ({
  normalizeConversationId: (...args: unknown[]) => mockNormalizeConversationId(...args),
}));

jest.mock('../../../utils/socket-rate-limiter.js', () => ({
  getSocketRateLimiter: () => ({ checkLimit: (...a: unknown[]) => mockCheckLimit(...a) }),
  SOCKET_RATE_LIMITS: {
    CONVERSATION_JOIN: { maxRequests: 5, windowMs: 60000, keyPrefix: 'socket:conv:join' },
  },
}));

jest.mock('../../../middleware/validation.js', () => ({
  validateSocketEvent: (...args: unknown[]) => mockValidateSocketEvent(...args),
}));

jest.mock('../../../validation/socket-event-schemas.js', () => ({
  SocketConversationJoinSchema: {},
  SocketConversationLeaveSchema: {},
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    updateOnNewMessage: (...args: unknown[]) => mockUpdateOnNewMessage(...args),
    getOrCompute: (...args: unknown[]) => mockGetOrCompute(...args),
  },
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import { ConversationHandler } from '../ConversationHandler';
import { PresenceVisibilityService } from '../../../services/PresenceVisibilityService';
import type { Socket } from 'socket.io';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

// ─── Factories ────────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439012';
const SOCKET_ID = 'socket-xyz';

function makeSocket(overrides: Record<string, any> = {}): Socket {
  return {
    id: SOCKET_ID,
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    ...overrides,
  } as unknown as Socket;
}

function makePrisma(participantResult: unknown = null): any {
  return {
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID, identifier: 'test-conv' }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(participantResult),
    },
  };
}

function makeConnectedUsers() {
  const users = new Map();
  users.set(USER_ID, { id: USER_ID, socketId: SOCKET_ID, isAnonymous: false, language: 'fr', resolvedLanguages: [], userId: USER_ID });
  return users;
}

function makeReadStatusService() {
  return { getUnreadCount: jest.fn().mockResolvedValue(0) };
}

/**
 * Le LECTEUR des stats tel que `MeeshySocketIOManager._presenceViewer` le
 * rend : l'id du socket et son rôle RELU en base.
 */
function makePresenceViewer(role: string) {
  return jest.fn<any>().mockImplementation(async (userId: string) => ({ userId, role }));
}

/**
 * La loi RÉELLE (`PresenceVisibilityService.resolveForPresenceEvent`, qui s'appuie sur `resolveForTargets`) sur un prisma
 * stubé : aucune cible désactivée, aucun blocage, préférences par défaut, et
 * les seules amitiés acceptées sont celles passées ici. Un faux
 * `resolveForTargets` qui réécrirait ADMIN/MODERATOR ne prouverait rien.
 */
function makePresenceLaw({ acceptedFriendsOfViewer = [] as string[], blockedByViewer = [] as string[] } = {}) {
  const prisma = {
    user: {
      findMany: jest.fn<any>().mockImplementation(
        async (args: { where?: { id?: { in?: string[] }; blockedUserIds?: unknown } }) =>
          args?.where?.blockedUserIds
            ? []
            : (args?.where?.id?.in ?? []).map((id: string) => ({ id, deactivatedAt: null })),
      ),
      findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: blockedByViewer }),
    },
    userRelation: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
    friendRequest: {
      findMany: jest.fn<any>().mockResolvedValue(
        acceptedFriendsOfViewer.map((friendId) => ({ senderId: friendId, receiverId: 'viewer' })),
      ),
    },
  };
  const privacy = { getPreferencesForUsers: jest.fn<any>().mockResolvedValue(new Map()) };
  return new PresenceVisibilityService(prisma as any, privacy as any);
}

/** Une loi MOCKÉE, pour observer ce que le handler lui présente. */
function makeMockLaw(visible: string[] = []) {
  return {
    resolveForPresenceEvent: jest.fn<any>().mockImplementation(async (_viewer: unknown, ids: string[]) =>
      new Map(ids.map((id) => [id, { showOnline: visible.includes(id), showLastSeenTimestamp: visible.includes(id) }])),
    ),
  };
}

function makeHandler({
  prisma = makePrisma(),
  connectedUsers = makeConnectedUsers(),
  socketToUser = new Map([[SOCKET_ID, USER_ID]]),
  readStatusService = makeReadStatusService(),
  retractTyping = undefined as undefined | ((socket: any, conversationId: string) => Promise<void>),
  replayLiveLocations = undefined as undefined | ((socket: any, conversationId: string) => void),
  presenceViewer = makePresenceViewer('USER'),
  presenceVisibility = makePresenceLaw() as Pick<PresenceVisibilityService, 'resolveForPresenceEvent'>,
} = {}) {
  return new ConversationHandler({
    prisma,
    connectedUsers,
    socketToUser,
    readStatusService: readStatusService as any,
    retractTyping,
    replayLiveLocations,
    presenceViewer,
    presenceVisibility,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConversationHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendConversationStatsToSocket — onlineUsers projetée par lecteur', () => {
    const ADMIN_ID = '507f1f77bcf86cd799439013';
    const SELF = { id: USER_ID, username: 'me', firstName: 'Me', lastName: 'Self' };
    const FRIEND = { id: 'user-friend', username: 'friend', firstName: 'Fr', lastName: 'Iend' };
    const STRANGER = { id: 'user-stranger', username: 'stranger', firstName: 'St', lastName: 'Ranger' };
    const UPDATED_AT = new Date('2026-08-25T10:00:00.000Z');

    function makeStats(onlineUsers = [SELF, FRIEND, STRANGER]) {
      return {
        messagesPerLanguage: { fr: 4, en: 2 },
        participantCount: 7,
        participantsPerLanguage: { fr: 5, en: 2 },
        onlineUsers,
        updatedAt: UPDATED_AT,
      };
    }

    function emittedStats(socket: Socket) {
      const call = (socket.emit as jest.Mock<any>).mock.calls.find(
        (c: any[]) => c[0] === SERVER_EVENTS.CONVERSATION_STATS,
      );
      return call?.[1]?.stats;
    }

    it('USER sans ami : les inconnus disparaissent, soi reste, le reste du DTO est intact', async () => {
      mockGetOrCompute.mockResolvedValue(makeStats());
      const socket = makeSocket();
      const handler = makeHandler({ presenceViewer: makePresenceViewer('USER'), presenceVisibility: makePresenceLaw() });

      await handler.sendConversationStatsToSocket(socket, CONV_ID);

      expect(emittedStats(socket)).toEqual({ ...makeStats(), onlineUsers: [SELF] });
    });

    it('USER : un AMI accepté reste nommé', async () => {
      mockGetOrCompute.mockResolvedValue(makeStats());
      const socket = makeSocket();
      const handler = makeHandler({
        presenceViewer: makePresenceViewer('USER'),
        presenceVisibility: makePresenceLaw({ acceptedFriendsOfViewer: [FRIEND.id] }),
      });

      await handler.sendConversationStatsToSocket(socket, CONV_ID);

      expect(emittedStats(socket).onlineUsers).toEqual([SELF, FRIEND]);
    });

    it('ADMIN : la liste est complète', async () => {
      mockGetOrCompute.mockResolvedValue(makeStats());
      const socket = makeSocket();
      const handler = makeHandler({ presenceViewer: makePresenceViewer('ADMIN'), presenceVisibility: makePresenceLaw() });

      await handler.sendConversationStatsToSocket(socket, CONV_ID);

      expect(emittedStats(socket).onlineUsers).toEqual([SELF, FRIEND, STRANGER]);
    });

    it('ADMIN qui a BLOQUÉ un participant : ce dernier sort de la liste — un blocage l’emporte sur le privilège dans un événement poussé (#13298)', async () => {
      mockGetOrCompute.mockResolvedValue(makeStats());
      const socket = makeSocket();
      const handler = makeHandler({
        presenceViewer: makePresenceViewer('ADMIN'),
        presenceVisibility: makePresenceLaw({ blockedByViewer: [STRANGER.id] }),
      });

      await handler.sendConversationStatsToSocket(socket, CONV_ID);

      expect(emittedStats(socket).onlineUsers).toEqual([SELF, FRIEND]);
    });

    it('MODERATOR : un lecteur ordinaire — comme USER', async () => {
      mockGetOrCompute.mockResolvedValue(makeStats());
      const socket = makeSocket();
      const handler = makeHandler({ presenceViewer: makePresenceViewer('MODERATOR'), presenceVisibility: makePresenceLaw() });

      await handler.sendConversationStatsToSocket(socket, CONV_ID);

      expect(emittedStats(socket).onlineUsers).toEqual([SELF]);
    });

    it('présente à la loi le lecteur RELU (userId + rôle) et les ids en ligne', async () => {
      mockGetOrCompute.mockResolvedValue(makeStats());
      const presenceViewer = makePresenceViewer('BIGBOSS');
      const law = makeMockLaw([SELF.id, FRIEND.id, STRANGER.id]);
      const socket = makeSocket();
      const handler = makeHandler({ presenceViewer, presenceVisibility: law });

      await handler.sendConversationStatsToSocket(socket, CONV_ID);

      expect(presenceViewer).toHaveBeenCalledWith(USER_ID);
      expect(law.resolveForPresenceEvent).toHaveBeenCalledWith(
        { userId: USER_ID, role: 'BIGBOSS' },
        [SELF.id, FRIEND.id, STRANGER.id],
      );
    });

    it('ne garde que ce que la loi marque showOnline — un id absent de la carte est retiré', async () => {
      mockGetOrCompute.mockResolvedValue(makeStats());
      const law = {
        resolveForPresenceEvent: jest.fn<any>().mockResolvedValue(new Map([
          [FRIEND.id, { showOnline: true, showLastSeenTimestamp: false }],
          [STRANGER.id, { showOnline: false, showLastSeenTimestamp: true }],
        ])),
      };
      const socket = makeSocket();
      const handler = makeHandler({ presenceVisibility: law });

      await handler.sendConversationStatsToSocket(socket, CONV_ID);

      expect(emittedStats(socket).onlineUsers).toEqual([FRIEND]);
    });

    it('socket ANONYME : onlineUsers vide, aucune identité fabriquée pour lui', async () => {
      mockGetOrCompute.mockResolvedValue(makeStats());
      const token = 'anon-session-token';
      const connectedUsers = new Map([[token, {
        id: token, socketId: SOCKET_ID, isAnonymous: true, language: 'fr', resolvedLanguages: [], participantId: 'participant-anon',
      }]]);
      const presenceViewer = makePresenceViewer('USER');
      const law = makePresenceLaw();
      const resolveForPresenceEvent = jest.spyOn(law, 'resolveForPresenceEvent');
      const socket = makeSocket();
      const handler = makeHandler({
        connectedUsers, socketToUser: new Map([[SOCKET_ID, token]]), presenceViewer, presenceVisibility: law,
      });

      await handler.sendConversationStatsToSocket(socket, CONV_ID);

      expect(presenceViewer).not.toHaveBeenCalled();
      expect(resolveForPresenceEvent).toHaveBeenCalledWith(null, [SELF.id, FRIEND.id, STRANGER.id]);
      expect(emittedStats(socket).onlineUsers).toEqual([]);
    });

    it("ne consulte ni le lecteur ni la loi quand personne n'est en ligne", async () => {
      mockGetOrCompute.mockResolvedValue(makeStats([]));
      const presenceViewer = makePresenceViewer('USER');
      const law = makeMockLaw();
      const socket = makeSocket();
      const handler = makeHandler({ presenceViewer, presenceVisibility: law });

      await handler.sendConversationStatsToSocket(socket, CONV_ID);

      expect(presenceViewer).not.toHaveBeenCalled();
      expect(law.resolveForPresenceEvent).not.toHaveBeenCalled();
      expect(emittedStats(socket).onlineUsers).toEqual([]);
    });

    it('projette SANS toucher le cache : deux sockets, deux listes, la même entrée', async () => {
      const cached = makeStats();
      mockGetOrCompute.mockResolvedValue(cached);
      const userSocket = makeSocket({ id: 'sock-user' });
      const adminSocket = makeSocket({ id: 'sock-admin' });
      const connectedUsers = makeConnectedUsers();
      connectedUsers.set(ADMIN_ID, {
        id: ADMIN_ID, socketId: 'sock-admin', isAnonymous: false, language: 'fr', resolvedLanguages: [], userId: ADMIN_ID,
      });
      const presenceViewer = jest.fn<any>().mockImplementation(
        async (userId: string) => ({ userId, role: userId === ADMIN_ID ? 'ADMIN' : 'USER' }),
      );
      const handler = makeHandler({
        connectedUsers,
        socketToUser: new Map([['sock-user', USER_ID], ['sock-admin', ADMIN_ID]]),
        presenceViewer,
        presenceVisibility: makePresenceLaw(),
      });

      await handler.sendConversationStatsToSocket(userSocket, CONV_ID);
      await handler.sendConversationStatsToSocket(adminSocket, CONV_ID);

      expect(emittedStats(userSocket).onlineUsers).toEqual([SELF]);
      expect(emittedStats(adminSocket).onlineUsers).toEqual([SELF, FRIEND, STRANGER]);
      expect(cached.onlineUsers).toEqual([SELF, FRIEND, STRANGER]);
      expect(emittedStats(userSocket)).not.toBe(cached);
      expect(emittedStats(adminSocket)).not.toBe(cached);
    });
  });
});
