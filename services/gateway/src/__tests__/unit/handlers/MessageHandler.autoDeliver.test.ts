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

const mockShouldShowReadReceipts = jest.fn();
jest.mock('../../../services/PrivacyPreferencesService.js', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({
    shouldShowReadReceipts: mockShouldShowReadReceipts
  }))
}));

import { MessageHandler } from '../../../socketio/handlers/MessageHandler';

interface AutoDeliverAccess {
  _autoDeliverToOnlineRecipients(msg: unknown, conversationId: string): Promise<void>;
}

const senderParticipantId = 'p_sender';
const onlineParticipantId = 'p_online';
const offlineParticipantId = 'p_offline';
const onlineUserId = 'u_online';
const offlineUserId = 'u_offline';
const conversationId = 'c_test';
const messageId = 'm_test';

function makeHandler(overrides: { onlineUsers: string[] }) {
  const emit = jest.fn();
  const to = jest.fn(() => ({ to, emit }));
  const io: any = { to };

  const prisma: any = {
    participant: {
      findMany: jest.fn().mockImplementation(({ where, select }: any) => {
        // Active recipients except sender
        if (where?.id?.not === senderParticipantId) {
          return Promise.resolve([
            { id: onlineParticipantId, userId: onlineUserId },
            { id: offlineParticipantId, userId: offlineUserId }
          ]);
        }
        // All active participants for fanout
        return Promise.resolve([
          { userId: 'u_sender' },
          { userId: onlineUserId },
          { userId: offlineUserId }
        ]);
      })
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
    readStatusService
  });

  return {
    handler: handler as unknown as AutoDeliverAccess,
    prisma,
    readStatusService,
    io,
    to,
    emit
  };
}

describe('MessageHandler — auto-deliver to online recipients', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShouldShowReadReceipts.mockReset();
    mockShouldShowReadReceipts.mockResolvedValue(true);
  });

  it('marks the online recipient as received and broadcasts read-status:updated', async () => {
    const { handler, readStatusService, to, emit } = makeHandler({ onlineUsers: [onlineUserId] });

    await handler._autoDeliverToOnlineRecipients(
      { id: messageId, senderId: senderParticipantId } as any,
      conversationId
    );

    expect(readStatusService.markMessagesAsReceived).toHaveBeenCalledTimes(1);
    expect(readStatusService.markMessagesAsReceived).toHaveBeenCalledWith(
      onlineParticipantId,
      conversationId,
      messageId
    );

    // Conversation room + 3 user rooms (sender, online, offline). Sender's room
    // is included so the sender receives the receipt while in another view.
    expect(to).toHaveBeenCalled();
    const roomTargets = to.mock.calls.map((c) => c[0]);
    expect(roomTargets).toEqual(expect.arrayContaining([
      `conversation:${conversationId}`,
      'user:u_sender',
      `user:${onlineUserId}`,
      `user:${offlineUserId}`
    ]));

    expect(emit).toHaveBeenCalledTimes(1);
    const [eventName, payload] = emit.mock.calls[0];
    expect(eventName).toBe('read-status:updated');
    expect(payload).toMatchObject({
      conversationId,
      type: 'received',
      participantId: onlineParticipantId,
      userId: onlineUserId,
      summary: { totalMembers: 2, deliveredCount: 1, readCount: 0 }
    });
  });

  it('does nothing when no recipient is online', async () => {
    const { handler, readStatusService, emit } = makeHandler({ onlineUsers: [] });

    await handler._autoDeliverToOnlineRecipients(
      { id: messageId, senderId: senderParticipantId } as any,
      conversationId
    );

    expect(readStatusService.markMessagesAsReceived).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('skips recipients whose privacy preference disables read receipts', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(false);
    const { handler, readStatusService, emit } = makeHandler({ onlineUsers: [onlineUserId] });

    await handler._autoDeliverToOnlineRecipients(
      { id: messageId, senderId: senderParticipantId } as any,
      conversationId
    );

    expect(readStatusService.markMessagesAsReceived).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('aborts safely when senderId is missing', async () => {
    const { handler, readStatusService, emit } = makeHandler({ onlineUsers: [onlineUserId] });

    await handler._autoDeliverToOnlineRecipients(
      { id: messageId, senderId: null } as any,
      conversationId
    );

    expect(readStatusService.markMessagesAsReceived).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
