/**
 * Unit tests for notification-schemas.ts
 *
 * Covers all exported Zod schemas: parse success and failure cases.
 */

import { describe, it, expect } from '@jest/globals';
import {
  GetNotificationsQuerySchema,
  GetStatsQuerySchema,
  CreateNotificationSchema,
  UpdateNotificationPreferencesSchema,
  MarkAsReadParamSchema,
  DeleteNotificationParamSchema,
  BatchMarkAsReadSchema,
  ConversationNotificationsParamSchema,
  SanitizeMongoQuerySchema,
  NotificationStatusEnum,
} from '../../../validation/notification-schemas';

// Valid ObjectId
const VALID_ID = 'a'.repeat(24); // 24 hex-like chars — use actual hex
const VALID_OID = 'aabbccddeeff001122334455';

// ─── GetNotificationsQuerySchema ─────────────────────────────────────────────

describe('GetNotificationsQuerySchema', () => {
  it('parses with all defaults when empty object given', () => {
    const result = GetNotificationsQuerySchema.parse({});
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(20);
    expect(result.unread).toBe(false);
    expect(result.type).toBe('all');
  });

  it('parses offset and limit as strings and transforms to numbers', () => {
    const result = GetNotificationsQuerySchema.parse({ offset: '10', limit: '50' });
    expect(result.offset).toBe(10);
    expect(result.limit).toBe(50);
  });

  it('transforms unread="true" to true', () => {
    const result = GetNotificationsQuerySchema.parse({ unread: 'true' });
    expect(result.unread).toBe(true);
  });

  it('transforms unread="false" to false', () => {
    const result = GetNotificationsQuerySchema.parse({ unread: 'false' });
    expect(result.unread).toBe(false);
  });

  it('accepts valid notification type', () => {
    const result = GetNotificationsQuerySchema.parse({ type: 'new_message' });
    expect(result.type).toBe('new_message');
  });

  it('accepts type="all"', () => {
    const result = GetNotificationsQuerySchema.parse({ type: 'all' });
    expect(result.type).toBe('all');
  });

  it('accepts valid startDate and endDate datetimes', () => {
    const result = GetNotificationsQuerySchema.parse({
      startDate: '2024-01-01T00:00:00.000Z',
      endDate: '2024-12-31T23:59:59.000Z',
    });
    expect(result.startDate).toBe('2024-01-01T00:00:00.000Z');
  });

  it('rejects negative offset', () => {
    expect(() => GetNotificationsQuerySchema.parse({ offset: '-1' })).toThrow();
  });

  it('rejects limit > 100', () => {
    expect(() => GetNotificationsQuerySchema.parse({ limit: '101' })).toThrow();
  });

  it('rejects limit < 1', () => {
    expect(() => GetNotificationsQuerySchema.parse({ limit: '0' })).toThrow();
  });

  it('rejects unknown fields (strict mode)', () => {
    expect(() =>
      GetNotificationsQuerySchema.parse({ unknownField: 'value' })
    ).toThrow();
  });

  it('rejects non-numeric offset string', () => {
    expect(() => GetNotificationsQuerySchema.parse({ offset: 'abc' })).toThrow();
  });

  it('rejects invalid datetime for startDate', () => {
    expect(() =>
      GetNotificationsQuerySchema.parse({ startDate: 'not-a-date' })
    ).toThrow();
  });

  it('accepts valid priority', () => {
    const result = GetNotificationsQuerySchema.parse({ priority: 'high' });
    expect(result.priority).toBe('high');
  });
});

// ─── GetStatsQuerySchema ─────────────────────────────────────────────────────

describe('GetStatsQuerySchema', () => {
  it('defaults period to "all"', () => {
    const result = GetStatsQuerySchema.parse({});
    expect(result.period).toBe('all');
  });

  it('accepts valid period values', () => {
    for (const period of ['day', 'week', 'month', 'all'] as const) {
      const result = GetStatsQuerySchema.parse({ period });
      expect(result.period).toBe(period);
    }
  });

  it('rejects invalid period', () => {
    expect(() => GetStatsQuerySchema.parse({ period: 'year' })).toThrow();
  });

  it('rejects unknown fields (strict mode)', () => {
    expect(() => GetStatsQuerySchema.parse({ extra: 'field' })).toThrow();
  });
});

// ─── CreateNotificationSchema ─────────────────────────────────────────────────

describe('CreateNotificationSchema', () => {
  function makeValid(overrides = {}) {
    return {
      userId: VALID_OID,
      type: 'new_message',
      title: 'Test title',
      content: 'Test content',
      ...overrides,
    };
  }

  it('parses a minimal valid notification', () => {
    const result = CreateNotificationSchema.parse(makeValid());
    expect(result.userId).toBe(VALID_OID);
    expect(result.type).toBe('new_message');
    expect(result.priority).toBe('normal'); // default
  });

  it('rejects userId with wrong format (not 24 hex chars)', () => {
    expect(() => CreateNotificationSchema.parse(makeValid({ userId: 'short' }))).toThrow();
    expect(() => CreateNotificationSchema.parse(makeValid({ userId: 'z'.repeat(24) }))).toThrow();
  });

  it('rejects empty title', () => {
    expect(() => CreateNotificationSchema.parse(makeValid({ title: '' }))).toThrow();
  });

  it('rejects title over 200 chars', () => {
    expect(() =>
      CreateNotificationSchema.parse(makeValid({ title: 'a'.repeat(201) }))
    ).toThrow();
  });

  it('rejects empty content', () => {
    expect(() => CreateNotificationSchema.parse(makeValid({ content: '' }))).toThrow();
  });

  it('rejects content over 1000 chars', () => {
    expect(() =>
      CreateNotificationSchema.parse(makeValid({ content: 'a'.repeat(1001) }))
    ).toThrow();
  });

  it('accepts optional senderId as valid ObjectId', () => {
    const result = CreateNotificationSchema.parse(makeValid({ senderId: VALID_OID }));
    expect(result.senderId).toBe(VALID_OID);
  });

  it('rejects invalid senderId format', () => {
    expect(() =>
      CreateNotificationSchema.parse(makeValid({ senderId: 'not-valid' }))
    ).toThrow();
  });

  it('accepts valid senderAvatar URL', () => {
    const result = CreateNotificationSchema.parse(
      makeValid({ senderAvatar: 'https://example.com/avatar.png' })
    );
    expect(result.senderAvatar).toBe('https://example.com/avatar.png');
  });

  it('rejects invalid avatar URL', () => {
    expect(() =>
      CreateNotificationSchema.parse(makeValid({ senderAvatar: 'not-a-url' }))
    ).toThrow();
  });

  it('transforms expiresAt string to Date object', () => {
    const result = CreateNotificationSchema.parse(
      makeValid({ expiresAt: '2025-12-31T23:59:59.000Z' })
    );
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('rejects invalid expiresAt datetime', () => {
    expect(() =>
      CreateNotificationSchema.parse(makeValid({ expiresAt: 'not-a-date' }))
    ).toThrow();
  });

  it('rejects unknown fields (strict mode)', () => {
    expect(() =>
      CreateNotificationSchema.parse(makeValid({ unknownField: 'value' }))
    ).toThrow();
  });

  it('accepts optional conversationId as valid ObjectId', () => {
    const result = CreateNotificationSchema.parse(makeValid({ conversationId: VALID_OID }));
    expect(result.conversationId).toBe(VALID_OID);
  });

  it('accepts optional data record', () => {
    const result = CreateNotificationSchema.parse(makeValid({ data: { key: 'value' } }));
    expect(result.data).toEqual({ key: 'value' });
  });

  it('accepts high priority', () => {
    const result = CreateNotificationSchema.parse(makeValid({ priority: 'high' }));
    expect(result.priority).toBe('high');
  });
});

// ─── UpdateNotificationPreferencesSchema ─────────────────────────────────────

describe('UpdateNotificationPreferencesSchema', () => {
  it('parses empty object (all fields optional)', () => {
    const result = UpdateNotificationPreferencesSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts pushEnabled=true', () => {
    const result = UpdateNotificationPreferencesSchema.parse({ pushEnabled: true });
    expect(result.pushEnabled).toBe(true);
  });

  it('accepts valid DND times when dndEnabled=true', () => {
    const result = UpdateNotificationPreferencesSchema.parse({
      dndEnabled: true,
      dndStartTime: '22:00',
      dndEndTime: '07:00',
    });
    expect(result.dndEnabled).toBe(true);
    expect(result.dndStartTime).toBe('22:00');
  });

  it('rejects dndEnabled=true without dndStartTime and dndEndTime', () => {
    expect(() =>
      UpdateNotificationPreferencesSchema.parse({ dndEnabled: true })
    ).toThrow();
  });

  it('rejects dndEnabled=true with only dndStartTime', () => {
    expect(() =>
      UpdateNotificationPreferencesSchema.parse({
        dndEnabled: true,
        dndStartTime: '22:00',
      })
    ).toThrow();
  });

  it('rejects dndEnabled=true with only dndEndTime', () => {
    expect(() =>
      UpdateNotificationPreferencesSchema.parse({
        dndEnabled: true,
        dndEndTime: '07:00',
      })
    ).toThrow();
  });

  it('passes refinement when dndEnabled=false without times', () => {
    const result = UpdateNotificationPreferencesSchema.parse({ dndEnabled: false });
    expect(result.dndEnabled).toBe(false);
  });

  it('rejects invalid dndStartTime format', () => {
    expect(() =>
      UpdateNotificationPreferencesSchema.parse({
        dndEnabled: true,
        dndStartTime: '25:00',
        dndEndTime: '07:00',
      })
    ).toThrow();
  });

  it('rejects unknown fields (strict mode)', () => {
    expect(() =>
      UpdateNotificationPreferencesSchema.parse({ unknownField: true })
    ).toThrow();
  });

  it('accepts all notification type flags', () => {
    const result = UpdateNotificationPreferencesSchema.parse({
      newMessageEnabled: true,
      replyEnabled: false,
      mentionEnabled: true,
      reactionEnabled: false,
      missedCallEnabled: true,
      systemEnabled: false,
      conversationEnabled: true,
      contactRequestEnabled: false,
      memberJoinedEnabled: true,
    });
    expect(result.newMessageEnabled).toBe(true);
    expect(result.memberJoinedEnabled).toBe(true);
  });
});

// ─── MarkAsReadParamSchema ────────────────────────────────────────────────────

describe('MarkAsReadParamSchema', () => {
  it('accepts valid 24-char hex ObjectId', () => {
    const result = MarkAsReadParamSchema.parse({ id: VALID_OID });
    expect(result.id).toBe(VALID_OID);
  });

  it('rejects invalid id format', () => {
    expect(() => MarkAsReadParamSchema.parse({ id: 'short-id' })).toThrow();
  });

  it('rejects id with non-hex characters', () => {
    expect(() => MarkAsReadParamSchema.parse({ id: 'z'.repeat(24) })).toThrow();
  });

  it('rejects unknown fields (strict mode)', () => {
    expect(() =>
      MarkAsReadParamSchema.parse({ id: VALID_OID, extra: 'field' })
    ).toThrow();
  });
});

// ─── DeleteNotificationParamSchema ───────────────────────────────────────────

describe('DeleteNotificationParamSchema', () => {
  it('accepts valid ObjectId', () => {
    const result = DeleteNotificationParamSchema.parse({ id: VALID_OID });
    expect(result.id).toBe(VALID_OID);
  });

  it('rejects invalid id', () => {
    expect(() => DeleteNotificationParamSchema.parse({ id: 'bad' })).toThrow();
  });
});

// ─── BatchMarkAsReadSchema ────────────────────────────────────────────────────

describe('BatchMarkAsReadSchema', () => {
  it('accepts array with one valid ObjectId', () => {
    const result = BatchMarkAsReadSchema.parse({ notificationIds: [VALID_OID] });
    expect(result.notificationIds).toHaveLength(1);
  });

  it('accepts array with 100 ObjectIds (max)', () => {
    const ids = Array(100).fill(VALID_OID);
    const result = BatchMarkAsReadSchema.parse({ notificationIds: ids });
    expect(result.notificationIds).toHaveLength(100);
  });

  it('rejects empty array (min 1)', () => {
    expect(() => BatchMarkAsReadSchema.parse({ notificationIds: [] })).toThrow();
  });

  it('rejects array with 101 ObjectIds (max 100)', () => {
    const ids = Array(101).fill(VALID_OID);
    expect(() => BatchMarkAsReadSchema.parse({ notificationIds: ids })).toThrow();
  });

  it('rejects array containing invalid ObjectId', () => {
    expect(() =>
      BatchMarkAsReadSchema.parse({ notificationIds: ['invalid-id'] })
    ).toThrow();
  });

  it('rejects unknown fields (strict mode)', () => {
    expect(() =>
      BatchMarkAsReadSchema.parse({ notificationIds: [VALID_OID], extra: 'field' })
    ).toThrow();
  });
});

// ─── ConversationNotificationsParamSchema ────────────────────────────────────

describe('ConversationNotificationsParamSchema', () => {
  it('accepts valid conversationId ObjectId', () => {
    const result = ConversationNotificationsParamSchema.parse({
      conversationId: VALID_OID,
    });
    expect(result.conversationId).toBe(VALID_OID);
  });

  it('rejects invalid conversationId', () => {
    expect(() =>
      ConversationNotificationsParamSchema.parse({ conversationId: 'bad-id' })
    ).toThrow();
  });
});

// ─── SanitizeMongoQuerySchema ─────────────────────────────────────────────────

describe('SanitizeMongoQuerySchema', () => {
  it('accepts normal keys', () => {
    const result = SanitizeMongoQuerySchema.parse({ userId: 'user-1', type: 'new_message' });
    expect(result.userId).toBe('user-1');
  });

  it('rejects keys starting with $', () => {
    expect(() => SanitizeMongoQuerySchema.parse({ $ne: 'value' })).toThrow();
  });

  it('rejects $gt operator', () => {
    expect(() => SanitizeMongoQuerySchema.parse({ $gt: 5 })).toThrow();
  });

  it('accepts empty object', () => {
    const result = SanitizeMongoQuerySchema.parse({});
    expect(result).toEqual({});
  });
});

// ─── NotificationStatusEnum ───────────────────────────────────────────────────

describe('NotificationStatusEnum', () => {
  it('accepts "pending"', () => {
    expect(NotificationStatusEnum.parse('pending')).toBe('pending');
  });

  it('accepts "delivered"', () => {
    expect(NotificationStatusEnum.parse('delivered')).toBe('delivered');
  });

  it('accepts "read"', () => {
    expect(NotificationStatusEnum.parse('read')).toBe('read');
  });

  it('accepts "failed"', () => {
    expect(NotificationStatusEnum.parse('failed')).toBe('failed');
  });

  it('rejects invalid status', () => {
    expect(() => NotificationStatusEnum.parse('unknown')).toThrow();
  });

  it('rejects empty string', () => {
    expect(() => NotificationStatusEnum.parse('')).toThrow();
  });
});
