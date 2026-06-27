/**
 * Tests for utils/secure-storage.ts
 * Focuses on pure exported functions (sanitize utilities)
 * SecureStorage.setSecure/getSecure require full Web Crypto API which is mocked out in jest.setup.js
 */

import {
  sanitizeNotificationForStorage,
  sanitizeNotificationsForStorage,
} from '@/utils/secure-storage';

// ─── sanitizeNotificationForStorage ──────────────────────────────────────────

describe('sanitizeNotificationForStorage', () => {
  it('returns null for null input', () => {
    expect(sanitizeNotificationForStorage(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(sanitizeNotificationForStorage(undefined)).toBeNull();
  });

  it('preserves id field', () => {
    const result = sanitizeNotificationForStorage({ id: 'notif-1' });
    expect(result.id).toBe('notif-1');
  });

  it('preserves type field', () => {
    const result = sanitizeNotificationForStorage({ type: 'MESSAGE' });
    expect(result.type).toBe('MESSAGE');
  });

  it('preserves isRead field', () => {
    const result = sanitizeNotificationForStorage({ isRead: true });
    expect(result.isRead).toBe(true);
  });

  it('preserves priority field', () => {
    const result = sanitizeNotificationForStorage({ priority: 'HIGH' });
    expect(result.priority).toBe('HIGH');
  });

  it('preserves createdAt field', () => {
    const date = new Date().toISOString();
    const result = sanitizeNotificationForStorage({ createdAt: date });
    expect(result.createdAt).toBe(date);
  });

  it('strips title (may contain private info)', () => {
    const result = sanitizeNotificationForStorage({ title: 'Private message from Alice' });
    expect(result.title).toBeUndefined();
  });

  it('strips content (contains message content)', () => {
    const result = sanitizeNotificationForStorage({ content: 'Secret message body' });
    expect(result.content).toBeUndefined();
  });

  it('strips messagePreview (contains message content)', () => {
    const result = sanitizeNotificationForStorage({ messagePreview: 'Hey, can we...' });
    expect(result.messagePreview).toBeUndefined();
  });

  it('strips sender info (PII)', () => {
    const result = sanitizeNotificationForStorage({
      sender: { id: 'u1', username: 'alice', avatar: 'avatar.png' },
    });
    expect(result.sender).toBeUndefined();
  });

  it('preserves context with IDs only', () => {
    const notification = {
      context: {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        userId: 'user-1',
        extraSensitiveData: 'should-be-stripped',
      },
    };
    const result = sanitizeNotificationForStorage(notification);
    expect(result.context.conversationId).toBe('conv-1');
    expect(result.context.messageId).toBe('msg-1');
    expect(result.context.userId).toBe('user-1');
    expect(result.context.extraSensitiveData).toBeUndefined();
  });

  it('sets context to undefined when notification has no context', () => {
    const result = sanitizeNotificationForStorage({ id: 'notif-1' });
    expect(result.context).toBeUndefined();
  });

  it('handles notification with all fields', () => {
    const notification = {
      id: 'n1',
      type: 'MESSAGE',
      isRead: false,
      priority: 'NORMAL',
      createdAt: '2024-01-01T00:00:00Z',
      title: 'Remove me',
      content: 'Remove me too',
      context: { conversationId: 'c1', messageId: 'm1', userId: 'u1' },
      sender: { name: 'Alice' },
    };
    const result = sanitizeNotificationForStorage(notification);
    expect(result.id).toBe('n1');
    expect(result.type).toBe('MESSAGE');
    expect(result.title).toBeUndefined();
    expect(result.content).toBeUndefined();
    expect(result.sender).toBeUndefined();
    expect(result.context.conversationId).toBe('c1');
  });
});

// ─── sanitizeNotificationsForStorage ─────────────────────────────────────────

describe('sanitizeNotificationsForStorage', () => {
  it('returns empty array for empty input', () => {
    expect(sanitizeNotificationsForStorage([])).toEqual([]);
  });

  it('sanitizes each notification', () => {
    const notifications = [
      { id: 'n1', title: 'Private' },
      { id: 'n2', title: 'Also private' },
    ];
    const result = sanitizeNotificationsForStorage(notifications);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('n1');
    expect(result[0].title).toBeUndefined();
  });

  it('filters out null items from input array', () => {
    const notifications = [{ id: 'n1' }, null, { id: 'n2' }] as any[];
    const result = sanitizeNotificationsForStorage(notifications);
    expect(result).toHaveLength(2);
  });

  it('filters out items that sanitize to null', () => {
    const notifications = [null, undefined, { id: 'n1' }] as any[];
    const result = sanitizeNotificationsForStorage(notifications);
    expect(result.some((r: unknown) => r === null)).toBe(false);
  });
});
