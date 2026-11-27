/**
 * #16796 — une socket sans sa room d'identité ne s'assoit dans AUCUNE room de
 * conversation, par aucune porte.
 *
 * L'authentification refuse déjà ses conversations quand `ROOMS.user(id)` reste
 * impossible. Mais la socket est inscrite quand même (présence, nettoyage), et
 * deux autres portes font entrer une socket inscrite dans une room de
 * conversation : `conversation:join` (émis par chaque client à l'ouverture d'un
 * fil) et l'admission de mi-session (compte ajouté à une conversation pendant
 * qu'il est connecté). Si elles l'admettent, la socket redevient INEXCLUABLE
 * des signaux de salon d'un compte qui a bloqué son titulaire (#16800).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockNormalizeConversationId = jest.fn() as jest.Mock<any>;
const mockValidateSocketEvent = jest.fn() as jest.Mock<any>;
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
    updateOnNewMessage: jest.fn<any>().mockResolvedValue(null),
    getOrCompute: jest.fn<any>().mockResolvedValue(null),
  },
}));

import { ConversationHandler } from '../ConversationHandler';
import { joinIdentityRoomWithRetry } from '../join-user-conversations';
import { admitUserToConversationRoom } from '../../midSessionRoomAdmission';
import type { Socket } from 'socket.io';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { findFirstIn } from '../../../__tests__/helpers/mongo-where';

const CONV_ID = '507f1f77bcf86cd799439011';
const SOCKET_ID = 'socket-xyz';
const SESSION_TOKEN = 'anon-session-token';
const PARTICIPANT_ID = 'anon-part-1';

const socketWhoseIdentityRoom = (identity: 'joins' | 'fails') => {
  const join = jest.fn<any>().mockImplementation(async (room: string) => {
    if (identity === 'fails' && room.startsWith('user:')) throw new Error('adapter down');
  });
  const socket = { id: SOCKET_ID, emit: jest.fn(), join, leave: jest.fn(), data: {} } as unknown as Socket;
  return { socket, join };
};

const conversationJoins = (join: jest.Mock) =>
  join.mock.calls.map(([room]) => String(room)).filter((room) => room.startsWith('conversation:'));

const makeHandler = () => {
  const connectedUsers = new Map();
  connectedUsers.set(SESSION_TOKEN, {
    id: SESSION_TOKEN, isAnonymous: true, participantId: PARTICIPANT_ID, language: 'fr', resolvedLanguages: [],
  });
  const prisma = {
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID, identifier: 'test-conv' }) },
    participant: { findFirst: findFirstIn([{ id: PARTICIPANT_ID, conversationId: CONV_ID, isActive: true }]) },
  };
  return new ConversationHandler({
    prisma: prisma as any,
    connectedUsers,
    socketToUser: new Map([[SOCKET_ID, SESSION_TOKEN]]),
    readStatusService: { getUnreadCount: jest.fn<any>().mockResolvedValue(0) } as any,
    presenceViewer: jest.fn<any>().mockImplementation(async (userId: string) => ({ userId, role: 'USER' })),
    presenceVisibility: { resolveForPresenceEvent: jest.fn<any>().mockResolvedValue(new Map()) },
  });
};

describe('Aucune porte n’assoit une socket sans room d’identité (#16796)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockResolvedValue(CONV_ID);
    mockValidateSocketEvent.mockReturnValue({ success: true, data: { conversationId: CONV_ID } });
    mockCheckLimit.mockResolvedValue(true);
  });

  it('conversation_join_refuse_la_room_a_une_socket_sans_room_d_identite', async () => {
    const { socket, join } = socketWhoseIdentityRoom('fails');
    expect(await joinIdentityRoomWithRetry(socket, PARTICIPANT_ID)).toBe(false);

    await makeHandler().handleConversationJoin(socket, { conversationId: CONV_ID });

    expect(conversationJoins(join)).toEqual([]);
    expect(socket.emit).toHaveBeenCalledWith(
      SERVER_EVENTS.CONVERSATION_JOIN_ERROR,
      expect.objectContaining({ conversationId: CONV_ID }),
    );
  });

  it('conversation_join_admet_la_meme_socket_quand_sa_room_d_identite_est_tenue', async () => {
    const { socket, join } = socketWhoseIdentityRoom('joins');
    expect(await joinIdentityRoomWithRetry(socket, PARTICIPANT_ID)).toBe(true);

    await makeHandler().handleConversationJoin(socket, { conversationId: CONV_ID });

    expect(conversationJoins(join)).toEqual([`conversation:${CONV_ID}`]);
  });

  it('l_admission_de_mi_session_ne_fait_pas_entrer_une_socket_sans_room_d_identite', async () => {
    const { socket, join } = socketWhoseIdentityRoom('fails');
    await joinIdentityRoomWithRetry(socket, PARTICIPANT_ID);
    const connectedUsers = new Map([[PARTICIPANT_ID, { id: PARTICIPANT_ID, socketId: SOCKET_ID, isAnonymous: false } as any]]);

    await admitUserToConversationRoom({
      io: { in: () => ({ socketsJoin: () => undefined }) },
      userSockets: new Map([[PARTICIPANT_ID, new Set([SOCKET_ID])]]),
      socketById: () => socket as never,
      connectedUsers,
    }, PARTICIPANT_ID, CONV_ID);

    expect(conversationJoins(join)).toEqual([]);
    expect(connectedUsers.get(PARTICIPANT_ID)?.unreachableConversations?.has(CONV_ID)).toBe(true);
  });
});
