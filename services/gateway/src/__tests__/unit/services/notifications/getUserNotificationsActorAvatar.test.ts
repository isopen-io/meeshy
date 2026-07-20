/**
 * `NotificationService.getUserNotifications` — live actor avatar overlay.
 *
 * `Notification.actor` is a frozen JSON snapshot captured at creation time
 * (`actor: { id, username, displayName, avatar }`). The avatar URL it holds
 * becomes a dead link as soon as the actor changes their avatar — the old
 * `/api/v1/attachments/file/.../avatar_<uuid>.jpg` file is gone, so every
 * render of that old notification re-requests it and the web `/notifications`
 * page logs a 404 (it degrades to initials via the Radix avatar fallback).
 *
 * The list path must re-resolve each distinct actor's avatar live from the
 * User table so the avatar is always current and never stale-404s. This test
 * pins that behaviour: overlay fresh avatars, nullify removed ones, batch a
 * single User query, and keep the snapshot for actors with no live record.
 *
 * @jest-environment node
 */
import { NotificationService } from '../../../../services/notifications/NotificationService';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
}));

const makePrismaMock = () =>
  ({
    notification: {
      findMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  }) as any;

const makeNotification = (overrides: Record<string, unknown> = {}) => ({
  id: 'notif_1',
  userId: 'recipient_1',
  type: 'post_liked',
  priority: 'normal',
  content: 'a aimé votre post',
  actor: { id: 'actor_alice', username: 'alice', displayName: 'Alice', avatar: '/old/alice.jpg' },
  context: { postId: 'post_1' },
  metadata: {},
  isRead: false,
  readAt: null,
  createdAt: new Date('2026-06-20T10:00:00.000Z'),
  delivery: { emailSent: false, pushSent: false },
  ...overrides,
});

const makeService = (mockPrisma: any) => new NotificationService(mockPrisma);

describe('NotificationService.getUserNotifications — live actor avatar overlay', () => {
  it('overlays the live avatar over the stale snapshot', async () => {
    const mockPrisma = makePrismaMock();
    mockPrisma.notification.findMany.mockResolvedValue([
      makeNotification({
        actor: {
          id: 'actor_alice',
          username: 'alice',
          displayName: 'Alice',
          avatar: '/api/v1/attachments/file/2026/06/actor_alice/avatar_OLD.jpg',
        },
      }),
    ]);
    mockPrisma.notification.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'actor_alice', avatar: '/api/v1/attachments/file/2026/06/actor_alice/avatar_NEW.jpg' },
    ]);

    const { notifications } = await makeService(mockPrisma).getUserNotifications({
      userId: 'recipient_1',
      limit: 10,
      offset: 0,
    });

    expect(notifications[0].actor?.avatar).toBe(
      '/api/v1/attachments/file/2026/06/actor_alice/avatar_NEW.jpg',
    );
  });

  it('nullifies the avatar when the actor has removed theirs', async () => {
    const mockPrisma = makePrismaMock();
    mockPrisma.notification.findMany.mockResolvedValue([
      makeNotification({
        actor: { id: 'actor_bob', username: 'bob', avatar: '/old/bob.jpg' },
      }),
    ]);
    mockPrisma.notification.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'actor_bob', avatar: null }]);

    const { notifications } = await makeService(mockPrisma).getUserNotifications({
      userId: 'recipient_1',
      limit: 10,
      offset: 0,
    });

    expect(notifications[0].actor?.avatar ?? null).toBeNull();
  });

  it('batches a single User query for distinct actors and keeps the snapshot for an unknown actor', async () => {
    const mockPrisma = makePrismaMock();
    mockPrisma.notification.findMany.mockResolvedValue([
      makeNotification({ id: 'n1', actor: { id: 'actor_alice', username: 'alice', avatar: '/old/alice.jpg' } }),
      makeNotification({ id: 'n2', actor: { id: 'actor_bob', username: 'bob', avatar: '/snapshot/bob.jpg' } }),
      makeNotification({ id: 'n3', actor: { id: 'actor_alice', username: 'alice', avatar: '/old/alice.jpg' } }),
    ]);
    mockPrisma.notification.count.mockResolvedValue(3);
    // bob has no live record (deleted account) → his snapshot must be preserved.
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'actor_alice', avatar: '/new/alice.jpg' }]);

    const { notifications } = await makeService(mockPrisma).getUserNotifications({
      userId: 'recipient_1',
      limit: 10,
      offset: 0,
    });

    expect(mockPrisma.user.findMany).toHaveBeenCalledTimes(1);
    const queryArg = mockPrisma.user.findMany.mock.calls[0][0];
    expect([...queryArg.where.id.in].sort()).toEqual(['actor_alice', 'actor_bob']);
    expect(notifications[0].actor?.avatar).toBe('/new/alice.jpg');
    expect(notifications[1].actor?.avatar).toBe('/snapshot/bob.jpg');
    expect(notifications[2].actor?.avatar).toBe('/new/alice.jpg');
  });

  it('skips the User query entirely when no notification carries an actor', async () => {
    const mockPrisma = makePrismaMock();
    mockPrisma.notification.findMany.mockResolvedValue([
      makeNotification({ id: 'system_1', actor: null }),
    ]);
    mockPrisma.notification.count.mockResolvedValue(1);

    const { notifications } = await makeService(mockPrisma).getUserNotifications({
      userId: 'recipient_1',
      limit: 10,
      offset: 0,
    });

    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    expect(notifications).toHaveLength(1);
  });
});
