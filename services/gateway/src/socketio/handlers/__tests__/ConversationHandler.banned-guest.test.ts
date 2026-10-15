/**
 * #7389 — un invité banni dont la ligne est restée active ne rejoint pas la
 * room de la conversation : `conversation:join` le refuse comme un
 * non-membre.
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

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import { ConversationHandler } from '../ConversationHandler';
import type { Socket } from 'socket.io';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { findFirstIn } from '../../../__tests__/helpers/mongo-where';

const CONV_ID = '507f1f77bcf86cd799439011';
const SOCKET_ID = 'socket-xyz';
const SESSION_TOKEN = 'anon-session-token';
const ANON_PARTICIPANT_ID = 'anon-part-1';

const makeSocket = (): Socket =>
  ({ id: SOCKET_ID, emit: jest.fn(), join: jest.fn(), leave: jest.fn() }) as unknown as Socket;

const makeHandler = (participantRows: Parameters<typeof findFirstIn>[0]) => {
  const connectedUsers = new Map();
  connectedUsers.set(SESSION_TOKEN, {
    id: SESSION_TOKEN, isAnonymous: true, participantId: ANON_PARTICIPANT_ID, language: 'fr', resolvedLanguages: [],
  });
  const prisma = {
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID, identifier: 'test-conv' }) },
    participant: { findFirst: findFirstIn(participantRows) },
  };
  return new ConversationHandler({
    prisma: prisma as any,
    connectedUsers,
    socketToUser: new Map([[SOCKET_ID, SESSION_TOKEN]]),
    readStatusService: { getUnreadCount: jest.fn<any>().mockResolvedValue(0) } as any,
    presenceViewer: jest.fn<any>().mockImplementation(async (userId: string) => ({ userId, role: 'USER' })),
    presenceVisibility: { resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()) },
  });
};

describe('ConversationHandler — un invité banni resté actif (#7389)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockResolvedValue(CONV_ID);
    mockValidateSocketEvent.mockReturnValue({ success: true, data: { conversationId: CONV_ID } });
    mockCheckLimit.mockResolvedValue(true);
  });

  it('refuse la room à un invité banni dont la ligne est restée active', async () => {
    const handler = makeHandler([
      { id: ANON_PARTICIPANT_ID, conversationId: CONV_ID, isActive: true, bannedAt: new Date('2026-09-01') },
    ]);
    const socket = makeSocket();

    await handler.handleConversationJoin(socket, { conversationId: CONV_ID });

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      SERVER_EVENTS.CONVERSATION_JOIN_ERROR,
      expect.objectContaining({ reason: 'not_a_member' })
    );
  });

  it('admet le même invité jamais banni', async () => {
    const handler = makeHandler([{ id: ANON_PARTICIPANT_ID, conversationId: CONV_ID, isActive: true }]);
    const socket = makeSocket();

    await handler.handleConversationJoin(socket, { conversationId: CONV_ID });

    expect(socket.join).toHaveBeenCalled();
  });
});
