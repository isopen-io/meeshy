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

function makeHandler(overrides: {
  onlineUsers: string[];
  showReadReceipts?: boolean;
  participants?: Array<{ id: string; userId: string | null }>;
}) {
  const emit = jest.fn();
  const to = jest.fn(() => ({ to, emit }));
  const io: any = { to };

  const prisma: any = {
    participant: {
      findMany: jest.fn().mockResolvedValue(
        overrides.participants ?? [
          { id: senderParticipantId, userId: senderUserId },
          { id: onlineParticipantId, userId: onlineUserId },
          { id: offlineParticipantId, userId: offlineUserId }
        ]
      )
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

  /**
   * La préférence tait la DIFFUSION, elle n'annule pas l'ENREGISTREMENT — même
   * contrat que les portes REST et que `broadcastReadStatus`. Ce témoin disait
   * l'inverse jusqu'au cycle 45 : l'état de livraison dépendait alors du
   * transport, et l'arriéré d'un destinataire qui RÉACTIVE ses accusés
   * ressortait « jamais livré ».
   */
  it('records the delivery of a recipient whose privacy preference disables read receipts', async () => {
    const { handler, readStatusService } = makeHandler({
      onlineUsers: [onlineUserId],
      showReadReceipts: false
    });

    await handler.autoDeliverToOnlineRecipients(
      { id: messageId, senderId: senderParticipantId } as any,
      conversationId
    );

    expect(readStatusService.markMessagesAsReceived).toHaveBeenCalledWith(
      onlineParticipantId,
      conversationId,
      messageId
    );
  });

  it('emits no receipt for recipients whose privacy preference disables read receipts', async () => {
    const { handler, emit } = makeHandler({
      onlineUsers: [onlineUserId],
      showReadReceipts: false
    });

    await handler.autoDeliverToOnlineRecipients(
      { id: messageId, senderId: senderParticipantId } as any,
      conversationId
    );

    expect(emit).not.toHaveBeenCalled();
  });

  it('excludes the sender on the WS path where senderId is the User.id and the sender is online', async () => {
    // WS `message:send` path: MessagingService.createSuccessResponse normalises
    // `senderId` to the sender's User.id (clients compare against their userId),
    // whereas the REST/ZMQ path keeps it as the raw Participant.id. The sender is
    // ALWAYS online at broadcast time (they just sent), so exclusion must key off
    // identity, not presence — otherwise the sender's own message is auto-marked
    // `received` and their UI shows a false delivered (✓✓) receipt.
    const { handler, readStatusService } = makeHandler({
      onlineUsers: [senderUserId, onlineUserId]
    });

    await handler.autoDeliverToOnlineRecipients(
      { id: messageId, senderId: senderUserId } as any,
      conversationId
    );

    expect(readStatusService.markMessagesAsReceived).toHaveBeenCalledTimes(1);
    expect(readStatusService.markMessagesAsReceived).toHaveBeenCalledWith(
      onlineParticipantId,
      conversationId,
      messageId
    );
    expect(readStatusService.markMessagesAsReceived).not.toHaveBeenCalledWith(
      senderParticipantId,
      conversationId,
      messageId
    );
  });

  it('excludes an anonymous sender on the WS path where senderId stays the Participant.id', async () => {
    // Anonymous senders have no User.id, so createSuccessResponse falls back to
    // the Participant.id — the exclusion must still hold on that representation.
    const { handler, readStatusService } = makeHandler({
      onlineUsers: [senderUserId, onlineUserId]
    });

    await handler.autoDeliverToOnlineRecipients(
      { id: messageId, senderId: senderParticipantId } as any,
      conversationId
    );

    expect(readStatusService.markMessagesAsReceived).toHaveBeenCalledTimes(1);
    expect(readStatusService.markMessagesAsReceived).not.toHaveBeenCalledWith(
      senderParticipantId,
      conversationId,
      messageId
    );
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

/**
 * Anonymous recipients.
 *
 * An anonymous participant has NO `User` row: `Participant.userId` is null and
 * `AuthHandler._registerUser` keys them in `connectedUsers` by their
 * `Participant.id` (registered users are keyed by `User.id`). A liveness test
 * written as `!!p.userId && connectedUsers.has(p.userId)` therefore cannot ever
 * be true for them — they are excluded by CONSTRUCTION, not by circumstance.
 *
 * That exclusion is not cosmetic: `getLatestMessageSummary` counts every active
 * participant by `Participant.id` in `totalMembers`, anonymous included. An
 * anonymous participant that can never enter `deliveredCount` while sitting in
 * the denominator makes "delivered by all" unreachable for the whole
 * conversation — which is precisely the shape of every share-link conversation.
 */
const anonParticipantId = 'p_anon';

describe('MessageHandler — auto-deliver reaches anonymous recipients', () => {
  const participantsWithAnon = [
    { id: senderParticipantId, userId: senderUserId },
    { id: anonParticipantId, userId: null },
    { id: offlineParticipantId, userId: offlineUserId }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks a connected anonymous participant as received', async () => {
    const { handler, readStatusService } = makeHandler({
      onlineUsers: [anonParticipantId],
      participants: participantsWithAnon
    });

    await handler.autoDeliverToOnlineRecipients(
      { id: messageId, senderId: senderParticipantId } as any,
      conversationId
    );

    expect(readStatusService.markMessagesAsReceived).toHaveBeenCalledTimes(1);
    expect(readStatusService.markMessagesAsReceived).toHaveBeenCalledWith(
      anonParticipantId,
      conversationId,
      messageId
    );
  });

  it('resolves the anonymous recipient privacy preferences as anonymous', async () => {
    // Anonymous ids are Participant ids: a lookup declaring `isAnonymous: false`
    // sends them to `fetchManyFromDatabase` as if they were `User` ids, which
    // both costs a query and caches a default under an id that is not a user.
    const { handler, privacyPreferencesService } = makeHandler({
      onlineUsers: [anonParticipantId],
      participants: participantsWithAnon
    });

    await handler.autoDeliverToOnlineRecipients(
      { id: messageId, senderId: senderParticipantId } as any,
      conversationId
    );

    expect(privacyPreferencesService.getPreferencesForUsers).toHaveBeenCalledWith([
      { id: anonParticipantId, isAnonymous: true }
    ]);
  });

  it('broadcasts the receipt with a null userId for an anonymous acker', async () => {
    const { handler, emit, to } = makeHandler({
      onlineUsers: [anonParticipantId],
      participants: participantsWithAnon
    });

    await handler.autoDeliverToOnlineRecipients(
      { id: messageId, senderId: senderParticipantId } as any,
      conversationId
    );

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[0][1]).toMatchObject({
      conversationId,
      type: 'received',
      participantId: anonParticipantId,
      userId: null
    });

    // The anonymous acker DOES have a personal room: `AuthHandler` joins
    // `ROOMS.user(participant.id)` for an anonymous socket, and says in the
    // comment that put it there that this is the only room personal-event
    // emitters address. The conversation room is not a substitute — a client
    // sitting on the conversation list has left `conversation:<id>` and is
    // reachable through its personal room alone.
    const roomTargets = to.mock.calls.map((c) => c[0]);
    expect(roomTargets).toContain(`conversation:${conversationId}`);
    expect(roomTargets).toContain(`user:${anonParticipantId}`);
  });

  it('leaves a disconnected anonymous participant out', async () => {
    const { handler, readStatusService, emit } = makeHandler({
      onlineUsers: [],
      participants: participantsWithAnon
    });

    await handler.autoDeliverToOnlineRecipients(
      { id: messageId, senderId: senderParticipantId } as any,
      conversationId
    );

    expect(readStatusService.markMessagesAsReceived).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('excludes an anonymous SENDER from their own delivery receipt', async () => {
    // The share-link routes pass the anonymous author's `Participant.id` as
    // senderId, and that author is online by definition — they just sent.
    const { handler, readStatusService } = makeHandler({
      onlineUsers: [anonParticipantId, offlineUserId],
      participants: participantsWithAnon
    });

    await handler.autoDeliverToOnlineRecipients(
      { id: messageId, senderId: anonParticipantId } as any,
      conversationId
    );

    expect(readStatusService.markMessagesAsReceived).toHaveBeenCalledTimes(1);
    expect(readStatusService.markMessagesAsReceived).toHaveBeenCalledWith(
      offlineParticipantId,
      conversationId,
      messageId
    );
  });
});
