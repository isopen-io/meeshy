/**
 * Unit tests for AttachmentReactionHandler
 * Covers: handleAdd, handleRemove, _apply (all branches incl. IDOR guard)
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockResolveParticipantFromMessage = jest.fn() as jest.Mock<any>;

jest.mock('../../utils/participant-resolver', () => ({
  resolveParticipantFromMessage: (...args: unknown[]) => mockResolveParticipantFromMessage(...args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import { AttachmentReactionHandler } from '../AttachmentReactionHandler';
import type { Socket, Server as SocketIOServer } from 'socket.io';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

// ─── Factories ────────────────────────────────────────────────────────────────

const SOCKET_ID = 'socket-1';
const USER_ID = 'user-001';
const MSG_ID = '507f1f77bcf86cd799439011';
const ATTACH_ID = '507f1f77bcf86cd799439012';
const CONV_ID = '507f1f77bcf86cd799439013';
const PARTICIPANT_ID = 'participant-1';
const EMOJI = '👍';

function makeSocket(): Socket {
  return {
    id: SOCKET_ID,
    emit: jest.fn(),
  } as unknown as Socket;
}

function makeIo() {
  const toRoom = { emit: jest.fn() };
  return {
    to: jest.fn<any>().mockReturnValue(toRoom),
    _toRoom: toRoom,
  } as unknown as (SocketIOServer & { _toRoom: { emit: jest.Mock } });
}

function makeService(overrides: Record<string, any> = {}) {
  return {
    addAttachmentReaction: jest.fn<any>().mockResolvedValue({ changed: true }),
    removeAttachmentReaction: jest.fn<any>().mockResolvedValue(true),
    getReactionSummary: jest.fn<any>().mockResolvedValue({ '👍': 1 }),
    resolveConversationId: jest.fn<any>().mockResolvedValue(CONV_ID),
    ...overrides,
  };
}

function makePrisma(attachResult: unknown = { messageId: MSG_ID }): any {
  return {
    messageAttachment: {
      findUnique: jest.fn<any>().mockResolvedValue(attachResult),
    },
    message: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
  };
}

function makeConnectedUsers() {
  const users = new Map();
  users.set(USER_ID, {
    id: USER_ID, socketId: SOCKET_ID, isAnonymous: false, language: 'fr', resolvedLanguages: [],
  });
  return users;
}

function makeHandler({
  io = makeIo(),
  prisma = makePrisma(),
  service = makeService(),
  connectedUsers = makeConnectedUsers(),
  socketToUser = new Map([[SOCKET_ID, USER_ID]]),
} = {}) {
  return {
    handler: new AttachmentReactionHandler({ io: io as any, prisma: prisma as any, service: service as any, connectedUsers, socketToUser }),
    io,
    prisma,
    service,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AttachmentReactionHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveParticipantFromMessage.mockResolvedValue({
      participantId: PARTICIPANT_ID,
      userId: USER_ID,
      isAnonymous: false,
      displayName: 'Alice',
    });
  });

  const validData = { attachmentId: ATTACH_ID, messageId: MSG_ID, emoji: EMOJI };

  // ── handleAdd ─────────────────────────────────────────────────────────────

  describe('handleAdd', () => {
    it('calls addAttachmentReaction and emits ATTACHMENT_REACTION_ADDED', async () => {
      const cb = jest.fn();
      const { handler, io, service } = makeHandler();
      const socket = makeSocket();

      await handler.handleAdd(socket, validData, cb);

      expect(service.addAttachmentReaction).toHaveBeenCalledWith({
        attachmentId: ATTACH_ID,
        messageId: MSG_ID,
        participantId: PARTICIPANT_ID,
        emoji: EMOJI,
      });
      const toRoom = (io as any)._toRoom;
      expect((io as any).to).toHaveBeenCalledWith(ROOMS.conversation(CONV_ID));
      expect(toRoom.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.ATTACHMENT_REACTION_ADDED,
        expect.objectContaining({
          attachmentId: ATTACH_ID,
          messageId: MSG_ID,
          conversationId: CONV_ID,
          participantId: PARTICIPANT_ID,
          emoji: EMOJI,
          action: 'add',
        })
      );
      expect(cb).toHaveBeenCalledWith({ success: true });
    });

    it('calls callback with error for missing attachmentId', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleAdd(socket, { attachmentId: '', messageId: MSG_ID, emoji: EMOJI }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Invalid payload' });
    });

    it('calls callback with error for missing messageId', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleAdd(socket, { attachmentId: ATTACH_ID, messageId: '', emoji: EMOJI }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Invalid payload' });
    });

    it('calls callback with error for missing emoji', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleAdd(socket, { attachmentId: ATTACH_ID, messageId: MSG_ID, emoji: '' }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Invalid payload' });
    });

    it('rejects optimistic messageId (cid_* format) — not a valid ObjectId', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleAdd(socket, { attachmentId: ATTACH_ID, messageId: 'cid_abc123', emoji: EMOJI }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
    });

    it('rejects non-ObjectId attachmentId', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleAdd(socket, { attachmentId: 'not-an-objectid', messageId: MSG_ID, emoji: EMOJI }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
    });

    it('returns error when socket is not in socketToUser map', async () => {
      const cb = jest.fn();
      const socketToUser = new Map<string, string>();
      const { handler } = makeHandler({ socketToUser });
      const socket = makeSocket();

      await handler.handleAdd(socket, validData, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'User not authenticated' });
    });

    it('returns error when resolveParticipantFromMessage returns null', async () => {
      mockResolveParticipantFromMessage.mockResolvedValue(null);
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleAdd(socket, validData, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
    });

    it('returns error when resolveConversationId returns null', async () => {
      const service = makeService({ resolveConversationId: jest.fn<any>().mockResolvedValue(null) });
      const cb = jest.fn();
      const { handler } = makeHandler({ service });
      const socket = makeSocket();

      await handler.handleAdd(socket, validData, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Message not found' });
    });

    it('returns error when attachment is not found (IDOR guard — null)', async () => {
      const prisma = makePrisma(null);
      const cb = jest.fn();
      const { handler } = makeHandler({ prisma });
      const socket = makeSocket();

      await handler.handleAdd(socket, validData, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Attachment not found' });
    });

    it('returns error when attachment belongs to a different message (IDOR guard)', async () => {
      const prisma = makePrisma({ messageId: 'different-message-id-111111111111' });
      const cb = jest.fn();
      const { handler } = makeHandler({ prisma });
      const socket = makeSocket();

      await handler.handleAdd(socket, validData, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Attachment not found' });
    });

    it('handles callback being undefined (no crash)', async () => {
      const { handler } = makeHandler();
      const socket = makeSocket();

      await expect(handler.handleAdd(socket, validData, undefined)).resolves.toBeUndefined();
    });

    it('returns error message from Error on service failure', async () => {
      const service = makeService({
        addAttachmentReaction: jest.fn<any>().mockRejectedValue(new Error('DB write failed')),
      });
      const cb = jest.fn();
      const { handler } = makeHandler({ service });
      const socket = makeSocket();

      await handler.handleAdd(socket, validData, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'DB write failed' });
    });

    it('returns generic Failed on non-Error exception', async () => {
      const service = makeService({
        addAttachmentReaction: jest.fn<any>().mockRejectedValue('string error'),
      });
      const cb = jest.fn();
      const { handler } = makeHandler({ service });
      const socket = makeSocket();

      await handler.handleAdd(socket, validData, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Failed' });
    });

    it('includes timestamp in emitted event', async () => {
      const cb = jest.fn();
      const { handler, io } = makeHandler();
      const socket = makeSocket();

      await handler.handleAdd(socket, validData, cb);

      const toRoom = (io as any)._toRoom;
      const emittedData = (toRoom.emit as jest.Mock).mock.calls[0][1] as any;
      expect(typeof emittedData.timestamp).toBe('string');
      expect(new Date(emittedData.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('includes reaction summary in emitted event', async () => {
      const summary = { '👍': 3, '❤️': 1 };
      const service = makeService({ getReactionSummary: jest.fn<any>().mockResolvedValue(summary) });
      const cb = jest.fn();
      const { handler, io } = makeHandler({ service });
      const socket = makeSocket();

      await handler.handleAdd(socket, validData, cb);

      const toRoom = (io as any)._toRoom;
      const emittedData = (toRoom.emit as jest.Mock).mock.calls[0][1] as any;
      expect(emittedData.reactionSummary).toEqual(summary);
    });

    it('idempotent no-op re-add (changed:false) — replies success but does NOT re-broadcast', async () => {
      // The participant already had exactly this emoji on this attachment
      // (optimistic double-fire, a socket retry after a lost ACK, or a second
      // device echoing the same tap). Nothing changed in the DB, so we must not
      // re-emit ATTACHMENT_REACTION_ADDED to every socket in the room — mirrors
      // ReactionHandler's `unchanged` guard (iter 134).
      const service = makeService({
        addAttachmentReaction: jest.fn<any>().mockResolvedValue({ changed: false }),
      });
      const cb = jest.fn();
      const { handler, io } = makeHandler({ service });
      const socket = makeSocket();

      await handler.handleAdd(socket, validData, cb);

      const toRoom = (io as any)._toRoom;
      expect(toRoom.emit).not.toHaveBeenCalled();
      expect(service.getReactionSummary).not.toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith({ success: true });
    });
  });

  // ── handleRemove ──────────────────────────────────────────────────────────

  describe('handleRemove', () => {
    it('calls removeAttachmentReaction and emits ATTACHMENT_REACTION_REMOVED', async () => {
      const cb = jest.fn();
      const { handler, io, service } = makeHandler();
      const socket = makeSocket();

      await handler.handleRemove(socket, validData, cb);

      expect(service.removeAttachmentReaction).toHaveBeenCalledWith({
        attachmentId: ATTACH_ID,
        participantId: PARTICIPANT_ID,
        emoji: EMOJI,
      });
      const toRoom = (io as any)._toRoom;
      expect(toRoom.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.ATTACHMENT_REACTION_REMOVED,
        expect.objectContaining({ action: 'remove', attachmentId: ATTACH_ID })
      );
      expect(cb).toHaveBeenCalledWith({ success: true });
    });

    it('runs same validation guards as handleAdd — missing fields', async () => {
      const cb = jest.fn();
      const { handler } = makeHandler();
      const socket = makeSocket();

      await handler.handleRemove(socket, { attachmentId: '', messageId: MSG_ID, emoji: EMOJI }, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Invalid payload' });
    });

    it('runs IDOR guard — attachment belongs to different message', async () => {
      const prisma = makePrisma({ messageId: 'different-msg-id-111111111111' });
      const cb = jest.fn();
      const { handler } = makeHandler({ prisma });
      const socket = makeSocket();

      await handler.handleRemove(socket, validData, cb);

      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Attachment not found' });
    });

    it('does not call addAttachmentReaction when removing', async () => {
      const cb = jest.fn();
      const { handler, service } = makeHandler();
      const socket = makeSocket();

      await handler.handleRemove(socket, validData, cb);

      expect(service.addAttachmentReaction).not.toHaveBeenCalled();
      expect(service.removeAttachmentReaction).toHaveBeenCalledTimes(1);
    });

    it('idempotent already-absent remove (returns false) — replies success but does NOT broadcast', async () => {
      // The reaction is already gone (a retry after a lost ACK, a double-tap, or
      // a second device echoing the un-react). Re-emitting ATTACHMENT_REACTION_
      // REMOVED would clear the indicator for peers who never had it, and
      // replying error would make the client roll its optimistic un-react back
      // and re-show a reaction that is gone. Mirrors ReactionHandler's
      // already-absent guard.
      const service = makeService({
        removeAttachmentReaction: jest.fn<any>().mockResolvedValue(false),
      });
      const cb = jest.fn();
      const { handler, io } = makeHandler({ service });
      const socket = makeSocket();

      await handler.handleRemove(socket, validData, cb);

      const toRoom = (io as any)._toRoom;
      expect(toRoom.emit).not.toHaveBeenCalled();
      expect(service.getReactionSummary).not.toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith({ success: true });
    });
  });
});
