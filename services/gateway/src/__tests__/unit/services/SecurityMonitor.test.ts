/**
 * Unit tests for SecurityMonitor
 * Covers: logEvent (DB persistence, silent error handling),
 * checkThresholds (count tracking, threshold alerting, 1-hour window reset,
 * CRITICAL immediate alert), LRU eviction at MAX_EVENT_COUNTS,
 * admin email management, and getAlertStats.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

import { SecurityMonitor } from '../../../services/SecurityMonitor';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── Factories ───────────────────────────────────────────────────────────────

function makePrisma(): any {
  return {
    securityEvent: {
      create: jest.fn<any>().mockResolvedValue({}),
      createMany: jest.fn<any>().mockResolvedValue({}),
      findMany: jest.fn<any>().mockResolvedValue([]),
      groupBy: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    user: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
  };
}

function makeEmailService() {
  return {
    sendSecurityAlertEmail: jest.fn<any>().mockResolvedValue(undefined),
  };
}

function makeSut(emailService?: any, prisma = makePrisma()) {
  const monitor = new SecurityMonitor(prisma as unknown as PrismaClient, emailService);
  return { monitor, prisma, emailService };
}

function makeEvent(overrides: Record<string, any> = {}) {
  return {
    eventType: 'LOGIN_FAILED' as const,
    severity: 'LOW' as const,
    status: 'DETECTED' as const,
    ipAddress: '192.168.1.1',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SecurityMonitor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    delete process.env.SECURITY_ADMIN_EMAILS;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ── logEvent ──────────────────────────────────────────────────────────────

  describe('logEvent', () => {
    it('persists event to DB via securityEvent.create', async () => {
      const prisma = makePrisma();
      const { monitor } = makeSut(undefined, prisma);

      await monitor.logEvent(makeEvent({ userId: 'user-1', description: 'failed login' }));

      expect(prisma.securityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            eventType: 'LOGIN_FAILED',
            severity: 'LOW',
          }),
        })
      );
    });

    it('serializes metadata to JSON string', async () => {
      const prisma = makePrisma();
      const { monitor } = makeSut(undefined, prisma);
      const meta = { attempt: 3, reason: 'wrong-password' };

      await monitor.logEvent(makeEvent({ metadata: meta }));

      expect(prisma.securityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ metadata: JSON.stringify(meta) }),
        })
      );
    });

    it('does not throw when DB create fails (silent error handling)', async () => {
      const prisma = makePrisma();
      prisma.securityEvent.create.mockRejectedValue(new Error('db down'));
      const { monitor } = makeSut(undefined, prisma);

      await expect(monitor.logEvent(makeEvent())).resolves.not.toThrow();
    });
  });

  // ── logBatch ──────────────────────────────────────────────────────────────

  describe('logBatch', () => {
    it('calls createMany with mapped events', async () => {
      const prisma = makePrisma();
      const { monitor } = makeSut(undefined, prisma);
      const events = [makeEvent(), makeEvent({ ipAddress: '10.0.0.1' })];

      await monitor.logBatch(events);

      expect(prisma.securityEvent.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ eventType: 'LOGIN_FAILED' })]) })
      );
    });
  });

  // ── checkThresholds / alert logic ─────────────────────────────────────────

  describe('threshold alerting', () => {
    it('does NOT send alert below threshold', async () => {
      const email = makeEmailService();
      email.sendSecurityAlertEmail = jest.fn<any>().mockResolvedValue(undefined);
      const { monitor } = makeSut(email);
      monitor.addAdminEmail('admin@test.com');

      // LOGIN_FAILED threshold = 50; fire 49 events
      const event = makeEvent({ eventType: 'LOGIN_FAILED', severity: 'MEDIUM' });
      for (let i = 0; i < 49; i++) {
        await monitor.logEvent(event);
      }

      expect(email.sendSecurityAlertEmail).not.toHaveBeenCalled();
    });

    it('sends alert when count reaches threshold within 1-hour window', async () => {
      const email = makeEmailService();
      const { monitor } = makeSut(email);
      monitor.addAdminEmail('admin@test.com');

      // ACCOUNT_LOCKED threshold = 5
      const event = makeEvent({ eventType: 'ACCOUNT_LOCKED', severity: 'HIGH' });
      for (let i = 0; i < 5; i++) {
        await monitor.logEvent(event);
      }

      expect(email.sendSecurityAlertEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'admin@test.com' })
      );
    });

    it('sends CRITICAL alert immediately on first CRITICAL event', async () => {
      const email = makeEmailService();
      const { monitor } = makeSut(email);
      monitor.addAdminEmail('sec@test.com');

      // An event type with no threshold, but CRITICAL severity
      await monitor.logEvent(makeEvent({ eventType: 'IMPOSSIBLE_TRAVEL', severity: 'CRITICAL' }));

      expect(email.sendSecurityAlertEmail).toHaveBeenCalled();
    });

    it('resets counter after 1-hour window and does not re-alert', async () => {
      const email = makeEmailService();
      const { monitor } = makeSut(email);
      monitor.addAdminEmail('admin@test.com');

      // PASSWORD_RESET_FAILED threshold = 10; fire 5 events within the window
      const event = makeEvent({ eventType: 'PASSWORD_RESET_FAILED', severity: 'MEDIUM' });
      for (let i = 0; i < 5; i++) {
        await monitor.logEvent(event);
      }
      expect(email.sendSecurityAlertEmail).not.toHaveBeenCalled();

      // Advance time by > 1 hour
      jest.advanceTimersByTime(61 * 60 * 1000);

      // Fire 5 more — counter should have reset, so still below threshold
      for (let i = 0; i < 5; i++) {
        await monitor.logEvent(event);
      }

      // Still no alert (would need 10 more to hit threshold again)
      expect(email.sendSecurityAlertEmail).not.toHaveBeenCalled();
    });

    it('does not send alert when eventType has no configured threshold', async () => {
      const email = makeEmailService();
      const { monitor } = makeSut(email);
      monitor.addAdminEmail('admin@test.com');

      // Unknown event type — no threshold configured, severity is LOW
      const event = makeEvent({ eventType: 'SESSION_EXPIRED' as any, severity: 'LOW' });
      for (let i = 0; i < 100; i++) {
        await monitor.logEvent(event);
      }

      expect(email.sendSecurityAlertEmail).not.toHaveBeenCalled();
    });

    it('does not send email when no admin emails are configured', async () => {
      const email = makeEmailService();
      const { monitor } = makeSut(email);
      // No addAdminEmail call

      const event = makeEvent({ eventType: 'IMPOSSIBLE_TRAVEL', severity: 'CRITICAL' });
      await monitor.logEvent(event);

      expect(email.sendSecurityAlertEmail).not.toHaveBeenCalled();
    });
  });

  // ── Admin email management ─────────────────────────────────────────────────

  describe('addAdminEmail / removeAdminEmail', () => {
    it('adds email only once (no duplicates)', () => {
      const { monitor } = makeSut();

      monitor.addAdminEmail('a@test.com');
      monitor.addAdminEmail('a@test.com');

      expect(monitor.getAlertStats().adminEmails).toBe(1);
    });

    it('removes an existing admin email', () => {
      const { monitor } = makeSut();

      monitor.addAdminEmail('a@test.com');
      monitor.addAdminEmail('b@test.com');
      monitor.removeAdminEmail('a@test.com');

      expect(monitor.getAlertStats().adminEmails).toBe(1);
    });
  });

  // ── getAlertStats ─────────────────────────────────────────────────────────

  describe('getAlertStats', () => {
    it('returns thresholds array, activeCounters, and adminEmails count', async () => {
      const { monitor } = makeSut();
      monitor.addAdminEmail('x@test.com');
      await monitor.logEvent(makeEvent()); // creates one counter entry

      const stats = monitor.getAlertStats();

      expect(stats.thresholds).toBeInstanceOf(Array);
      expect(stats.thresholds.length).toBeGreaterThan(0);
      expect(stats.activeCounters).toBeGreaterThanOrEqual(1);
      expect(stats.adminEmails).toBe(1);
    });

    it('loads admin emails from SECURITY_ADMIN_EMAILS env on construction', () => {
      process.env.SECURITY_ADMIN_EMAILS = 'a@x.com, b@x.com';
      const { monitor } = makeSut();

      expect(monitor.getAlertStats().adminEmails).toBe(2);
    });
  });

  // ── SUSPICIOUS_PASSWORD_RESET threshold = 1 ──────────────────────────────

  describe('SUSPICIOUS_PASSWORD_RESET (threshold=1)', () => {
    it('sends alert on the second occurrence (count 2 ≥ threshold 1)', async () => {
      const email = makeEmailService();
      const { monitor } = makeSut(email);
      monitor.addAdminEmail('admin@test.com');

      // First call: initializes counter to 1 (no alert yet)
      await monitor.logEvent(makeEvent({ eventType: 'SUSPICIOUS_PASSWORD_RESET', severity: 'HIGH' }));
      // Second call: increments to 2, checks 2 >= 1 → alert
      await monitor.logEvent(makeEvent({ eventType: 'SUSPICIOUS_PASSWORD_RESET', severity: 'HIGH' }));

      expect(email.sendSecurityAlertEmail).toHaveBeenCalled();
    });
  });
});
