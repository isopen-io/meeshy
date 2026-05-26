/**
 * Race-condition guard for `NotificationService.createMessageNotification`.
 *
 * Between `MessageProcessor.handleMessage` and the actual push/socket
 * fan-out there is a window (sender lookup + conversation lookup + DB
 * write + push enqueue) where the message itself can disappear :
 *  - the sender soft-deletes it (`deletedAt`),
 *  - a view-once / ephemeral TTL expires (`expiresAt` is now in the past).
 *
 * If the notification still fires in that window the recipient sees the
 * original content in their banner even though the message no longer
 * exists in the chat. This test pins the live-state guard that aborts
 * `createMessageNotification` when any of those conditions hits.
 *
 * @jest-environment node
 */
import { NotificationService } from '../../../../services/notifications/NotificationService';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
}));

const makePrismaMock = () => ({
  message: { findUnique: jest.fn() },
  notification: {
    create: jest.fn().mockImplementation((args: any) => ({ id: 'notif_created', ...args.data })),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  user: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'sender_id',
      username: 'alice',
      displayName: 'Alice',
      avatar: null,
    }),
  },
  conversation: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'conv_x',
      title: 'Test Conv',
      type: 'group',
    }),
  },
  userPreferences: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
}) as any;

const makeIO = () => ({
  to: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  fetchSockets: jest.fn().mockResolvedValue([]),
  emit: jest.fn(),
}) as any;

const baseParams = {
  recipientUserId: 'recipient_id',
  senderId: 'sender_id',
  messageId: 'msg_xyz',
  conversationId: 'conv_x',
  messagePreview: 'Salut !',
};

describe('NotificationService.createMessageNotification — race guard', () => {
  let mockPrisma: any;
  let mockIO: any;
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = makePrismaMock();
    mockIO = makeIO();
    service = new NotificationService(mockPrisma);
    service.setSocketIO(mockIO);
  });

  it('returns null and does NOT emit when the message has been hard-deleted in flight', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(null);

    const result = await service.createMessageNotification(baseParams);

    expect(result).toBeNull();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(mockIO.emit).not.toHaveBeenCalled();
  });

  it('returns null and does NOT emit when the message has been soft-deleted in flight', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      deletedAt: new Date('2026-05-26T09:00:00Z'),
      expiresAt: null,
      isViewOnce: false,
      viewOnceCount: 0,
    });

    const result = await service.createMessageNotification(baseParams);

    expect(result).toBeNull();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(mockIO.emit).not.toHaveBeenCalled();
  });

  it('returns null when the message has already expired (ephemeral TTL elapsed)', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      deletedAt: null,
      expiresAt: new Date(Date.now() - 1000), // 1s in the past
      isViewOnce: false,
      viewOnceCount: 0,
    });

    const result = await service.createMessageNotification(baseParams);

    expect(result).toBeNull();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(mockIO.emit).not.toHaveBeenCalled();
  });

  it('proceeds normally for a live message (future expiresAt, no deletedAt)', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      deletedAt: null,
      expiresAt: new Date(Date.now() + 60_000), // 1min in the future
      isViewOnce: false,
      viewOnceCount: 0,
    });

    const result = await service.createMessageNotification(baseParams);

    expect(result).not.toBeNull();
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
    expect(mockIO.emit).toHaveBeenCalled();
  });

  it('proceeds normally for a message with no expiresAt set', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      deletedAt: null,
      expiresAt: null,
      isViewOnce: false,
      viewOnceCount: 0,
    });

    const result = await service.createMessageNotification(baseParams);

    expect(result).not.toBeNull();
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
    expect(mockIO.emit).toHaveBeenCalled();
  });
});
