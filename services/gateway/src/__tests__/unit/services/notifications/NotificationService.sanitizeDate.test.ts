/**
 * Coverage for NotificationService sanitizeDate error paths (via formatNotification):
 * - Invalid Date object → isNaN → warn + return defaultValue (lines 869-875)
 * - Invalid date string → new Date → NaN → warn + return defaultValue (lines 881-887)
 * - Date construction throws → catch → error + return defaultValue (lines 891-897)
 *
 * Triggered by createSystemNotification with mocked prisma returning bad dates.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: {
    info: jest.fn(), debug: jest.fn(), warn: jest.fn<any>(), error: jest.fn<any>(),
  },
  securityLogger: { logViolation: jest.fn() },
}));

import { NotificationService } from '../../../../services/notifications/NotificationService';
import { notificationLogger } from '../../../../utils/logger-enhanced';

const RECIPIENT = '507f1f77bcf86cd799439012';

const makePrisma = (createdAt: any) => ({
  notification: {
    create: jest.fn<any>().mockResolvedValue({
      id: 'notif-sanitize', userId: RECIPIENT, type: 'system', priority: 'normal',
      content: 'Test', title: null, subtitle: null, actor: null,
      context: {}, metadata: {}, createdAt,
      readAt: null, expiresAt: null, collapseId: null, imageUrl: null,
      deepLink: null, isRead: false,
    }),
    count: jest.fn<any>().mockResolvedValue(0),
    findMany: jest.fn<any>().mockResolvedValue([]),
    update: jest.fn<any>().mockResolvedValue({}),
  },
  user: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
  conversation: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  message: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  postComment: { findMany: jest.fn<any>().mockResolvedValue([]) },
  postReaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
  friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]) },
}) as any;

const makeIO = () => ({
  to: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  fetchSockets: jest.fn<any>().mockResolvedValue([]),
  emit: jest.fn(),
}) as any;

const mockWarn = notificationLogger.warn as jest.Mock;
const mockError = notificationLogger.error as jest.Mock;

beforeEach(() => jest.clearAllMocks());

// ── Invalid Date object (lines 869-875) ──────────────────────────────────────

describe('NotificationService — sanitizeDate invalid Date object', () => {
  it('warns and returns null when createdAt is an invalid Date object', async () => {
    const invalidDate = new Date('this-is-not-a-valid-date');
    expect(isNaN(invalidDate.getTime())).toBe(true); // sanity check

    const prisma = makePrisma(invalidDate);
    const service = new NotificationService(prisma);
    service.setSocketIO(makeIO());

    const result = await service.createSystemNotification({
      recipientUserId: RECIPIENT,
      content: 'test notification',
    });

    // formatNotification called → sanitizeDate(invalid Date) → isNaN → warn → null
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid Date object'),
      expect.any(Object)
    );
    // Result is still returned (sanitizeDate falling back to null for createdAt)
    expect(result).not.toBeNull();
    expect(result?.state.createdAt).toBeNull();
  });
});

// ── Invalid date string (lines 881-887) ──────────────────────────────────────

describe('NotificationService — sanitizeDate invalid date string', () => {
  it('warns and returns null when createdAt is an invalid date string', async () => {
    const prisma = makePrisma('not-a-valid-date-string');
    const service = new NotificationService(prisma);
    service.setSocketIO(makeIO());

    const result = await service.createSystemNotification({
      recipientUserId: RECIPIENT,
      content: 'test notification',
    });

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid date value'),
      expect.any(Object)
    );
    expect(result).not.toBeNull();
    expect(result?.state.createdAt).toBeNull();
  });
});

// ── Date constructor throws (lines 891-897) ───────────────────────────────────

describe('NotificationService — sanitizeDate Date constructor throws', () => {
  it('logs error and returns null when Date constructor throws (e.g. Symbol input)', async () => {
    // new Date(Symbol()) throws TypeError: Cannot convert a Symbol value to a number
    const prisma = makePrisma(Symbol('bad-date'));
    const service = new NotificationService(prisma);
    service.setSocketIO(makeIO());

    const result = await service.createSystemNotification({
      recipientUserId: RECIPIENT,
      content: 'test notification',
    });

    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('Error sanitizing date'),
      expect.any(Object)
    );
    expect(result).not.toBeNull();
    expect(result?.state.createdAt).toBeNull();
  });
});
