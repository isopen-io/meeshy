/**
 * #5947 — `typing:start` refused for a lost conversation membership used to
 * be entirely silent: no broadcast, no callback (typing:start has none), no
 * signal of any kind. This suite covers the fix in isolation, split from
 * `StatusHandler.test.ts` per the file-size ratchet (#4531): that file is
 * already over its inherited budget (1323 lines) and must not grow.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mocks (must be defined before SUT import) ───────────────────────────────

const mockNormalizeConversationId = jest.fn() as jest.Mock<any>;
const mockGetConnectedUser = jest.fn() as jest.Mock<any>;
const mockValidateSocketEvent = jest.fn() as jest.Mock<any>;
const mockResolveParticipant = jest.fn() as jest.Mock<any>;
const mockResolveMembershipDenialReason = jest.fn() as jest.Mock<any>;

jest.mock('../../utils/socket-helpers', () => ({
  normalizeConversationId: (...args: unknown[]) => mockNormalizeConversationId(...args),
  getConnectedUser: (...args: unknown[]) => mockGetConnectedUser(...args),
}));

jest.mock('../../utils/participant-resolver', () => ({
  resolveParticipant: (...args: unknown[]) => mockResolveParticipant(...args),
  resolveMembershipDenialReason: (...args: unknown[]) => mockResolveMembershipDenialReason(...args),
}));

jest.mock('../../../middleware/validation.js', () => ({
  validateSocketEvent: (...args: unknown[]) => mockValidateSocketEvent(...args),
}));

jest.mock('../../../validation/socket-event-schemas.js', () => ({
  SocketTypingSchema: {},
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

import { StatusHandler } from '../StatusHandler';
import type { Socket } from 'socket.io';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

// ─── Factories ───────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439012';
const SOCKET_ID = 'socket-abc';

function makePrisma(): any {
  return {
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID, identifier: 'test-conv' }) },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    user: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

/**
 * `leave` FAIT PARTIE de la surface qu'un refus exerce (#5947 / #6059) : le
 * handler évince la socket de la room avant de signaler. Une fixture sans
 * `leave` ne rend pas le témoin plus simple — elle le rend FAUX : l'appel jette
 * un TypeError, le try/catch de la méthode l'avale, et les cinq témoins de
 * signalement ci-dessous constatent « aucun appel à emit » sans pouvoir dire
 * pourquoi.
 */
function makeSocket(overrides: Partial<Record<'leave', unknown>> = {}): Socket {
  return {
    id: SOCKET_ID,
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn(), except: jest.fn<any>().mockReturnValue({ emit: jest.fn() }) }),
    emit: jest.fn(),
    leave: jest.fn<any>().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Socket;
}

function makeHandler({
  prisma = makePrisma(),
  connectedUsers = new Map(),
  socketToUser = new Map([[SOCKET_ID, USER_ID]]),
}: {
  prisma?: any;
  connectedUsers?: Map<string, any>;
  socketToUser?: Map<string, string>;
} = {}) {
  return new StatusHandler({
    prisma,
    statusService: { updateLastSeen: jest.fn() } as any,
    privacyPreferencesService: { shouldShowTypingIndicator: jest.fn<any>().mockResolvedValue(true) } as any,
    connectedUsers,
    socketToUser,
    userSockets: new Map<string, Set<string>>(),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StatusHandler.handleTypingStart — membership denial (#5947)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockResolvedValue(CONV_ID);
    mockValidateSocketEvent.mockReturnValue({ success: true, data: { conversationId: CONV_ID } });
    mockGetConnectedUser.mockReturnValue({
      user: { id: USER_ID, isAnonymous: false, socketId: SOCKET_ID, language: 'fr', resolvedLanguages: [] },
      realUserId: USER_ID,
    });
    mockResolveParticipant.mockResolvedValue(null);
    mockResolveMembershipDenialReason.mockResolvedValue('not_a_member');
  });

  it('signals the caller with conversation:join-error, naming the exact denial reason', async () => {
    mockResolveMembershipDenialReason.mockResolvedValue('no_longer_member');
    const socket = makeSocket();
    const handler = makeHandler();

    await handler.handleTypingStart(socket, { conversationId: CONV_ID });

    expect(socket.to).not.toHaveBeenCalled();
    expect(mockResolveMembershipDenialReason).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: CONV_ID, isAnonymous: false, userId: USER_ID })
    );
    expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.CONVERSATION_JOIN_ERROR, {
      conversationId: CONV_ID,
      reason: 'no_longer_member',
      message: 'Vous n\'êtes plus membre de cette conversation',
    });
  });

  it.each([
    ['not_a_member', 'Vous n\'êtes pas membre de cette conversation'],
    ['banned', 'Vous êtes banni de cette conversation'],
    ['no_longer_member', 'Vous n\'êtes plus membre de cette conversation'],
  ] as const)('emits the %s message matching ConversationHandler.handleConversationJoin', async (reason, message) => {
    mockResolveMembershipDenialReason.mockResolvedValue(reason);
    const socket = makeSocket();
    const handler = makeHandler();

    await handler.handleTypingStart(socket, { conversationId: CONV_ID });

    expect(socket.emit).toHaveBeenCalledWith(
      SERVER_EVENTS.CONVERSATION_JOIN_ERROR,
      expect.objectContaining({ reason, message })
    );
  });

  it('évince la socket de la room de la conversation : la room est une autorisation en cache', async () => {
    const socket = makeSocket();
    const handler = makeHandler();

    await handler.handleTypingStart(socket, { conversationId: CONV_ID });

    expect(socket.leave).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
  });

  /**
   * Évincer et SIGNALER répondent à deux exigences distinctes. Sous le seul
   * try/catch de la méthode, une éviction qui jette emportait le signalement :
   * le client restait sur un refus muet — le défaut même que #5999 corrige.
   */
  it('signale le refus même quand l’éviction de la room échoue', async () => {
    const socket = makeSocket({
      leave: jest.fn<any>().mockRejectedValue(new Error('adapter unavailable')),
    });
    const handler = makeHandler();

    await handler.handleTypingStart(socket, { conversationId: CONV_ID });

    expect(socket.emit).toHaveBeenCalledWith(
      SERVER_EVENTS.CONVERSATION_JOIN_ERROR,
      expect.objectContaining({ reason: 'not_a_member' })
    );
  });

  it('resolves the anonymous participantId with the same id || fallback as resolveParticipant', async () => {
    const anonId = 'anon-participant-id';
    mockGetConnectedUser.mockReturnValue({
      user: { id: anonId, isAnonymous: true, socketId: SOCKET_ID, language: 'fr', resolvedLanguages: [] },
      realUserId: anonId,
    });
    const socketToUser = new Map([[SOCKET_ID, anonId]]);
    const connectedUsers = new Map([[anonId, { id: anonId, socketId: SOCKET_ID, isAnonymous: true, language: 'fr', resolvedLanguages: [] }]]);
    const socket = makeSocket();
    const handler = makeHandler({ connectedUsers, socketToUser });

    await handler.handleTypingStart(socket, { conversationId: CONV_ID });

    expect(mockResolveMembershipDenialReason).toHaveBeenCalledWith(
      expect.objectContaining({ isAnonymous: true, anonymousParticipantId: anonId })
    );
  });
});
