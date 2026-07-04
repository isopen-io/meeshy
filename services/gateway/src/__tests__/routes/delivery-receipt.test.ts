/**
 * Route tests — POST /conversations/:conversationId/messages/:messageId/delivery-receipt
 *
 * Push-driven delivery acknowledgement used by the iOS Notification Service
 * Extension for OFFLINE recipients (no socket → the online auto-delivery path
 * never fires for them). Verifies the delivery cursor advance and the
 * `read-status:updated` broadcast gated on `showReadReceipts`.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import messageReadStatusRoutes from '../../routes/message-read-status';
import { MessageReadStatusService } from '../../services/MessageReadStatusService';

const RECIPIENT_USER_ID = 'recipient-user-1';
const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const MESSAGE_ID = '507f1f77bcf86cd799439013';
const PARTICIPANT_ID = '507f1f77bcf86cd799439011';
const SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439099';

// --- module mocks (names must start with `mock` for jest hoisting) ---

const mockResolveConversationId = jest.fn();
jest.mock('../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args)
}));

const mockShouldShowReadReceipts = jest.fn();
jest.mock('../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({
    shouldShowReadReceipts: mockShouldShowReadReceipts
  }))
}));

jest.mock('../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (request: any) => {
    request.authContext = { userId: 'recipient-user-1', type: 'registered', hasFullAccess: true };
  }
}));

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn()
}));

// --- mock Prisma & Socket.IO collaborators ---

const mockPrisma: any = {
  participant: { findFirst: jest.fn(), findMany: jest.fn() },
  message: { findUnique: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  conversationReadCursor: {
    upsert: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn()
  }
};

const emitMock = jest.fn();
const ioChain: any = {};
ioChain.to = jest.fn(() => ioChain);
ioChain.emit = emitMock;
const io = { to: jest.fn(() => ioChain) };
const socketIOHandler = { getManager: () => ({ getIO: () => io }) };

const url = (conversationId = CONVERSATION_ID, messageId = MESSAGE_ID) =>
  `/conversations/${conversationId}/messages/${messageId}/delivery-receipt`;

describe('POST /conversations/:conversationId/messages/:messageId/delivery-receipt', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);
    app.decorate('socketIOHandler', socketIOHandler as any);
    await app.register(messageReadStatusRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (MessageReadStatusService as any).recentActionCache.clear();

    // Happy-path defaults — individual tests override as needed.
    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
    mockShouldShowReadReceipts.mockResolvedValue(true);
    mockPrisma.participant.findFirst.mockResolvedValue({ id: PARTICIPANT_ID });
    mockPrisma.message.findUnique.mockResolvedValue({
      conversationId: CONVERSATION_ID,
      senderId: SENDER_PARTICIPANT_ID,
      deletedAt: null
    });
    mockPrisma.conversationReadCursor.upsert.mockResolvedValue({});
    mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
    mockPrisma.conversationReadCursor.update.mockResolvedValue({});
    mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.message.findFirst.mockResolvedValue({
      createdAt: new Date(),
      senderId: SENDER_PARTICIPANT_ID
    });
    mockPrisma.participant.findMany.mockImplementation(async (args: any) => {
      if (args?.select?.userId) return [{ userId: RECIPIENT_USER_ID }];
      return [{ id: PARTICIPANT_ID }];
    });
  });

  it('advances the delivery cursor for the pushed message and broadcasts read-status:updated', async () => {
    const response = await app.inject({ method: 'POST', url: url() });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true });

    expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledTimes(1);
    const updateManyArg = mockPrisma.conversationReadCursor.updateMany.mock.calls[0][0];
    expect(updateManyArg.data.lastDeliveredMessageId).toBe(MESSAGE_ID);

    expect(emitMock).toHaveBeenCalledTimes(1);
    const [eventName, payload] = emitMock.mock.calls[0];
    expect(eventName).toBe(SERVER_EVENTS.READ_STATUS_UPDATED);
    expect(payload).toMatchObject({
      conversationId: CONVERSATION_ID,
      participantId: PARTICIPANT_ID,
      type: 'received'
    });
    // A 'received' (delivery) broadcast never advances the read cursor, so it
    // omits the per-actor read-sync fields — they would just be dropped by the
    // client and would disclose the actor's backlog to peers.
    expect(payload.lastReadAt).toBeUndefined();
    expect(payload.unreadCount).toBeUndefined();
  });

  it('emits the actor read frontier and unread count on a mark-as-read broadcast', async () => {
    const frontier = new Date('2026-06-24T10:00:00.000Z');
    mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: frontier });
    mockPrisma.message.count.mockResolvedValue(3);

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    expect(response.statusCode).toBe(200);
    // 2 events: READ_STATUS_UPDATED (for senders' checkmarks) +
    // CONVERSATION_UNREAD_UPDATED (for the reader's own badge reset).
    expect(emitMock).toHaveBeenCalledTimes(2);
    const [eventName, payload] = emitMock.mock.calls[0];
    expect(eventName).toBe(SERVER_EVENTS.READ_STATUS_UPDATED);
    expect(payload.type).toBe('read');
    // A 'read' carries the per-actor multi-device sync fields.
    expect(payload.lastReadAt).toEqual(frontier);
    expect(payload.unreadCount).toBe(3);
    // Badge reset event goes to the reader's user room.
    const [badgeEvent, badgePayload] = emitMock.mock.calls[1];
    expect(badgeEvent).toBe(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED);
    expect(badgePayload).toMatchObject({ conversationId: CONVERSATION_ID, unreadCount: 3 });
  });

  it('returns 404 when the conversation identifier cannot be resolved', async () => {
    mockResolveConversationId.mockResolvedValue(null);

    const response = await app.inject({ method: 'POST', url: url() });

    expect(response.statusCode).toBe(404);
    expect(mockPrisma.conversationReadCursor.upsert).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not an active participant', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    const response = await app.inject({ method: 'POST', url: url() });

    expect(response.statusCode).toBe(403);
    expect(mockPrisma.conversationReadCursor.upsert).not.toHaveBeenCalled();
  });

  it('returns 404 when the message does not exist', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(null);

    const response = await app.inject({ method: 'POST', url: url() });

    expect(response.statusCode).toBe(404);
    expect(mockPrisma.conversationReadCursor.upsert).not.toHaveBeenCalled();
  });

  it('returns 404 when the message belongs to a different conversation', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      conversationId: 'some-other-conversation',
      senderId: SENDER_PARTICIPANT_ID,
      deletedAt: null
    });

    const response = await app.inject({ method: 'POST', url: url() });

    expect(response.statusCode).toBe(404);
    expect(mockPrisma.conversationReadCursor.upsert).not.toHaveBeenCalled();
  });

  it('returns 404 when the message is deleted', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      conversationId: CONVERSATION_ID,
      senderId: SENDER_PARTICIPANT_ID,
      deletedAt: new Date()
    });

    const response = await app.inject({ method: 'POST', url: url() });

    expect(response.statusCode).toBe(404);
    expect(mockPrisma.conversationReadCursor.upsert).not.toHaveBeenCalled();
  });

  it('advances the cursor but suppresses the broadcast when the recipient disabled read receipts', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(false);

    const response = await app.inject({ method: 'POST', url: url() });

    expect(response.statusCode).toBe(200);
    expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledTimes(1);
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('is a no-op when the caller is the sender of the message', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      conversationId: CONVERSATION_ID,
      senderId: PARTICIPANT_ID,
      deletedAt: null
    });

    const response = await app.inject({ method: 'POST', url: url() });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true });
    expect(mockPrisma.conversationReadCursor.upsert).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the messageId is not a valid ObjectId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: url(CONVERSATION_ID, 'not-a-valid-object-id')
    });

    expect(response.statusCode).toBe(400);
    expect(mockPrisma.conversationReadCursor.upsert).not.toHaveBeenCalled();
  });
});
