/**
 * Unit tests for AttachmentReactionHandler (BUG2 A').
 * Covers add/remove paths, all validation guards, and the IDOR check.
 */

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    ATTACHMENT_REACTION_ADDED: 'attachment:reaction-added',
    ATTACHMENT_REACTION_REMOVED: 'attachment:reaction-removed',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
  },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }),
  },
}));

import { AttachmentReactionHandler } from '../../../socketio/handlers/AttachmentReactionHandler';
import type { AttachmentReactionHandlerDependencies } from '../../../socketio/handlers/AttachmentReactionHandler';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_MSG_ID = 'aaaaaa000000000000000001';
const VALID_ATT_ID = 'bbbbbb000000000000000002';
const VALID_CONV_ID = 'cccccc000000000000000003';
const PARTICIPANT_ID = 'dddddd000000000000000004';
const SOCKET_ID = 'socket-abc';
const USER_ID = 'user-xyz';
const EMOJI = '👍';

function makeIo() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { io: { to }, emit, to };
}

function makePrisma(overrides: Partial<{
  messageFindUnique: unknown;
  participantFindFirst: unknown;
  attachmentFindUnique: unknown;
}> = {}) {
  return {
    message: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.messageFindUnique !== undefined
          ? overrides.messageFindUnique
          : { conversationId: VALID_CONV_ID }
      ),
    },
    participant: {
      findFirst: jest.fn().mockResolvedValue(
        overrides.participantFindFirst !== undefined
          ? overrides.participantFindFirst
          : { id: PARTICIPANT_ID, displayName: 'Alice', nickname: null }
      ),
    },
    messageAttachment: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.attachmentFindUnique !== undefined
          ? overrides.attachmentFindUnique
          : { messageId: VALID_MSG_ID }
      ),
    },
  };
}

function makeService(summaryOverride?: unknown) {
  return {
    resolveConversationId: jest.fn().mockResolvedValue(VALID_CONV_ID),
    addAttachmentReaction: jest.fn().mockResolvedValue({ changed: true }),
    removeAttachmentReaction: jest.fn().mockResolvedValue(true),
    getReactionSummary: jest.fn().mockResolvedValue(summaryOverride ?? []),
  } as unknown as import('../../../services/AttachmentReactionService').AttachmentReactionService;
}

function makeConnectedUsers(isAnonymous = false) {
  const map = new Map<string, unknown>();
  map.set(USER_ID, {
    id: USER_ID,
    userId: USER_ID,
    isAnonymous,
    displayName: 'Alice',
    participantId: null,
  });
  return map;
}

function makeSocketToUser() {
  const map = new Map<string, string>();
  map.set(SOCKET_ID, USER_ID);
  return map;
}

function makeSocket() {
  return { id: SOCKET_ID } as any;
}

function makeDeps(overrides: {
  prisma?: ReturnType<typeof makePrisma>;
  service?: ReturnType<typeof makeService>;
  io?: ReturnType<typeof makeIo>['io'];
  connectedUsers?: Map<string, unknown>;
  socketToUser?: Map<string, string>;
} = {}): AttachmentReactionHandlerDependencies {
  const fake = makeIo();
  return {
    io: overrides.io ?? (fake.io as any),
    prisma: (overrides.prisma ?? makePrisma()) as any,
    service: overrides.service ?? makeService(),
    connectedUsers: (overrides.connectedUsers ?? makeConnectedUsers()) as any,
    socketToUser: overrides.socketToUser ?? makeSocketToUser(),
  };
}

function makePayload(overrides: Partial<{attachmentId: string; messageId: string; emoji: string}> = {}) {
  return {
    attachmentId: VALID_ATT_ID,
    messageId: VALID_MSG_ID,
    emoji: EMOJI,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AttachmentReactionHandler', () => {

  // ─── validation guards ─────────────────────────────────────────────────────

  describe('validation guards', () => {
    it('returns error when payload is missing attachmentId', async () => {
      const deps = makeDeps();
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();
      await handler.handleAdd(makeSocket(), makePayload({ attachmentId: '' }), cb);
      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Invalid payload' });
    });

    it('returns error when payload is missing messageId', async () => {
      const deps = makeDeps();
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();
      await handler.handleAdd(makeSocket(), makePayload({ messageId: '' }), cb);
      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Invalid payload' });
    });

    it('returns error when payload is missing emoji', async () => {
      const deps = makeDeps();
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();
      await handler.handleAdd(makeSocket(), makePayload({ emoji: '' }), cb);
      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Invalid payload' });
    });

    it('rejects non-ObjectId messageId (optimistic/temp id)', async () => {
      const deps = makeDeps();
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();
      await handler.handleAdd(makeSocket(), makePayload({ messageId: 'cid_temp_123' }), cb);
      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
    });

    it('rejects non-ObjectId attachmentId', async () => {
      const deps = makeDeps();
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();
      await handler.handleAdd(makeSocket(), makePayload({ attachmentId: 'not-an-object-id' }), cb);
      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
    });

    it('returns error when socket user is not in socketToUser map', async () => {
      const deps = makeDeps({ socketToUser: new Map() });
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();
      await handler.handleAdd(makeSocket(), makePayload(), cb);
      expect(cb).toHaveBeenCalledWith({ success: false, error: 'User not authenticated' });
    });

    it('returns error when participant resolution fails (user not in conversation)', async () => {
      const prisma = makePrisma({ participantFindFirst: null });
      const deps = makeDeps({ prisma });
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();
      await handler.handleAdd(makeSocket(), makePayload(), cb);
      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
    });

    it('returns error when message does not exist in DB', async () => {
      const prisma = makePrisma({ messageFindUnique: null });
      const deps = makeDeps({ prisma });
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();
      await handler.handleAdd(makeSocket(), makePayload(), cb);
      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
    });

    it('returns error when conversationId cannot be resolved from service', async () => {
      const service = makeService();
      service.resolveConversationId = jest.fn().mockResolvedValue(null);
      const deps = makeDeps({ service });
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();
      await handler.handleAdd(makeSocket(), makePayload(), cb);
      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Message not found' });
    });

    it('returns error (IDOR) when attachment belongs to a different message', async () => {
      const prisma = makePrisma({ attachmentFindUnique: { messageId: 'eeeeee000000000000000005' } });
      const deps = makeDeps({ prisma });
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();
      await handler.handleAdd(makeSocket(), makePayload(), cb);
      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Attachment not found' });
    });

    it('returns error (IDOR) when attachment does not exist', async () => {
      const prisma = makePrisma({ attachmentFindUnique: null });
      const deps = makeDeps({ prisma });
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();
      await handler.handleAdd(makeSocket(), makePayload(), cb);
      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Attachment not found' });
    });
  });

  // ─── handleAdd ────────────────────────────────────────────────────────────────

  describe('handleAdd', () => {
    it('calls addAttachmentReaction and broadcasts attachment:reaction-added', async () => {
      const fakeIo = makeIo();
      const service = makeService({ emoji: EMOJI, count: 1 });
      const deps = makeDeps({ service, io: fakeIo.io as any });
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();

      await handler.handleAdd(makeSocket(), makePayload(), cb);

      expect(service.addAttachmentReaction).toHaveBeenCalledWith({
        attachmentId: VALID_ATT_ID,
        messageId: VALID_MSG_ID,
        participantId: PARTICIPANT_ID,
        emoji: EMOJI,
      });
      expect(fakeIo.to).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`);
      expect(fakeIo.emit).toHaveBeenCalledWith(
        'attachment:reaction-added',
        expect.objectContaining({
          attachmentId: VALID_ATT_ID,
          messageId: VALID_MSG_ID,
          conversationId: VALID_CONV_ID,
          emoji: EMOJI,
          action: 'add',
        })
      );
      expect(cb).toHaveBeenCalledWith({ success: true });
    });

    it('includes the reaction summary returned by the service in the broadcast', async () => {
      const fakeIo = makeIo();
      const reactionSummary = [{ emoji: EMOJI, count: 3, participantIds: [PARTICIPANT_ID] }];
      const service = makeService(reactionSummary);
      const deps = makeDeps({ service, io: fakeIo.io as any });
      const handler = new AttachmentReactionHandler(deps);

      await handler.handleAdd(makeSocket(), makePayload(), jest.fn());

      expect(fakeIo.emit).toHaveBeenCalledWith(
        'attachment:reaction-added',
        expect.objectContaining({ reactionSummary })
      );
    });

    it('works without a callback', async () => {
      const deps = makeDeps();
      const handler = new AttachmentReactionHandler(deps);
      await expect(handler.handleAdd(makeSocket(), makePayload())).resolves.toBeUndefined();
    });
  });

  // ─── handleRemove ─────────────────────────────────────────────────────────────

  describe('handleRemove', () => {
    it('calls removeAttachmentReaction and broadcasts attachment:reaction-removed', async () => {
      const fakeIo = makeIo();
      const service = makeService();
      const deps = makeDeps({ service, io: fakeIo.io as any });
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();

      await handler.handleRemove(makeSocket(), makePayload(), cb);

      expect(service.removeAttachmentReaction).toHaveBeenCalledWith({
        attachmentId: VALID_ATT_ID,
        participantId: PARTICIPANT_ID,
        emoji: EMOJI,
      });
      expect(fakeIo.emit).toHaveBeenCalledWith(
        'attachment:reaction-removed',
        expect.objectContaining({ action: 'remove' })
      );
      expect(cb).toHaveBeenCalledWith({ success: true });
    });

    it('idempotent no-op re-add (changed:false) — replies success but does NOT re-broadcast', async () => {
      const fakeIo = makeIo();
      const service = makeService();
      (service.addAttachmentReaction as jest.Mock).mockResolvedValue({ changed: false });
      const deps = makeDeps({ service, io: fakeIo.io as any });
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();

      await handler.handleAdd(makeSocket(), makePayload(), cb);

      expect(fakeIo.emit).not.toHaveBeenCalled();
      expect(service.getReactionSummary).not.toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith({ success: true });
    });

    it('idempotent already-absent remove (returns false) — replies success but does NOT broadcast', async () => {
      const fakeIo = makeIo();
      const service = makeService();
      (service.removeAttachmentReaction as jest.Mock).mockResolvedValue(false);
      const deps = makeDeps({ service, io: fakeIo.io as any });
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();

      await handler.handleRemove(makeSocket(), makePayload(), cb);

      expect(fakeIo.emit).not.toHaveBeenCalled();
      expect(service.getReactionSummary).not.toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith({ success: true });
    });
  });

  // ─── anonymous user path ──────────────────────────────────────────────────────

  describe('anonymous user path', () => {
    function makeAnonConnectedUsers() {
      const anonUser = {
        id: USER_ID,
        userId: USER_ID,
        isAnonymous: true,
        displayName: 'Guest',
        participantId: 'anon-participant-id',
      };
      const connectedUsers = new Map<string, unknown>();
      connectedUsers.set(USER_ID, anonUser);
      return connectedUsers;
    }

    it('reacts when the anonymous participant is active in the target conversation', async () => {
      const fakeIo = makeIo();
      const service = makeService();
      // The anon participant IS a member of this conversation → the membership
      // lookup echoes its own id (query is by { id, conversationId, isActive }).
      const prisma = makePrisma({
        participantFindFirst: { id: 'anon-participant-id', displayName: 'Guest', nickname: null },
      });
      const deps = makeDeps({
        prisma,
        service,
        io: fakeIo.io as any,
        connectedUsers: makeAnonConnectedUsers() as any,
      });
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();

      await handler.handleAdd(makeSocket(), makePayload(), cb);

      // Security: identity is verified against the DB, scoped to the conversation.
      expect(prisma.participant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'anon-participant-id', conversationId: VALID_CONV_ID, isActive: true },
        })
      );
      expect(service.addAttachmentReaction).toHaveBeenCalledWith(
        expect.objectContaining({ participantId: 'anon-participant-id' })
      );
      expect(cb).toHaveBeenCalledWith({ success: true });
    });

    it('rejects when the anonymous participant is not a member of the conversation', async () => {
      const fakeIo = makeIo();
      const service = makeService();
      // No active row for this (participant, conversation) → cross-conversation attempt.
      const prisma = makePrisma({ participantFindFirst: null });
      const deps = makeDeps({
        prisma,
        service,
        io: fakeIo.io as any,
        connectedUsers: makeAnonConnectedUsers() as any,
      });
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();

      await handler.handleAdd(makeSocket(), makePayload(), cb);

      expect(service.addAttachmentReaction).not.toHaveBeenCalled();
      expect(fakeIo.emit).not.toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
    });
  });

  // ─── error handling ────────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('catches service errors and returns failure without throwing', async () => {
      const service = makeService();
      service.addAttachmentReaction = jest.fn().mockRejectedValue(new Error('DB failure'));
      const deps = makeDeps({ service });
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();

      await expect(handler.handleAdd(makeSocket(), makePayload(), cb)).resolves.toBeUndefined();
      expect(cb).toHaveBeenCalledWith({ success: false, error: 'DB failure' });
    });

    it('returns generic failure message for non-Error throws', async () => {
      const service = makeService();
      service.resolveConversationId = jest.fn().mockRejectedValue('unexpected string error');
      const deps = makeDeps({ service });
      const handler = new AttachmentReactionHandler(deps);
      const cb = jest.fn();

      await handler.handleAdd(makeSocket(), makePayload(), cb);
      expect(cb).toHaveBeenCalledWith({ success: false, error: 'Failed' });
    });
  });
});
