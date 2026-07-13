/**
 * Auto-deliver pipeline test for MessageHandler.broadcastNewMessage.
 *
 * Verifies the fix for "sender's checkmark stuck at 1 check even when the
 * recipient is online":
 * - When a message is broadcast, online recipients (those with an active
 *   socket connection) MUST be auto-marked as `received` server-side.
 * - The corresponding `read-status:updated` event MUST then be emitted to
 *   the conversation room and each active participant's user room so the
 *   sender's UI upgrades from `.sent` to `.delivered` immediately.
 * - Recipients whose `showReadReceipts` privacy preference is `false` MUST
 *   be skipped (no `markMessagesAsReceived`, no broadcast triggered by
 *   them).
 * - Privacy preferences MUST be resolved through the shared injected
 *   service in a single batched call, and participants MUST be fetched
 *   with a single query reused for both recipients and room fanout.
 *
 * @jest-environment node
 */

jest.mock('../../../services/MessagingService', () => ({ MessagingService: jest.fn() }));
jest.mock('../../../services/StatusService', () => ({ StatusService: jest.fn() }));
jest.mock('../../../services/notifications/NotificationService', () => ({ NotificationService: jest.fn() }));
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn()
}));
jest.mock('../../../services/attachments/AttachmentService', () => ({ AttachmentService: jest.fn() }));
jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: { updateOnNewMessage: jest.fn().mockResolvedValue(null) }
}));
jest.mock('../../../services/ConversationMessageStatsService', () => ({
  conversationMessageStatsService: {}
}));
jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn().mockResolvedValue([])
}));

import { MessageHandler } from '../../../socketio/handlers/MessageHandler';

interface AutoDeliverAccess {
  autoDeliverToOnlineRecipients(msg: unknown, conversationId: string): Promise<void>;
}

const senderParticipantId = 'p_sender';
const onlineParticipantId = 'p_online';
const offlineParticipantId = 'p_offline';
const senderUserId = 'u_sender';
const onlineUserId = 'u_online';
const offlineUserId = 'u_offline';
const conversationId = 'c_test';
const messageId = 'm_test';

function makeHandler(overrides: { onlineUsers: string[]; showReadReceipts?: boolean }) {
  const emit = jest.fn();
  const to = jest.fn(() => ({ to, emit }));
  const io: any = { to };

  const prisma: any = {
    participant: {
      findMany: jest.fn().mockResolvedValue([
        { id: senderParticipantId, userId: senderUserId },
        { id: onlineParticipantId, userId: onlineUserId },
        { id: offlineParticipantId, userId: offlineUserId }
      ])
    }
  };

  const readStatusService: any = {
    markMessagesAsReceived: jest.fn().mockResolvedValue(undefined),
    getLatestMessageSummary: jest.fn().mockResolvedValue({
      totalMembers: 2,
      deliveredCount: 1,
      readCount: 0
    })
  };

  const showReadReceipts = overrides.showReadReceipts ?? true;
  const privacyPreferencesService: any = {
    getPreferencesForUsers: jest.fn().mockImplementation(
      async (users: Array<{ id: string; isAnonymous: boolean }>) =>
        new Map(users.map((u) => [u.id, { showReadReceipts }]))
    )
  };

  const connectedUsers = new Map<string, unknown>();
  for (const u of overrides.onlineUsers) connectedUsers.set(u, { id: u });

  const handler = new MessageHandler({
    io,
    prisma,
    messagingService: {} as any,
    translationService: {} as any,
    statusService: {} as any,
    notificationService: {} as any,
    connectedUsers: connectedUsers as any,
    socketToUser: new Map(),
    stats: { messages_processed: 0, errors: 0 },
    attachmentService: {} as any,
    readStatusService,
    privacyPreferencesService
  });

  return {
    handler: handler as unknown as AutoDeliverAccess,
    prisma,
    readStatusService,
    privacyPreferencesService,
    io,
    to,
    emit
  };
}

describe('MessageHandler — auto-deliver to online recipients', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks the online recipient as received and broadcasts read-status:updated', async () => {
    const { handler, prisma, readStatusService, privacyPreferencesService, to, emit } =
      makeHandler({ onlineUsers: [onlineUserId] });

    await handler.autoDeliverToOnlineRecipients(
      { id: messageId, senderId: senderParticipantId } as any,
      conversationId
    );

    expect(readStatusService.markMessagesAsReceived).toHaveBeenCalledTimes(1);
    expect(readStatusService.markMessagesAsReceived).toHaveBeenCalledWith(
      onlineParticipantId,
      conversationId,
      messageId
    );

    // Single participants query reused for recipients + room fanout.
    expect(prisma.participant.findMany).toHaveBeenCalledTimes(1);

    // Privacy resolved in one batched call, only for online recipients.
    expect(privacyPreferencesService.getPreferencesForUsers).toHaveBeenCalledTimes(1);
    expect(privacyPreferencesService.getPreferencesForUsers).toHaveBeenCalledWith([
      { id: onlineUserId, isAnonymous: false }
    ]);

    // Conversation room + 3 user rooms (sender, online, offline). Sender's room
    // is included so the sender receives the receipt while in another view.
    expect(to).toHaveBeenCalled();
    const roomTargets = to.mock.calls.map((c) => c[0]);
    expect(roomTargets).toEqual(expect.arrayContaining([
      `conversation:${conversationId}`,
      `user:${senderUserId}`,
      `user:${onlineUserId}`,
      `user:${offlineUserId}`
    ]));

    // 2 events: legacy read-status:updated + dual-emitted message:read-status-updated
    // (same payload — see tasks/socketio-events-cleanup.md #3).
    expect(emit).toHaveBeenCalledTimes(2);
    const [eventName, payload] = emit.mock.calls[0];
    expect(eventName).toBe('read-status:updated');
    expect(payload).toMatchObject({
      conversationId,
      type: 'received',
      participantId: onlineParticipantId,
      userId: onlineUserId,
      summary: { totalMembers: 2, deliveredCount: 1, readCount: 0 }
    });
    const [dualEventName, dualPayload] = emit.mock.calls[1];
    expect(dualEventName).toBe('message:read-status-updated');
    expect(dualPayload).toEqual(payload);
  });

  it('marks all online recipients in parallel and acks with the first of them', async () => {
    const { handler, readStatusService, emit } = makeHandler({
      onlineUsers: [onlineUserId, offlineUserId]
    });

    await handler.autoDeliverToOnlineRecipients(
      { id: messageId, senderId: senderParticipantId } as any,
      conversationId
    );

    expect(readStatusService.markMessagesAsReceived).toHaveBeenCalledTimes(2);
    expect(readStatusService.markMessagesAsReceived).toHaveBeenCalledWith(
      onlineParticipantId,
      conversationId,
      messageId
    );
    expect(readStatusService.markMessagesAsReceived).toHaveBeenCalledWith(
      offlineParticipantId,
      conversationId,
      messageId
    );

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[0][1]).toMatchObject({
      participantId: onlineParticipantId,
      userId: onlineUserId
    });
    expect(emit.mock.calls[1][1]).toMatchObject({
      participantId: onlineParticipantId,
      userId: onlineUserId
    });
  });

  it('still broadcasts when one mark fails but another succeeds', async () => {
    const { handler, readStatusService, emit } = makeHandler({
      onlineUsers: [onlineUserId, offlineUserId]
    });
    readStatusService.markMessagesAsReceived
      .mockRejectedValueOnce(new Error('cursor conflict'))
      .mockResolvedValueOnce(undefined);

    await handler.autoDeliverToOnlineRecipients(
      { id: messageId, senderId: senderParticipantId } as any,
      conversationId
    );

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[0][1]).toMatchObject({
      participantId: offlineParticipantId,
      userId: offlineUserId
    });
    expect(emit.mock.calls[1][1]).toMatchObject({
      participantId: offlineParticipantId,
      userId: offlineUserId
    });
  });

  it('does nothing when no recipient is online', async () => {
    const { handler, readStatusService, emit } = makeHandler({ onlineUsers: [] });

    await handler.autoDeliverToOnlineRecipients(
      { id: messageId, senderId: senderParticipantId } as any,
      conversationId
    );

    expect(readStatusService.markMessagesAsReceived).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('skips recipients whose privacy preference disables read receipts', async () => {
    const { handler, readStatusService, emit } = makeHandler({
      onlineUsers: [onlineUserId],
      showReadReceipts: false
    });

    await handler.autoDeliverToOnlineRecipients(
      { id: messageId, senderId: senderParticipantId } as any,
      conversationId
    );

    expect(readStatusService.markMessagesAsReceived).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('aborts safely when senderId is missing', async () => {
    const { handler, readStatusService, emit } = makeHandler({ onlineUsers: [onlineUserId] });

    await handler.autoDeliverToOnlineRecipients(
      { id: messageId, senderId: null } as any,
      conversationId
    );

    expect(readStatusService.markMessagesAsReceived).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
