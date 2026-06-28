/**
 * Coverage for NotificationService DND + security validation paths:
 * - isDNDActive: diurnal active (line 553-554)
 * - isDNDActive: nocturnal active (line 549-550)
 * - isDNDActive: dndDays filter returns false (lines 544-546)
 * - createNotification: invalid type → null (lines 592-597)
 * - createNotification: invalid priority → null (lines 600-607)
 * - createNotification: error catch → null (lines 844-851)
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: {
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
  },
  securityLogger: { logViolation: jest.fn<any>() },
}));

import { NotificationService } from '../../../../services/notifications/NotificationService';
import { SecuritySanitizer } from '../../../../utils/sanitize';

// ── IDs ───────────────────────────────────────────────────────────────────────

const CALLER    = '507f1f77bcf86cd799439011';
const RECIPIENT = '507f1f77bcf86cd799439012';
const CONV_ID   = '507f1f77bcf86cd799439013';
const SESSION   = '507f1f77bcf86cd799439014';

// ── Factory helpers ────────────────────────────────────────────────────────────

const makePrisma = () => ({
  notification: {
    create:     jest.fn<any>().mockResolvedValue({
      id: 'notif-1', userId: RECIPIENT, type: 'missed_call', priority: 'high',
      content: 'Missed call', title: null, subtitle: null, actor: null,
      context: {}, metadata: {}, createdAt: new Date('2026-06-28T10:00:00.000Z'),
      readAt: null, expiresAt: null, collapseId: null, imageUrl: null,
      deepLink: null, isRead: false,
    }),
    count:      jest.fn<any>().mockResolvedValue(1),
    findMany:   jest.fn<any>().mockResolvedValue([]),
    update:     jest.fn<any>().mockResolvedValue({}),
  },
  user: {
    findUnique: jest.fn<any>().mockResolvedValue(
      { username: 'caller', displayName: 'Caller User', avatar: null }
    ),
    findMany:   jest.fn<any>().mockResolvedValue([]),
  },
  conversation: {
    findUnique: jest.fn<any>().mockResolvedValue({ title: 'Test', type: 'DIRECT' }),
  },
  message:     { findUnique: jest.fn<any>().mockResolvedValue(null) },
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

const missedCallParams = {
  recipientUserId: RECIPIENT,
  callerId: CALLER,
  conversationId: CONV_ID,
  callSessionId: SESSION,
  callType: 'audio' as const,
};

// ── DND tests ─────────────────────────────────────────────────────────────────

describe('NotificationService — isDNDActive (diurnal: start < end)', () => {
  afterEach(() => jest.useRealTimers());

  it('blocks notification when DND is diurnal active (09:00 - 17:00, no day filter)', async () => {
    jest.useFakeTimers();
    // Set system time to 10:00 UTC — within the 09:00-17:00 DND window
    jest.setSystemTime(new Date('2026-06-28T10:00:00.000Z'));

    const prisma = makePrisma();
    prisma.userPreferences.findUnique.mockResolvedValue({
      notification: {
        dndEnabled: true,
        dndStartTime: '09:00',
        dndEndTime: '17:00',
        dndDays: [],
      },
    });

    const service = new NotificationService(prisma);
    service.setSocketIO(makeIO());

    const result = await service.createMissedCallNotification(missedCallParams);
    // DND active → shouldCreateNotification returns false → createNotification returns null
    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

describe('NotificationService — isDNDActive (nocturnal: start > end)', () => {
  afterEach(() => jest.useRealTimers());

  it('blocks notification when nocturnal DND is active at 23:00 (22:00 - 08:00)', async () => {
    jest.useFakeTimers();
    // 23:00 UTC → within nocturnal 22:00-08:00 window (currentTime >= '22:00')
    jest.setSystemTime(new Date('2026-06-28T23:00:00.000Z'));

    const prisma = makePrisma();
    prisma.userPreferences.findUnique.mockResolvedValue({
      notification: {
        dndEnabled: true,
        dndStartTime: '22:00',
        dndEndTime: '08:00', // nocturnal: start > end
        dndDays: [],
      },
    });

    const service = new NotificationService(prisma);
    service.setSocketIO(makeIO());

    const result = await service.createMissedCallNotification(missedCallParams);
    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('does not block when nocturnal DND is inactive at 10:00 (22:00 - 08:00)', async () => {
    jest.useFakeTimers();
    // 10:00 UTC → outside nocturnal 22:00-08:00 window
    jest.setSystemTime(new Date('2026-06-28T10:00:00.000Z'));

    const prisma = makePrisma();
    prisma.userPreferences.findUnique.mockResolvedValue({
      notification: {
        dndEnabled: true,
        dndStartTime: '22:00',
        dndEndTime: '08:00',
        dndDays: [],
      },
    });

    const service = new NotificationService(prisma);
    service.setSocketIO(makeIO());

    const result = await service.createMissedCallNotification(missedCallParams);
    // 10:00 is NOT in 22:00-08:00 range → DND NOT active → notification created
    expect(result).not.toBeNull();
    expect(prisma.notification.create).toHaveBeenCalled();
  });
});

describe('NotificationService — isDNDActive (dndDays filter)', () => {
  afterEach(() => jest.useRealTimers());

  it('does not block when today is not in dndDays (lines 544-546)', async () => {
    jest.useFakeTimers();
    // 2026-06-28 is a Sunday → getUTCDay() = 0 → dayMap[0] = 'sun'
    jest.setSystemTime(new Date('2026-06-28T10:00:00.000Z'));

    const prisma = makePrisma();
    prisma.userPreferences.findUnique.mockResolvedValue({
      notification: {
        dndEnabled: true,
        dndStartTime: '09:00',
        dndEndTime: '17:00',
        // Sunday NOT included → DND not active on Sunday
        dndDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
      },
    });

    const service = new NotificationService(prisma);
    service.setSocketIO(makeIO());

    const result = await service.createMissedCallNotification(missedCallParams);
    // dndDays excludes Sunday → DND not active → notification created
    expect(prisma.notification.create).toHaveBeenCalled();
    expect(result).not.toBeNull();
  });
});

// ── Security validation tests ──────────────────────────────────────────────────

describe('NotificationService — security validation (createNotification)', () => {
  let service: NotificationService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = new NotificationService(prisma);
    service.setSocketIO(makeIO());
  });

  it('returns null when SecuritySanitizer.isValidNotificationType is false (line 592-597)', async () => {
    const spy = jest.spyOn(SecuritySanitizer, 'isValidNotificationType').mockReturnValueOnce(false);
    try {
      const result = await service.createMissedCallNotification(missedCallParams);
      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('returns null when SecuritySanitizer.isValidPriority is false (lines 600-607)', async () => {
    const typeSpy = jest.spyOn(SecuritySanitizer, 'isValidNotificationType').mockReturnValueOnce(true);
    const prioSpy = jest.spyOn(SecuritySanitizer, 'isValidPriority').mockReturnValueOnce(false);
    try {
      const result = await service.createMissedCallNotification(missedCallParams);
      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    } finally {
      typeSpy.mockRestore();
      prioSpy.mockRestore();
    }
  });
});

// ── createNotification error catch ────────────────────────────────────────────

describe('NotificationService — createNotification error catch (lines 844-851)', () => {
  it('returns null when prisma.notification.create throws', async () => {
    const prisma = makePrisma();
    prisma.notification.create.mockRejectedValueOnce(new Error('DB connection lost'));

    const service = new NotificationService(prisma);
    service.setSocketIO(makeIO());

    const result = await service.createMissedCallNotification(missedCallParams);
    expect(result).toBeNull();
  });
});
