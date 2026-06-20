import { NotificationFormatter } from '../../../../services/notifications/NotificationFormatter';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

function makeRaw(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'notif-1',
    userId: 'user-1',
    type: 'new_message',
    priority: 'normal',
    content: 'Hello',
    actor: { id: 'actor-1', name: 'Alice' },
    context: { conversationId: 'conv-1' },
    metadata: { sound: true },
    isRead: false,
    readAt: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    expiresAt: null,
    delivery: { emailSent: false, pushSent: true },
    ...overrides,
  };
}

describe('NotificationFormatter', () => {
  describe('formatNotification', () => {
    it('maps all core fields from a raw DB object', () => {
      const raw = makeRaw();
      const result = NotificationFormatter.formatNotification(raw);

      expect(result.id).toBe('notif-1');
      expect(result.userId).toBe('user-1');
      expect(result.type).toBe('new_message');
      expect(result.priority).toBe('normal');
      expect(result.content).toBe('Hello');
    });

    it('maps state: isRead, readAt null, createdAt as Date', () => {
      const raw = makeRaw();
      const result = NotificationFormatter.formatNotification(raw);

      expect(result.state.isRead).toBe(false);
      expect(result.state.readAt).toBeNull();
      expect(result.state.createdAt).toEqual(new Date('2024-01-01T00:00:00Z'));
      expect(result.state.expiresAt).toBeUndefined();
    });

    it('defaults priority to "normal" when missing', () => {
      const result = NotificationFormatter.formatNotification(makeRaw({ priority: undefined }));
      expect(result.priority).toBe('normal');
    });

    it('defaults context to {} when null', () => {
      const result = NotificationFormatter.formatNotification(makeRaw({ context: null }));
      expect(result.context).toEqual({});
    });

    it('defaults metadata to {} when null', () => {
      const result = NotificationFormatter.formatNotification(makeRaw({ metadata: null }));
      expect(result.metadata).toEqual({});
    });

    it('defaults delivery to {emailSent:false, pushSent:false} when null', () => {
      const result = NotificationFormatter.formatNotification(makeRaw({ delivery: null }));
      expect(result.delivery).toEqual({ emailSent: false, pushSent: false });
    });

    it('maps actor as undefined when absent', () => {
      const result = NotificationFormatter.formatNotification(makeRaw({ actor: undefined }));
      expect(result.actor).toBeUndefined();
    });

    it('converts valid ISO string readAt to Date', () => {
      const raw = makeRaw({ isRead: true, readAt: '2024-06-01T12:00:00Z' });
      const result = NotificationFormatter.formatNotification(raw);
      expect(result.state.readAt).toEqual(new Date('2024-06-01T12:00:00Z'));
    });

    it('sanitizes invalid readAt string to null', () => {
      const result = NotificationFormatter.formatNotification(makeRaw({ readAt: 'not-a-date' }));
      expect(result.state.readAt).toBeNull();
    });

    it('sanitizes invalid Date object for createdAt to null', () => {
      const result = NotificationFormatter.formatNotification(makeRaw({ createdAt: new Date('invalid') }));
      expect(result.state.createdAt).toBeNull();
    });

    it('sanitizes invalid string createdAt to null', () => {
      const result = NotificationFormatter.formatNotification(makeRaw({ createdAt: 'garbage' }));
      expect(result.state.createdAt).toBeNull();
    });

    it('null createdAt stays null', () => {
      const result = NotificationFormatter.formatNotification(makeRaw({ createdAt: null }));
      expect(result.state.createdAt).toBeNull();
    });

    it('false createdAt sanitizes to null', () => {
      const result = NotificationFormatter.formatNotification(makeRaw({ createdAt: false }));
      expect(result.state.createdAt).toBeNull();
    });

    it('Symbol createdAt sanitizes to null via catch path', () => {
      const result = NotificationFormatter.formatNotification(makeRaw({ createdAt: Symbol('bad') }));
      expect(result.state.createdAt).toBeNull();
    });

    it('converts valid expiresAt Date to Date in state', () => {
      const expiry = new Date('2025-12-31T23:59:59Z');
      const result = NotificationFormatter.formatNotification(makeRaw({ expiresAt: expiry }));
      expect(result.state.expiresAt).toEqual(expiry);
    });

    it('null expiresAt produces undefined state.expiresAt', () => {
      const result = NotificationFormatter.formatNotification(makeRaw({ expiresAt: null }));
      expect(result.state.expiresAt).toBeUndefined();
    });

    it('invalid expiresAt sanitizes to undefined', () => {
      const result = NotificationFormatter.formatNotification(makeRaw({ expiresAt: 'bad-date' }));
      expect(result.state.expiresAt).toBeUndefined();
    });

    it('isRead defaults to false via ?? operator when not provided', () => {
      const result = NotificationFormatter.formatNotification(makeRaw({ isRead: undefined }));
      expect(result.state.isRead).toBe(false);
    });
  });

  describe('formatNotifications', () => {
    it('returns empty array for empty input', () => {
      expect(NotificationFormatter.formatNotifications([])).toEqual([]);
    });

    it('maps every element, preserving order', () => {
      const raws = [makeRaw({ id: 'n1' }), makeRaw({ id: 'n2' }), makeRaw({ id: 'n3' })];
      const result = NotificationFormatter.formatNotifications(raws);
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('n1');
      expect(result[1].id).toBe('n2');
      expect(result[2].id).toBe('n3');
    });
  });

  describe('formatPaginatedResponse', () => {
    it('returns success=true with correct pagination shape', () => {
      const result = NotificationFormatter.formatPaginatedResponse({
        notifications: [makeRaw({ id: 'n1' })],
        total: 10,
        offset: 0,
        limit: 5,
        unreadCount: 3,
      });

      expect(result.success).toBe(true);
      expect(result.pagination.total).toBe(10);
      expect(result.pagination.offset).toBe(0);
      expect(result.pagination.limit).toBe(5);
      expect(result.unreadCount).toBe(3);
      expect(result.data).toHaveLength(1);
    });

    it('hasMore is true when offset + count < total', () => {
      const result = NotificationFormatter.formatPaginatedResponse({
        notifications: [makeRaw()],
        total: 5,
        offset: 0,
        limit: 1,
        unreadCount: 0,
      });
      expect(result.pagination.hasMore).toBe(true); // 0 + 1 = 1 < 5
    });

    it('hasMore is false when offset + count equals total', () => {
      const result = NotificationFormatter.formatPaginatedResponse({
        notifications: [makeRaw(), makeRaw()],
        total: 2,
        offset: 0,
        limit: 10,
        unreadCount: 0,
      });
      expect(result.pagination.hasMore).toBe(false); // 0 + 2 = 2 = total
    });

    it('hasMore is false at last page (offset + count > total would not happen, but boundary: equal)', () => {
      const result = NotificationFormatter.formatPaginatedResponse({
        notifications: [makeRaw()],
        total: 3,
        offset: 2,
        limit: 5,
        unreadCount: 1,
      });
      expect(result.pagination.hasMore).toBe(false); // 2 + 1 = 3 = total
    });

    it('returns empty data array with unreadCount and hasMore false', () => {
      const result = NotificationFormatter.formatPaginatedResponse({
        notifications: [],
        total: 0,
        offset: 0,
        limit: 20,
        unreadCount: 0,
      });
      expect(result.data).toEqual([]);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.unreadCount).toBe(0);
    });
  });

  describe('formatForSocket', () => {
    it('delegates to formatNotification and returns same shape', () => {
      const raw = makeRaw({ id: 'socket-notif' });
      const fromSocket = NotificationFormatter.formatForSocket(raw);
      const fromDirect = NotificationFormatter.formatNotification(raw);
      expect(fromSocket).toEqual(fromDirect);
    });
  });
});
