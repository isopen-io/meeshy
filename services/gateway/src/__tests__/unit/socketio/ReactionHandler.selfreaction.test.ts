/**
 * ReactionHandler — Fix 4 (P0): self-reaction notification guard
 *
 * Asserts that when a user reacts to their own message, no notification
 * is created. The guard lives in _createReactionNotification:
 *   if (!authorUserId || !reactorUserId || authorUserId === reactorUserId) return;
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ===== MOCKS =====

jest.mock('../../../services/ReactionService', () => ({
  ReactionService: jest.fn(),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../validation/socket-event-schemas', () => ({
  SocketReactionAddSchema: { safeParse: jest.fn() },
  SocketReactionRemoveSchema: { safeParse: jest.fn() },
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn(),
  isValidationFailure: jest.fn((r) => !r.success),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

jest.mock('../../../socketio/utils/socket-helpers', () => ({
  getConnectedUser: jest.fn(),
  normalizeConversationId: jest.fn(),
}));

// Import after mocks
import { ReactionHandler } from '../../../socketio/handlers/ReactionHandler';
import type { NotificationService } from '../../../services/notifications/NotificationService';
import { validateSocketEvent } from '../../../middleware/validation';
import { getConnectedUser, normalizeConversationId } from '../../../socketio/utils/socket-helpers';

// ===== CONSTANTS =====

const USER_ID = '507f1f77bcf86cd799439001';
const PARTICIPANT_ID = 'participant-abc';
const MESSAGE_ID = '507f1f77bcf86cd799439002';
const CONVERSATION_ID = '507f1f77bcf86cd799439003';
const SOCKET_ID = 'socket-test-111';
const EMOJI = '❤️';

// ===== HELPERS =====

function createMockSocket() {
  return { id: SOCKET_ID, emit: jest.fn(), join: jest.fn(), leave: jest.fn() };
}

function createMockIO() {
  const emitFn = jest.fn();
  return { to: jest.fn().mockReturnValue({ emit: emitFn }), emit: emitFn };
}

function createMockNotificationService() {
  return {
    createReactionNotification: jest.fn(),
  } as unknown as jest.Mocked<NotificationService>;
}

function createMockReactionService() {
  return {
    addReaction: jest.fn(),
    removeReaction: jest.fn(),
    createUpdateEvent: jest.fn(),
  } as any;
}

/**
 * Creates a mock prisma where the message author participant maps to the
 * same User.id as the reactor participant (self-reaction scenario).
 */
function createMockPrisma(): any {
  return {
    message: { findUnique: jest.fn() },
    participant: {
      findFirst: jest.fn(),   // used by _resolveParticipantId
      findUnique: jest.fn(),  // used by _createReactionNotification
    },
    conversation: { findUnique: jest.fn() },
  };
}

describe('ReactionHandler — Fix 4: self-reaction notification guard', () => {
  let mockIO: ReturnType<typeof createMockIO>;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let mockReactionService: ReturnType<typeof createMockReactionService>;
  let mockPrisma: any;
  let handler: ReactionHandler;

  const socketToUser = new Map<string, string>();
  socketToUser.set(SOCKET_ID, USER_ID);

  const connectedUsers = new Map<string, any>();
  connectedUsers.set(USER_ID, {
    id: USER_ID,
    socketId: SOCKET_ID,
    isAnonymous: false,
    language: 'fr',
    userId: USER_ID,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockIO = createMockIO();
    mockNotificationService = createMockNotificationService();
    mockReactionService = createMockReactionService();
    mockPrisma = createMockPrisma();

    // Self-reaction: both author and reactor resolve to USER_ID
    mockPrisma.message.findUnique.mockResolvedValue({
      senderId: PARTICIPANT_ID,
      conversationId: CONVERSATION_ID,
    });
    // _resolveParticipantId uses findFirst to get Participant.id
    mockPrisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });
    // _createReactionNotification uses findUnique (by Participant.id) → User.id
    mockPrisma.participant.findUnique.mockResolvedValue({ userId: USER_ID });
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: CONVERSATION_ID, identifier: CONVERSATION_ID });

    handler = new ReactionHandler({
      io: mockIO as any,
      prisma: mockPrisma,
      notificationService: mockNotificationService,
      reactionService: mockReactionService,
      connectedUsers,
      socketToUser,
    });

    // Default mocks
    (validateSocketEvent as jest.Mock).mockReturnValue({
      success: true,
      data: { messageId: MESSAGE_ID, emoji: EMOJI },
    });

    (getConnectedUser as jest.Mock).mockReturnValue({
      user: { id: USER_ID, isAnonymous: false },
      realUserId: USER_ID,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (normalizeConversationId as unknown as jest.MockedFunction<() => Promise<string>>).mockResolvedValue(CONVERSATION_ID);

    mockReactionService.addReaction.mockResolvedValue({ id: 'reaction-1', emoji: EMOJI });
    mockReactionService.createUpdateEvent.mockResolvedValue({ messageId: MESSAGE_ID, emoji: EMOJI });
  });

  it('test_createReactionNotification_selfReaction_noNotificationCreated', async () => {
    // Both author and reactor resolve to the same USER_ID → self-reaction
    // participant.findUnique always returns { userId: USER_ID } for both lookups
    const socket = createMockSocket();
    const callback = jest.fn();

    await handler.handleReactionAdd(socket as any, { messageId: MESSAGE_ID, emoji: EMOJI }, callback);

    // The notification service should NOT have been called
    expect(mockNotificationService.createReactionNotification).not.toHaveBeenCalled();
  });

  it('test_createReactionNotification_crossUserReaction_notificationCreated', async () => {
    // Author is USER_ID, reactor is a different user
    const OTHER_USER_ID = '507f1f77bcf86cd799439099';

    // _resolveParticipantId (findFirst) returns reactor's participant id
    mockPrisma.participant.findFirst.mockResolvedValue({ id: 'participant-other' });
    // _createReactionNotification (findUnique): author → USER_ID, reactor → OTHER_USER_ID
    mockPrisma.participant.findUnique
      .mockResolvedValueOnce({ userId: USER_ID })        // authorParticipant
      .mockResolvedValueOnce({ userId: OTHER_USER_ID });  // reactorParticipant

    const reactorSocketToUser = new Map<string, string>();
    reactorSocketToUser.set(SOCKET_ID, OTHER_USER_ID);

    const reactorConnectedUsers = new Map<string, any>();
    reactorConnectedUsers.set(OTHER_USER_ID, {
      id: OTHER_USER_ID,
      socketId: SOCKET_ID,
      isAnonymous: false,
      language: 'fr',
      userId: OTHER_USER_ID,
    });

    (getConnectedUser as jest.Mock).mockReturnValue({
      user: { id: OTHER_USER_ID, isAnonymous: false },
      realUserId: OTHER_USER_ID,
    });

    const crossHandler = new ReactionHandler({
      io: mockIO as any,
      prisma: mockPrisma,
      notificationService: mockNotificationService,
      reactionService: mockReactionService,
      connectedUsers: reactorConnectedUsers,
      socketToUser: reactorSocketToUser,
    });

    const socket = createMockSocket();
    await crossHandler.handleReactionAdd(socket as any, { messageId: MESSAGE_ID, emoji: EMOJI }, jest.fn());

    // Wait for the fire-and-forget notification
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockNotificationService.createReactionNotification).toHaveBeenCalledTimes(1);
    expect(mockNotificationService.createReactionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        messageAuthorId: USER_ID,
        reactorUserId: OTHER_USER_ID,
      })
    );
  });

  it('handleReactionRemove is idempotent — removing an absent reaction returns success (not an error) and does not broadcast', async () => {
    // The reaction is already gone (concurrent removal, retry of an applied
    // remove, double-tap). A `{ success: false }` makes the client roll the
    // optimistic un-react back, re-showing a reaction that is gone. Mirror the
    // idempotent REST DELETE (R-GW2).
    mockReactionService.removeReaction.mockResolvedValue(false);
    const socket = createMockSocket();
    const callback = jest.fn();

    await handler.handleReactionRemove(socket as any, { messageId: MESSAGE_ID, emoji: EMOJI }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: true,
      data: { message: 'Reaction already absent' },
    });
    // Nothing changed → no reaction:removed broadcast.
    expect(mockIO.emit).not.toHaveBeenCalled();
  });
});
