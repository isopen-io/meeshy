/**
 * Unit tests for NotificationFormatter
 *
 * Covers: sanitizeDate (via formatNotification), formatNotification,
 * formatNotifications, formatPaginatedResponse, formatForSocket
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { NotificationFormatter } from '../../../../services/notifications/NotificationFormatter';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRaw(overrides: Record<string, any> = {}) {
  return {
    id: 'notif-001',
    userId: 'user-001',
    type: 'new_message',
    priority: 'normal',
    content: 'You have a new message',
    actor: null,
    context: null,
    metadata: null,
    state: {},
    delivery: null,
    isRead: false,
    readAt: null,
    createdAt: new Date('2024-01-15T10:00:00.000Z'),
    expiresAt: null,
    ...overrides,
  };
}

// ─── sanitizeDate (tested indirectly via formatNotification) ──────────────────

describe('NotificationFormatter.formatNotification — sanitizeDate behaviour', () => {
  it('accepts a valid Date object and preserves it', () => {
    const date = new Date('2024-01-15T10:00:00.000Z');
    const result = NotificationFormatter.formatNotification(makeRaw({ createdAt: date }));
    expect(result.state.createdAt).toEqual(date);
  });

  it('converts a valid ISO string to a Date', () => {
    const result = NotificationFormatter.formatNotification(
      makeRaw({ createdAt: '2024-01-15T10:00:00.000Z' })
    );
    expect(result.state.createdAt).toBeInstanceOf(Date);
    expect(result.state.createdAt!.toISOString()).toBe('2024-01-15T10:00:00.000Z');
  });

  it('returns null for null createdAt (uses defaultValue)', () => {
    const result = NotificationFormatter.formatNotification(makeRaw({ createdAt: null }));
    // defaultValue is null; the ! assertion will coerce but the value is null
    expect(result.state.createdAt).toBeNull();
  });

  it('returns null for undefined createdAt', () => {
    const result = NotificationFormatter.formatNotification(makeRaw({ createdAt: undefined }));
    expect(result.state.createdAt).toBeNull();
  });

  it('returns null for an invalid Date object', () => {
    const invalidDate = new Date('not-a-date');
    const result = NotificationFormatter.formatNotification(makeRaw({ createdAt: invalidDate }));
    expect(result.state.createdAt).toBeNull();
  });

  it('returns null for an invalid date string', () => {
    const result = NotificationFormatter.formatNotification(
      makeRaw({ createdAt: 'not-a-date' })
    );
    expect(result.state.createdAt).toBeNull();
  });

  it('returns null when value causes an exception during sanitization', () => {
    // Pass an object with a getter that throws to exercise the catch branch
    const throwingDate = {
      toString: () => { throw new Error('thrown by getter'); },
      valueOf: () => { throw new Error('thrown by getter'); },
    };
    // Should not throw — the try/catch in sanitizeDate must swallow the error
    const result = NotificationFormatter.formatNotification(
      makeRaw({ createdAt: throwingDate })
    );
    expect(result.state.createdAt).toBeNull();
  });

  it('handles falsy value for readAt → null', () => {
    const result = NotificationFormatter.formatNotification(makeRaw({ readAt: null }));
    expect(result.state.readAt).toBeNull();
  });

  it('converts readAt string to Date', () => {
    const result = NotificationFormatter.formatNotification(
      makeRaw({ readAt: '2024-02-01T08:00:00.000Z' })
    );
    expect(result.state.readAt).toBeInstanceOf(Date);
  });

  it('returns undefined for expiresAt when null', () => {
    const result = NotificationFormatter.formatNotification(makeRaw({ expiresAt: null }));
    expect(result.state.expiresAt).toBeUndefined();
  });

  it('converts expiresAt string to Date', () => {
    const result = NotificationFormatter.formatNotification(
      makeRaw({ expiresAt: '2025-12-31T23:59:59.000Z' })
    );
    expect(result.state.expiresAt).toBeInstanceOf(Date);
  });
});

// ─── formatNotification ───────────────────────────────────────────────────────

describe('NotificationFormatter.formatNotification', () => {
  it('maps core fields correctly', () => {
    const raw = makeRaw();
    const result = NotificationFormatter.formatNotification(raw);
    expect(result.id).toBe('notif-001');
    expect(result.userId).toBe('user-001');
    expect(result.type).toBe('new_message');
    expect(result.priority).toBe('normal');
    expect(result.content).toBe('You have a new message');
  });

  it('defaults priority to "normal" when absent', () => {
    const raw = makeRaw({ priority: undefined });
    const result = NotificationFormatter.formatNotification(raw);
    expect(result.priority).toBe('normal');
  });

  it('uses provided priority when present', () => {
    const raw = makeRaw({ priority: 'high' });
    const result = NotificationFormatter.formatNotification(raw);
    expect(result.priority).toBe('high');
  });

  it('returns actor as undefined when null', () => {
    const result = NotificationFormatter.formatNotification(makeRaw({ actor: null }));
    expect(result.actor).toBeUndefined();
  });

  it('returns actor value when present', () => {
    const actor = { id: 'actor-1', name: 'Alice' };
    const result = NotificationFormatter.formatNotification(makeRaw({ actor }));
    expect(result.actor).toEqual(actor);
  });

  it('returns empty object for context when null', () => {
    const result = NotificationFormatter.formatNotification(makeRaw({ context: null }));
    expect(result.context).toEqual({});
  });

  it('returns context value when present', () => {
    const context = { conversationId: 'conv-1' };
    const result = NotificationFormatter.formatNotification(makeRaw({ context }));
    expect(result.context).toEqual(context);
  });

  it('returns empty object for metadata when null', () => {
    const result = NotificationFormatter.formatNotification(makeRaw({ metadata: null }));
    expect(result.metadata).toEqual({});
  });

  it('returns metadata value when present', () => {
    const metadata = { foo: 'bar' };
    const result = NotificationFormatter.formatNotification(makeRaw({ metadata }));
    expect(result.metadata).toEqual(metadata);
  });

  it('returns default delivery when null', () => {
    const result = NotificationFormatter.formatNotification(makeRaw({ delivery: null }));
    expect(result.delivery).toEqual({ emailSent: false, pushSent: false });
  });

  it('returns delivery value when present', () => {
    const delivery = { emailSent: true, pushSent: true };
    const result = NotificationFormatter.formatNotification(makeRaw({ delivery }));
    expect(result.delivery).toEqual(delivery);
  });

  it('sets isRead from raw.isRead', () => {
    const result = NotificationFormatter.formatNotification(makeRaw({ isRead: true }));
    expect(result.state.isRead).toBe(true);
  });

  it('defaults isRead to false when undefined', () => {
    const result = NotificationFormatter.formatNotification(makeRaw({ isRead: undefined }));
    expect(result.state.isRead).toBe(false);
  });
});

// ─── formatNotifications ─────────────────────────────────────────────────────

describe('NotificationFormatter.formatNotifications', () => {
  it('returns empty array for empty input', () => {
    expect(NotificationFormatter.formatNotifications([])).toEqual([]);
  });

  it('formats all items in the list', () => {
    const raws = [makeRaw({ id: 'n1' }), makeRaw({ id: 'n2' }), makeRaw({ id: 'n3' })];
    const results = NotificationFormatter.formatNotifications(raws);
    expect(results).toHaveLength(3);
    expect(results[0].id).toBe('n1');
    expect(results[1].id).toBe('n2');
    expect(results[2].id).toBe('n3');
  });
});

// ─── formatPaginatedResponse ──────────────────────────────────────────────────

describe('NotificationFormatter.formatPaginatedResponse', () => {
  it('returns success:true with formatted data', () => {
    const result = NotificationFormatter.formatPaginatedResponse({
      notifications: [makeRaw()],
      total: 1,
      offset: 0,
      limit: 20,
      unreadCount: 1,
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it('computes hasMore=true when offset + count < total', () => {
    const result = NotificationFormatter.formatPaginatedResponse({
      notifications: [makeRaw(), makeRaw()],
      total: 10,
      offset: 0,
      limit: 5,
      unreadCount: 3,
    });
    expect(result.pagination.hasMore).toBe(true);
  });

  it('computes hasMore=false when offset + count >= total', () => {
    const result = NotificationFormatter.formatPaginatedResponse({
      notifications: [makeRaw(), makeRaw()],
      total: 2,
      offset: 0,
      limit: 20,
      unreadCount: 0,
    });
    expect(result.pagination.hasMore).toBe(false);
  });

  it('hasMore=false on last page (offset brings us to total)', () => {
    const result = NotificationFormatter.formatPaginatedResponse({
      notifications: [makeRaw()],
      total: 6,
      offset: 5,
      limit: 5,
      unreadCount: 0,
    });
    // offset(5) + length(1) = 6, which equals total(6) → NOT < → false
    expect(result.pagination.hasMore).toBe(false);
  });

  it('includes pagination metadata', () => {
    const result = NotificationFormatter.formatPaginatedResponse({
      notifications: [],
      total: 50,
      offset: 20,
      limit: 10,
      unreadCount: 7,
    });
    // offset(20) + length(0) = 20 which is < 50 → hasMore = true
    expect(result.pagination.total).toBe(50);
    expect(result.pagination.offset).toBe(20);
    expect(result.pagination.limit).toBe(10);
    expect(result.pagination.hasMore).toBe(true);
    expect(result.unreadCount).toBe(7);
  });
});

// ─── formatForSocket ─────────────────────────────────────────────────────────

describe('NotificationFormatter.formatForSocket', () => {
  it('delegates to formatNotification and returns same shape', () => {
    const raw = makeRaw({ id: 'socket-notif', type: 'message_reaction' });
    const fromSocket = NotificationFormatter.formatForSocket(raw);
    const fromFormat = NotificationFormatter.formatNotification(raw);
    expect(fromSocket).toEqual(fromFormat);
  });

  it('returns id from raw', () => {
    const result = NotificationFormatter.formatForSocket(makeRaw({ id: 'ws-001' }));
    expect(result.id).toBe('ws-001');
  });
});
