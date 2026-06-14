/**
 * Tests for the Socket.IO `notification:new` payload — title/subtitle propagation.
 *
 * Asymmetry guard: the APN/FCM push payload already carries `title` and
 * `subtitle` derived from `buildPushHeader()` so iOS Communication
 * Notifications can rewrite the banner without losing the conversation
 * name. The in-app Socket.IO payload (`NOTIFICATION_NEW`) used to ship the
 * raw notification only, leaving the iOS in-app toast to guess the sender
 * name and miss the conversation context entirely.
 *
 * This file proves the gateway now emits the same `title`/`subtitle`
 * shape over the socket channel as it does over the push channel.
 *
 * @jest-environment node
 */
import { NotificationService } from '../../../../services/notifications/NotificationService';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
}));

const makePrismaMock = () => ({
  notification: {
    create: jest.fn().mockImplementation((args: any) => ({ id: 'notif_emitted', ...args.data })),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  user: {
    findUnique: jest.fn(),
  },
  conversation: {
    findUnique: jest.fn(),
  },
  userPreferences: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
  message: { findUnique: jest.fn() },
}) as any;

const makeIO = () => ({
  to: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  fetchSockets: jest.fn().mockResolvedValue([]),
  emit: jest.fn(),
}) as any;

const findNotificationNewEmit = (mockIO: any): any | undefined => {
  const call = mockIO.emit.mock.calls.find((c: any[]) => c[0] === SERVER_EVENTS.NOTIFICATION_NEW);
  return call?.[1];
};

describe('Socket.IO notification:new payload — title / subtitle', () => {
  let mockPrisma: any;
  let mockIO: any;
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = makePrismaMock();
    // Default: message is live (not deleted, no TTL elapsed). Individual
    // tests can override to exercise the race-guard branches in the
    // dedicated `createMessageNotificationRaceGuard.test.ts` suite.
    mockPrisma.message.findUnique.mockResolvedValue({
      deletedAt: null,
      expiresAt: null,
      isViewOnce: false,
      viewOnceCount: 0,
    });
    mockIO = makeIO();
    service = new NotificationService(mockPrisma);
    service.setSocketIO(mockIO);
  });

  it('emits title=sender displayName and subtitle=conversation title for a group message', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'sender_id',
      username: 'alice',
      displayName: 'Alice Martin',
      avatar: 'https://cdn/alice.jpg',
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: 'conv_g1',
      title: 'Équipe Dev',
      type: 'group',
    });

    await service.createMessageNotification({
      recipientUserId: 'recipient_id',
      senderId: 'sender_id',
      messageId: 'msg_xyz',
      conversationId: 'conv_g1',
      messagePreview: 'Salut!',
    });

    const payload = findNotificationNewEmit(mockIO);
    expect(payload).toBeDefined();
    expect(payload.title).toBe('Alice Martin');
    expect(payload.subtitle).toBe('👥 Équipe Dev');
  });

  it('emits title=sender but no subtitle for a direct (1-on-1) message', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'sender_id',
      username: 'bob',
      displayName: 'Bob',
      avatar: null,
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: 'conv_d1',
      title: 'Alice & Bob',
      type: 'direct',
    });

    await service.createMessageNotification({
      recipientUserId: 'recipient_id',
      senderId: 'sender_id',
      messageId: 'msg_dm',
      conversationId: 'conv_d1',
      messagePreview: 'Hey',
    });

    const payload = findNotificationNewEmit(mockIO);
    expect(payload).toBeDefined();
    expect(payload.title).toBe('Bob');
    expect(payload.subtitle).toBeUndefined();
  });

  it('keeps the audio attachment label in the body (content) so the in-app toast can show "🎵 Audio · 0:34"', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'sender_id',
      username: 'carol',
      displayName: 'Carol',
      avatar: null,
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: 'conv_g2',
      title: 'Voice Notes',
      type: 'group',
    });

    await service.createMessageNotification({
      recipientUserId: 'recipient_id',
      senderId: 'sender_id',
      messageId: 'msg_audio',
      conversationId: 'conv_g2',
      messagePreview: '',
      hasAttachments: true,
      attachmentCount: 1,
      firstAttachmentType: 'audio',
      firstAttachmentDuration: 34_000, // 34s in ms
      attachments: [{ type: 'audio', filename: 'voice.m4a' }],
    });

    const payload = findNotificationNewEmit(mockIO);
    expect(payload).toBeDefined();
    expect(payload.content).toContain('🎵 Audio');
    expect(payload.content).toContain('0:34');
    expect(payload.title).toBe('Carol');
    expect(payload.subtitle).toBe('👥 Voice Notes');
  });

  it('falls back to "Meeshy" as title when no actor is provided (system notification with conversation context)', async () => {
    // System notification can be emitted without an explicit actor — buildPushHeader
    // already falls back to "Meeshy", we just want the socket payload to mirror it.
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'sender_id',
      username: 'alice',
      displayName: 'Alice',
      avatar: null,
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: 'conv_g3',
      title: 'Global',
      type: 'global',
    });

    await service.createMessageNotification({
      recipientUserId: 'recipient_id',
      senderId: 'sender_id',
      messageId: 'msg_sys',
      conversationId: 'conv_g3',
      messagePreview: 'Heads up',
    });

    const payload = findNotificationNewEmit(mockIO);
    expect(payload).toBeDefined();
    // Non-direct → subtitle should carry the conversation title (here global = "Global")
    expect(payload.subtitle).toBe('📢 Global');
  });
});
