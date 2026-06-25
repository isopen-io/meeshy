/**
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import {
  initSessionService,
  generateSessionToken,
  createSession,
  validateSession,
  getUserSessions,
  invalidateSession,
  invalidateAllSessions,
  revokeSession,
  logout,
  cleanupExpiredSessions,
  markSessionTrusted,
  extendSessionExpiry,
  getSessionConfig,
} from '../../../services/SessionService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'session-id-001',
    userId: 'user-id-001',
    sessionToken: 'hashed-token',
    deviceType: 'desktop',
    deviceVendor: null,
    deviceModel: null,
    osName: 'macOS',
    osVersion: '14.0',
    browserName: 'Chrome',
    browserVersion: '120.0',
    isMobile: false,
    ipAddress: '127.0.0.1',
    country: 'FR',
    city: 'Paris',
    location: null,
    createdAt: new Date('2026-01-01'),
    lastActivityAt: new Date('2026-01-02'),
    isTrusted: false,
    isValid: true,
    expiresAt: new Date(Date.now() + 86_400_000),
    invalidatedAt: null,
    ...overrides,
  };
}

function makePrisma() {
  return {
    userSession: {
      create: jest.fn<() => Promise<Record<string, unknown>>>(),
      findFirst: jest.fn<() => Promise<Record<string, unknown> | null>>(),
      findUnique: jest.fn<() => Promise<Record<string, unknown> | null>>(),
      findMany: jest.fn<() => Promise<Record<string, unknown>[]>>(),
      update: jest.fn<() => Promise<Record<string, unknown>>>(),
      updateMany: jest.fn<() => Promise<{ count: number }>>(),
    },
    securityEvent: {
      create: jest.fn<() => Promise<Record<string, unknown>>>(),
    },
  } as unknown as PrismaClient;
}

// Base request context used across createSession tests
const baseRequestContext = {
  ip: '192.168.1.1',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0',
  geoData: {
    country: 'FR',
    city: 'Paris',
    location: null,
    latitude: null,
    longitude: null,
    timezone: 'Europe/Paris',
  },
  deviceInfo: {
    type: 'desktop',
    vendor: 'Apple',
    model: null,
    os: 'macOS',
    osVersion: '14.0',
    browser: 'Chrome',
    browserVersion: '120.0',
    isMobile: false,
    rawUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0',
  },
};

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------

let mockPrisma: ReturnType<typeof makePrisma>;

beforeEach(() => {
  mockPrisma = makePrisma();
  initSessionService(mockPrisma);
});

// ---------------------------------------------------------------------------
// 1. generateSessionToken
// ---------------------------------------------------------------------------
describe('generateSessionToken', () => {
  it('returns a 64-character hex string', () => {
    const token = generateSessionToken();
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
  });

  it('returns a different value on each call', () => {
    const t1 = generateSessionToken();
    const t2 = generateSessionToken();
    expect(t1).not.toBe(t2);
  });
});

// ---------------------------------------------------------------------------
// 2. getSessionConfig
// ---------------------------------------------------------------------------
describe('getSessionConfig', () => {
  it('returns an object with mobileDays, desktopDays, trustedDays, maxSessions', () => {
    const cfg = getSessionConfig();
    expect(cfg).toHaveProperty('mobileDays');
    expect(cfg).toHaveProperty('desktopDays');
    expect(cfg).toHaveProperty('trustedDays');
    expect(cfg).toHaveProperty('maxSessions');
    expect(typeof cfg.mobileDays).toBe('number');
    expect(typeof cfg.desktopDays).toBe('number');
    expect(typeof cfg.trustedDays).toBe('number');
    expect(typeof cfg.maxSessions).toBe('number');
  });

  it('reflects environment-based defaults (365 / 30 / 365 / 10)', () => {
    const cfg = getSessionConfig();
    expect(cfg.mobileDays).toBe(365);
    expect(cfg.desktopDays).toBe(30);
    expect(cfg.trustedDays).toBe(365);
    expect(cfg.maxSessions).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 3. createSession
// ---------------------------------------------------------------------------
describe('createSession', () => {
  it('calls userSession.create with hashed token and correct userId', async () => {
    const session = makeSession();
    (mockPrisma.userSession.create as jest.Mock).mockResolvedValue(session);
    (mockPrisma.userSession.findMany as jest.Mock).mockResolvedValue([]);

    await createSession({ userId: 'user-id-001', token: 'plain-token', requestContext: baseRequestContext });

    expect(mockPrisma.userSession.create).toHaveBeenCalledTimes(1);
    const callArg = (mockPrisma.userSession.create as jest.Mock).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(callArg.data.userId).toBe('user-id-001');
    // Token must be hashed (not plain) and 64 chars (sha256 hex)
    expect(callArg.data.sessionToken).not.toBe('plain-token');
    expect(typeof callArg.data.sessionToken).toBe('string');
    expect((callArg.data.sessionToken as string).length).toBe(64);
  });

  it('calls userSession.findMany to enforce session limit', async () => {
    const session = makeSession();
    (mockPrisma.userSession.create as jest.Mock).mockResolvedValue(session);
    (mockPrisma.userSession.findMany as jest.Mock).mockResolvedValue([]);

    await createSession({ userId: 'user-id-001', token: 'plain-token', requestContext: baseRequestContext });

    expect(mockPrisma.userSession.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns mapped SessionData with isCurrentSession=true', async () => {
    const session = makeSession();
    (mockPrisma.userSession.create as jest.Mock).mockResolvedValue(session);
    (mockPrisma.userSession.findMany as jest.Mock).mockResolvedValue([]);

    const result = await createSession({ userId: 'user-id-001', token: 'plain-token', requestContext: baseRequestContext });

    expect(result.isCurrentSession).toBe(true);
    expect(result.userId).toBe('user-id-001');
  });

  it('invalidates oldest sessions when session limit is exceeded', async () => {
    const session = makeSession();
    (mockPrisma.userSession.create as jest.Mock).mockResolvedValue(session);

    // 11 sessions — 1 over the default limit of 10
    const overLimitSessions = Array.from({ length: 11 }, (_, i) =>
      makeSession({ id: `session-${i}` })
    );
    (mockPrisma.userSession.findMany as jest.Mock).mockResolvedValue(overLimitSessions);
    (mockPrisma.userSession.update as jest.Mock).mockResolvedValue(makeSession({ isValid: false }));

    await createSession({ userId: 'user-id-001', token: 'plain-token', requestContext: baseRequestContext });

    expect(mockPrisma.userSession.update).toHaveBeenCalledTimes(1);
  });

  it('calculates 30-day expiration for desktop browser', async () => {
    const now = new Date('2026-06-25T10:00:00Z');
    jest.useFakeTimers();
    jest.setSystemTime(now);

    const session = makeSession();
    (mockPrisma.userSession.create as jest.Mock).mockResolvedValue(session);
    (mockPrisma.userSession.findMany as jest.Mock).mockResolvedValue([]);

    await createSession({ userId: 'user-id-001', token: 'plain-token', requestContext: baseRequestContext });

    const callArg = (mockPrisma.userSession.create as jest.Mock).mock.calls[0][0] as { data: { expiresAt: Date } };
    const expectedDate = new Date('2026-06-25T10:00:00Z');
    expectedDate.setDate(expectedDate.getDate() + 30);
    expect(callArg.data.expiresAt.getTime()).toBe(expectedDate.getTime());

    jest.useRealTimers();
  });

  it('calculates 365-day expiration for iOS mobile app', async () => {
    const now = new Date('2026-06-25T10:00:00Z');
    jest.useFakeTimers();
    jest.setSystemTime(now);

    const mobileContext = {
      ...baseRequestContext,
      deviceInfo: { ...baseRequestContext.deviceInfo, isMobile: true, rawUserAgent: 'Meeshy-iOS/1.0.0' },
    };
    const session = makeSession({ isMobile: true });
    (mockPrisma.userSession.create as jest.Mock).mockResolvedValue(session);
    (mockPrisma.userSession.findMany as jest.Mock).mockResolvedValue([]);

    await createSession({ userId: 'user-id-001', token: 'plain-token', requestContext: mobileContext });

    const callArg = (mockPrisma.userSession.create as jest.Mock).mock.calls[0][0] as { data: { expiresAt: Date } };
    const expectedDate = new Date('2026-06-25T10:00:00Z');
    expectedDate.setDate(expectedDate.getDate() + 365);
    expect(callArg.data.expiresAt.getTime()).toBe(expectedDate.getTime());

    jest.useRealTimers();
  });

  it('handles null device info gracefully', async () => {
    const nullDeviceContext = { ip: '192.168.1.1', userAgent: null, geoData: null, deviceInfo: null };
    const session = makeSession({ deviceType: null, deviceVendor: null, country: null, city: null });
    (mockPrisma.userSession.create as jest.Mock).mockResolvedValue(session);
    (mockPrisma.userSession.findMany as jest.Mock).mockResolvedValue([]);

    await createSession({ userId: 'user-id-001', token: 'plain-token', requestContext: nullDeviceContext });

    const callArg = (mockPrisma.userSession.create as jest.Mock).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(callArg.data.deviceType).toBeNull();
    expect(callArg.data.isMobile).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4 & 5. validateSession
// ---------------------------------------------------------------------------
describe('validateSession', () => {
  it('returns null when session not found', async () => {
    (mockPrisma.userSession.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await validateSession('non-existent-token');

    expect(result).toBeNull();
  });

  it('returns SessionData when a valid session exists', async () => {
    const session = makeSession();
    (mockPrisma.userSession.findFirst as jest.Mock).mockResolvedValue(session);
    (mockPrisma.userSession.update as jest.Mock).mockResolvedValue(session);

    const result = await validateSession('valid-token');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('session-id-001');
    expect(result?.userId).toBe('user-id-001');
  });

  it('calls userSession.update to refresh lastActivityAt when session found', async () => {
    const session = makeSession();
    (mockPrisma.userSession.findFirst as jest.Mock).mockResolvedValue(session);
    (mockPrisma.userSession.update as jest.Mock).mockResolvedValue(session);

    await validateSession('valid-token');

    expect(mockPrisma.userSession.update).toHaveBeenCalledTimes(1);
    const updateCall = (mockPrisma.userSession.update as jest.Mock).mock.calls[0][0] as {
      where: { id: string };
      data: { lastActivityAt: Date };
    };
    expect(updateCall.where.id).toBe('session-id-001');
    expect(updateCall.data.lastActivityAt).toBeInstanceOf(Date);
  });

  it('does NOT call update when session is not found', async () => {
    (mockPrisma.userSession.findFirst as jest.Mock).mockResolvedValue(null);

    await validateSession('bad-token');

    expect(mockPrisma.userSession.update).not.toHaveBeenCalled();
  });

  it('queries with isValid:true, invalidatedAt:null, and future expiresAt', async () => {
    (mockPrisma.userSession.findFirst as jest.Mock).mockResolvedValue(null);

    await validateSession('some-token');

    const callArg = (mockPrisma.userSession.findFirst as jest.Mock).mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArg.where.isValid).toBe(true);
    expect(callArg.where.invalidatedAt).toBeNull();
    expect(callArg.where.expiresAt).toEqual({ gt: expect.any(Date) });
  });
});

// ---------------------------------------------------------------------------
// 6. getUserSessions
// ---------------------------------------------------------------------------
describe('getUserSessions', () => {
  it('returns an empty array when no sessions exist', async () => {
    (mockPrisma.userSession.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getUserSessions('user-id-001');

    expect(result).toEqual([]);
  });

  it('returns sessions with isCurrentSession=false when no currentToken provided', async () => {
    const sessions = [makeSession({ sessionToken: 'hash-abc' })];
    (mockPrisma.userSession.findMany as jest.Mock).mockResolvedValue(sessions);

    const result = await getUserSessions('user-id-001');

    expect(result).toHaveLength(1);
    expect(result[0].isCurrentSession).toBe(false);
  });

  it('marks the matching session as isCurrentSession=true when token hash matches', async () => {
    const { createHash } = await import('crypto');
    const rawToken = 'my-plain-token';
    const hash = createHash('sha256').update(rawToken).digest('hex');

    const sessions = [
      makeSession({ id: 'sess-1', sessionToken: hash }),
      makeSession({ id: 'sess-2', sessionToken: 'other-hash' }),
    ];
    (mockPrisma.userSession.findMany as jest.Mock).mockResolvedValue(sessions);

    const result = await getUserSessions('user-id-001', rawToken);

    const current = result.find((s) => s.id === 'sess-1');
    const other = result.find((s) => s.id === 'sess-2');
    expect(current?.isCurrentSession).toBe(true);
    expect(other?.isCurrentSession).toBe(false);
  });

  it('orders sessions by lastActivityAt descending', async () => {
    const sessions = [
      makeSession({ id: 'recent', lastActivityAt: new Date('2026-06-25T10:00:00Z') }),
      makeSession({ id: 'older', lastActivityAt: new Date('2026-06-24T10:00:00Z') }),
    ];
    (mockPrisma.userSession.findMany as jest.Mock).mockResolvedValue(sessions);

    const result = await getUserSessions('user-id-001');

    expect(mockPrisma.userSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { lastActivityAt: 'desc' } })
    );
    expect(result[0].id).toBe('recent');
    expect(result[1].id).toBe('older');
  });
});

// ---------------------------------------------------------------------------
// 7. invalidateSession
// ---------------------------------------------------------------------------
describe('invalidateSession', () => {
  it('returns true on success', async () => {
    (mockPrisma.userSession.update as jest.Mock).mockResolvedValue(makeSession({ isValid: false }));

    const result = await invalidateSession('session-id-001');

    expect(result).toBe(true);
    expect(mockPrisma.userSession.update).toHaveBeenCalledTimes(1);
  });

  it('returns false when update throws', async () => {
    (mockPrisma.userSession.update as jest.Mock).mockRejectedValue(new Error('DB error'));

    const result = await invalidateSession('non-existent-id');

    expect(result).toBe(false);
  });

  it('defaults reason to user_revoked', async () => {
    (mockPrisma.userSession.update as jest.Mock).mockResolvedValue(makeSession());

    await invalidateSession('session-id-001');

    const callArg = (mockPrisma.userSession.update as jest.Mock).mock.calls[0][0] as {
      data: { invalidatedReason: string };
    };
    expect(callArg.data.invalidatedReason).toBe('user_revoked');
  });

  it('passes custom reason when provided', async () => {
    (mockPrisma.userSession.update as jest.Mock).mockResolvedValue(makeSession());

    await invalidateSession('session-id-001', 'admin_revoked');

    const callArg = (mockPrisma.userSession.update as jest.Mock).mock.calls[0][0] as {
      data: { invalidatedReason: string };
    };
    expect(callArg.data.invalidatedReason).toBe('admin_revoked');
  });
});

// ---------------------------------------------------------------------------
// 8. invalidateAllSessions
// ---------------------------------------------------------------------------
describe('invalidateAllSessions', () => {
  it('returns the count from updateMany', async () => {
    (mockPrisma.userSession.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

    const count = await invalidateAllSessions('user-id-001');

    expect(count).toBe(3);
  });

  it('returns 0 when no sessions were invalidated', async () => {
    (mockPrisma.userSession.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const count = await invalidateAllSessions('user-id-001');

    expect(count).toBe(0);
  });

  it('includes sessionToken exclusion filter when exceptToken is provided', async () => {
    (mockPrisma.userSession.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    await invalidateAllSessions('user-id-001', 'keep-this-token');

    const callArg = (mockPrisma.userSession.updateMany as jest.Mock).mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArg.where).toHaveProperty('sessionToken');
  });

  it('omits sessionToken filter when no exceptToken provided', async () => {
    (mockPrisma.userSession.updateMany as jest.Mock).mockResolvedValue({ count: 5 });

    await invalidateAllSessions('user-id-001');

    const callArg = (mockPrisma.userSession.updateMany as jest.Mock).mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArg.where).not.toHaveProperty('sessionToken');
  });

  it('uses default reason user_revoked_all', async () => {
    (mockPrisma.userSession.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await invalidateAllSessions('user-id-001');

    const callArg = (mockPrisma.userSession.updateMany as jest.Mock).mock.calls[0][0] as {
      data: { invalidatedReason: string };
    };
    expect(callArg.data.invalidatedReason).toBe('user_revoked_all');
  });

  it('uses custom reason when provided', async () => {
    (mockPrisma.userSession.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    await invalidateAllSessions('user-id-001', undefined, 'password_changed');

    const callArg = (mockPrisma.userSession.updateMany as jest.Mock).mock.calls[0][0] as {
      data: { invalidatedReason: string };
    };
    expect(callArg.data.invalidatedReason).toBe('password_changed');
  });
});

// ---------------------------------------------------------------------------
// 9. revokeSession
// ---------------------------------------------------------------------------
describe('revokeSession', () => {
  it('returns false when session is not found for the given user', async () => {
    (mockPrisma.userSession.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await revokeSession('user-id-001', 'session-id-999');

    expect(result).toBe(false);
    expect(mockPrisma.userSession.update).not.toHaveBeenCalled();
  });

  it('returns true and delegates to invalidateSession when session belongs to user', async () => {
    const session = makeSession();
    (mockPrisma.userSession.findFirst as jest.Mock).mockResolvedValue(session);
    (mockPrisma.userSession.update as jest.Mock).mockResolvedValue(makeSession({ isValid: false }));

    const result = await revokeSession('user-id-001', 'session-id-001');

    expect(result).toBe(true);
    expect(mockPrisma.userSession.update).toHaveBeenCalledTimes(1);
  });

  it('verifies ownership by including userId in the findFirst query', async () => {
    (mockPrisma.userSession.findFirst as jest.Mock).mockResolvedValue(null);

    await revokeSession('user-id-001', 'session-id-001');

    const callArg = (mockPrisma.userSession.findFirst as jest.Mock).mock.calls[0][0] as {
      where: { userId: string; id: string };
    };
    expect(callArg.where.userId).toBe('user-id-001');
    expect(callArg.where.id).toBe('session-id-001');
  });
});

// ---------------------------------------------------------------------------
// 10. logout
// ---------------------------------------------------------------------------
describe('logout', () => {
  it('returns false when no sessions are found (count=0)', async () => {
    (mockPrisma.userSession.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const result = await logout('non-existent-token');

    expect(result).toBe(false);
  });

  it('returns true when the session was successfully invalidated', async () => {
    (mockPrisma.userSession.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const result = await logout('valid-token');

    expect(result).toBe(true);
  });

  it('calls updateMany with hashed token and logout reason', async () => {
    (mockPrisma.userSession.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await logout('my-plain-token');

    const callArg = (mockPrisma.userSession.updateMany as jest.Mock).mock.calls[0][0] as {
      where: { sessionToken: string };
      data: { invalidatedReason: string };
    };
    expect(callArg.where.sessionToken).not.toBe('my-plain-token');
    expect(callArg.where.sessionToken).toHaveLength(64);
    expect(callArg.data.invalidatedReason).toBe('logout');
  });
});

// ---------------------------------------------------------------------------
// 11. cleanupExpiredSessions
// ---------------------------------------------------------------------------
describe('cleanupExpiredSessions', () => {
  it('returns the count from updateMany', async () => {
    (mockPrisma.userSession.updateMany as jest.Mock).mockResolvedValue({ count: 7 });

    const count = await cleanupExpiredSessions();

    expect(count).toBe(7);
  });

  it('returns 0 when no sessions were expired', async () => {
    (mockPrisma.userSession.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const count = await cleanupExpiredSessions();

    expect(count).toBe(0);
  });

  it('calls updateMany with expired reason', async () => {
    (mockPrisma.userSession.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    await cleanupExpiredSessions();

    const callArg = (mockPrisma.userSession.updateMany as jest.Mock).mock.calls[0][0] as {
      data: { invalidatedReason: string };
    };
    expect(callArg.data.invalidatedReason).toBe('expired');
  });
});

// ---------------------------------------------------------------------------
// 12–17. markSessionTrusted
// ---------------------------------------------------------------------------
describe('markSessionTrusted', () => {
  it('returns false for an empty sessionId string (invalid guard)', async () => {
    const result = await markSessionTrusted('');

    expect(result).toBe(false);
    expect(mockPrisma.userSession.findUnique).not.toHaveBeenCalled();
  });

  it('returns false when session is not found', async () => {
    (mockPrisma.userSession.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.securityEvent.create as jest.Mock).mockResolvedValue({});

    const result = await markSessionTrusted('non-existent-session');

    expect(result).toBe(false);
  });

  it('returns false when session is invalid (isValid=false)', async () => {
    (mockPrisma.userSession.findUnique as jest.Mock).mockResolvedValue({
      id: 'session-id-001',
      userId: 'user-id-001',
      isTrusted: false,
      isValid: false,
    });
    (mockPrisma.securityEvent.create as jest.Mock).mockResolvedValue({});

    const result = await markSessionTrusted('session-id-001');

    expect(result).toBe(false);
    expect(mockPrisma.userSession.update).not.toHaveBeenCalled();
  });

  it('returns true when session is already trusted (no update called)', async () => {
    (mockPrisma.userSession.findUnique as jest.Mock).mockResolvedValue({
      id: 'session-id-001',
      userId: 'user-id-001',
      isTrusted: true,
      isValid: true,
    });

    const result = await markSessionTrusted('session-id-001');

    expect(result).toBe(true);
    expect(mockPrisma.userSession.update).not.toHaveBeenCalled();
  });

  it('returns true and calls update + securityEvent.create on a fresh trusted session', async () => {
    (mockPrisma.userSession.findUnique as jest.Mock).mockResolvedValue({
      id: 'session-id-001',
      userId: 'user-id-001',
      isTrusted: false,
      isValid: true,
    });
    (mockPrisma.userSession.update as jest.Mock).mockResolvedValue(makeSession({ isTrusted: true }));
    (mockPrisma.securityEvent.create as jest.Mock).mockResolvedValue({});

    const result = await markSessionTrusted('session-id-001', {
      userId: 'user-id-001',
      source: '2fa_verification',
    });

    expect(result).toBe(true);
    expect(mockPrisma.userSession.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.securityEvent.create).toHaveBeenCalledTimes(1);

    const updateArg = (mockPrisma.userSession.update as jest.Mock).mock.calls[0][0] as {
      data: { isTrusted: boolean; expiresAt: Date };
    };
    expect(updateArg.data.isTrusted).toBe(true);
    expect(updateArg.data.expiresAt).toBeInstanceOf(Date);
  });

  it('returns false when update throws, and still calls securityEvent.create for failure', async () => {
    (mockPrisma.userSession.findUnique as jest.Mock).mockResolvedValue({
      id: 'session-id-001',
      userId: 'user-id-001',
      isTrusted: false,
      isValid: true,
    });
    (mockPrisma.userSession.update as jest.Mock).mockRejectedValue(new Error('DB crash'));
    (mockPrisma.securityEvent.create as jest.Mock).mockResolvedValue({});

    const result = await markSessionTrusted('session-id-001', { userId: 'user-id-001' });

    expect(result).toBe(false);
    expect(mockPrisma.securityEvent.create).toHaveBeenCalledTimes(1);
    const secArg = (mockPrisma.securityEvent.create as jest.Mock).mock.calls[0][0] as {
      data: { status: string; eventType: string };
    };
    expect(secArg.data.status).toBe('FAILED');
    expect(secArg.data.eventType).toBe('SESSION_TRUSTED_FAILED');
  });

  it('uses existingSession.userId when context.userId is not provided', async () => {
    (mockPrisma.userSession.findUnique as jest.Mock).mockResolvedValue({
      id: 'session-id-001',
      userId: 'db-user-id',
      isTrusted: false,
      isValid: true,
    });
    (mockPrisma.userSession.update as jest.Mock).mockResolvedValue(makeSession({ isTrusted: true }));
    (mockPrisma.securityEvent.create as jest.Mock).mockResolvedValue({});

    await markSessionTrusted('session-id-001'); // no context

    const securityEventArg = (mockPrisma.securityEvent.create as jest.Mock).mock.calls[0][0] as {
      data: { userId: string };
    };
    expect(securityEventArg.data.userId).toBe('db-user-id');
  });

  it('logs SESSION_TRUSTED success event with correct severity and source', async () => {
    (mockPrisma.userSession.findUnique as jest.Mock).mockResolvedValue({
      id: 'session-id-001',
      userId: 'user-id-001',
      isTrusted: false,
      isValid: true,
    });
    (mockPrisma.userSession.update as jest.Mock).mockResolvedValue(makeSession({ isTrusted: true }));
    (mockPrisma.securityEvent.create as jest.Mock).mockResolvedValue({});

    await markSessionTrusted('session-id-001', {
      userId: 'user-id-001',
      ipAddress: '10.0.0.1',
      userAgent: 'TestAgent/1.0',
      source: 'magic_link',
    });

    const secArg = (mockPrisma.securityEvent.create as jest.Mock).mock.calls[0][0] as {
      data: { eventType: string; severity: string; status: string; ipAddress: string; userAgent: string };
    };
    expect(secArg.data.eventType).toBe('SESSION_TRUSTED');
    expect(secArg.data.severity).toBe('LOW');
    expect(secArg.data.status).toBe('SUCCESS');
    expect(secArg.data.ipAddress).toBe('10.0.0.1');
    expect(secArg.data.userAgent).toBe('TestAgent/1.0');
  });
});

// ---------------------------------------------------------------------------
// 18 & 19. extendSessionExpiry
// ---------------------------------------------------------------------------
describe('extendSessionExpiry', () => {
  it('returns false when session is not found', async () => {
    (mockPrisma.userSession.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await extendSessionExpiry('non-existent-token');

    expect(result).toBe(false);
    expect(mockPrisma.userSession.update).not.toHaveBeenCalled();
  });

  it('returns true when session is found and extended', async () => {
    const session = makeSession({ isMobile: false });
    (mockPrisma.userSession.findFirst as jest.Mock).mockResolvedValue(session);
    (mockPrisma.userSession.update as jest.Mock).mockResolvedValue(session);

    const result = await extendSessionExpiry('valid-token');

    expect(result).toBe(true);
    expect(mockPrisma.userSession.update).toHaveBeenCalledTimes(1);
  });

  it('calls update with a new future expiresAt and refreshed lastActivityAt', async () => {
    const session = makeSession({ isMobile: false });
    (mockPrisma.userSession.findFirst as jest.Mock).mockResolvedValue(session);
    (mockPrisma.userSession.update as jest.Mock).mockResolvedValue(session);

    const before = new Date();
    await extendSessionExpiry('valid-token');

    const updateArg = (mockPrisma.userSession.update as jest.Mock).mock.calls[0][0] as {
      data: { expiresAt: Date; lastActivityAt: Date };
    };
    expect(updateArg.data.expiresAt.getTime()).toBeGreaterThan(before.getTime());
    expect(updateArg.data.lastActivityAt).toBeInstanceOf(Date);
  });

  it('uses provided days parameter when given', async () => {
    const session = makeSession({ isMobile: false });
    (mockPrisma.userSession.findFirst as jest.Mock).mockResolvedValue(session);
    (mockPrisma.userSession.update as jest.Mock).mockResolvedValue(session);

    const beforeMs = Date.now();
    await extendSessionExpiry('valid-token', 7);

    const updateArg = (mockPrisma.userSession.update as jest.Mock).mock.calls[0][0] as {
      data: { expiresAt: Date };
    };
    const diffDays = (updateArg.data.expiresAt.getTime() - beforeMs) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 0);
  });

  it('uses mobile expiry days (365) for mobile sessions when no days given', async () => {
    const session = makeSession({ isMobile: true });
    (mockPrisma.userSession.findFirst as jest.Mock).mockResolvedValue(session);
    (mockPrisma.userSession.update as jest.Mock).mockResolvedValue(session);

    const beforeMs = Date.now();
    await extendSessionExpiry('valid-mobile-token');

    const updateArg = (mockPrisma.userSession.update as jest.Mock).mock.calls[0][0] as {
      data: { expiresAt: Date };
    };
    const diffDays = (updateArg.data.expiresAt.getTime() - beforeMs) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(365, 0);
  });

  it('uses desktop expiry days (30) for desktop sessions when no days given', async () => {
    const session = makeSession({ isMobile: false });
    (mockPrisma.userSession.findFirst as jest.Mock).mockResolvedValue(session);
    (mockPrisma.userSession.update as jest.Mock).mockResolvedValue(session);

    const beforeMs = Date.now();
    await extendSessionExpiry('valid-desktop-token');

    const updateArg = (mockPrisma.userSession.update as jest.Mock).mock.calls[0][0] as {
      data: { expiresAt: Date };
    };
    const diffDays = (updateArg.data.expiresAt.getTime() - beforeMs) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(30, 0);
  });

  it('returns false when update throws', async () => {
    const session = makeSession();
    (mockPrisma.userSession.findFirst as jest.Mock).mockResolvedValue(session);
    (mockPrisma.userSession.update as jest.Mock).mockRejectedValue(new Error('DB error'));

    const result = await extendSessionExpiry('valid-token');

    expect(result).toBe(false);
  });
})
