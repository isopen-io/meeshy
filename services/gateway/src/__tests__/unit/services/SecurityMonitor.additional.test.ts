/**
 * Additional SecurityMonitor tests — covers branches not reached by the primary suite:
 *   - getRecentEvents (with/without severity filter)
 *   - getMetrics
 *   - getUserEvents
 *   - logBatch error path (silent)
 *   - sendAlert email error path (silent)
 *   - _setEventCount LRU eviction (MAX_EVENT_COUNTS)
 *   - startEventCountCleanup interval (old entries removed)
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

import { SecurityMonitor } from '../../../services/SecurityMonitor';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

function makePrisma(): any {
  return {
    securityEvent: {
      create: jest.fn<any>().mockResolvedValue({}),
      createMany: jest.fn<any>().mockResolvedValue({}),
      findMany: jest.fn<any>().mockResolvedValue([]),
      groupBy: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
    },
  };
}

function makeEmailService() {
  return {
    sendSecurityAlertEmail: jest.fn<any>().mockResolvedValue(undefined),
  };
}

function makeEvent(overrides: Record<string, any> = {}) {
  return {
    eventType: 'LOGIN_FAILED' as const,
    severity: 'LOW' as const,
    status: 'DETECTED' as const,
    ipAddress: '1.2.3.4',
    ...overrides,
  };
}

describe('SecurityMonitor — additional coverage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    delete process.env.SECURITY_ADMIN_EMAILS;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ── getRecentEvents ───────────────────────────────────────────────────────

  describe('getRecentEvents', () => {
    it('queries recent events without severity filter', async () => {
      const prisma = makePrisma();
      const events = [{ id: '1', eventType: 'LOGIN_FAILED' }];
      prisma.securityEvent.findMany.mockResolvedValue(events);
      const monitor = new SecurityMonitor(prisma as unknown as PrismaClient);

      const result = await monitor.getRecentEvents(12);

      expect(prisma.securityEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ createdAt: expect.any(Object) }),
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      );
      expect(result).toEqual(events);
    });

    it('passes severity filter to findMany when provided', async () => {
      const prisma = makePrisma();
      const monitor = new SecurityMonitor(prisma as unknown as PrismaClient);

      await monitor.getRecentEvents(6, 'CRITICAL');

      expect(prisma.securityEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ severity: 'CRITICAL' }),
        })
      );
    });
  });

  // ── getMetrics ────────────────────────────────────────────────────────────

  describe('getMetrics', () => {
    it('returns aggregated metrics for the given period', async () => {
      const prisma = makePrisma();
      prisma.securityEvent.groupBy.mockResolvedValue([
        { eventType: 'LOGIN_FAILED', severity: 'LOW', _count: { id: 5 } },
      ]);
      prisma.securityEvent.count
        .mockResolvedValueOnce(10) // totalEvents
        .mockResolvedValueOnce(2)  // criticalEvents
        .mockResolvedValueOnce(3); // highEvents
      const monitor = new SecurityMonitor(prisma as unknown as PrismaClient);

      const metrics = await monitor.getMetrics(48);

      expect(metrics.period).toBe('48h');
      expect(metrics.totalEvents).toBe(10);
      expect(metrics.criticalEvents).toBe(2);
      expect(metrics.highEvents).toBe(3);
      expect(Array.isArray(metrics.eventsByType)).toBe(true);
      expect(metrics.timestamp).toBeInstanceOf(Date);
    });

    it('uses 24h as default period', async () => {
      const prisma = makePrisma();
      const monitor = new SecurityMonitor(prisma as unknown as PrismaClient);

      const metrics = await monitor.getMetrics();

      expect(metrics.period).toBe('24h');
    });
  });

  // ── getUserEvents ─────────────────────────────────────────────────────────

  describe('getUserEvents', () => {
    it('queries events for the given userId', async () => {
      const prisma = makePrisma();
      const events = [{ id: 'e1', userId: 'u1' }];
      prisma.securityEvent.findMany.mockResolvedValue(events);
      const monitor = new SecurityMonitor(prisma as unknown as PrismaClient);

      const result = await monitor.getUserEvents('u1', 48);

      expect(prisma.securityEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'u1' }),
          orderBy: { createdAt: 'desc' },
        })
      );
      expect(result).toEqual(events);
    });
  });

  // ── logBatch — error path (silent) ────────────────────────────────────────

  describe('logBatch — error path', () => {
    it('does not throw when createMany fails', async () => {
      const prisma = makePrisma();
      prisma.securityEvent.createMany.mockRejectedValue(new Error('db down'));
      const monitor = new SecurityMonitor(prisma as unknown as PrismaClient);

      await expect(monitor.logBatch([makeEvent()])).resolves.not.toThrow();
    });
  });

  // ── sendAlert — email error path (silent) ─────────────────────────────────

  describe('sendAlert — email error is swallowed', () => {
    it('does not propagate when sendSecurityAlertEmail throws', async () => {
      const email = makeEmailService();
      email.sendSecurityAlertEmail.mockRejectedValue(new Error('smtp down'));
      const monitor = new SecurityMonitor(
        makePrisma() as unknown as PrismaClient,
        email as any
      );
      monitor.addAdminEmail('admin@test.com');

      // IMPOSSIBLE_TRAVEL threshold = 1: two calls to exceed it + CRITICAL immediate
      await monitor.logEvent(makeEvent({ eventType: 'IMPOSSIBLE_TRAVEL', severity: 'CRITICAL' }));
      // Should not throw despite email failure
      await expect(
        monitor.logEvent(makeEvent({ eventType: 'IMPOSSIBLE_TRAVEL', severity: 'CRITICAL' }))
      ).resolves.not.toThrow();
    });
  });

  // ── _setEventCount — LRU eviction at MAX_EVENT_COUNTS ─────────────────────

  describe('_setEventCount — LRU eviction', () => {
    it('evicts the oldest entry when the map reaches MAX_EVENT_COUNTS', async () => {
      const prisma = makePrisma();
      const monitor = new SecurityMonitor(prisma as unknown as PrismaClient);
      const eventCounts: Map<string, any> = (monitor as any).eventCounts;
      const MAX = (monitor as any).MAX_EVENT_COUNTS as number;

      // Fill to capacity — all entries are for unknown events so checkThresholds
      // exits early, but we call _setEventCount directly
      const setEventCount: (key: string, value: { count: number; firstSeen: Date }) => void =
        (monitor as any)._setEventCount.bind(monitor);

      for (let i = 0; i < MAX; i++) {
        setEventCount(`fill-key-${i}`, { count: 1, firstSeen: new Date() });
      }
      expect(eventCounts.size).toBe(MAX);

      // Adding one more should evict the oldest (fill-key-0)
      setEventCount('new-key', { count: 1, firstSeen: new Date() });

      expect(eventCounts.has('fill-key-0')).toBe(false);
      expect(eventCounts.has('new-key')).toBe(true);
      expect(eventCounts.size).toBe(MAX); // size stays at MAX
    });
  });

  // ── startEventCountCleanup — interval fires ───────────────────────────────

  describe('startEventCountCleanup — interval fires', () => {
    it('removes event counters older than 1 hour when the 10-minute interval fires', async () => {
      const prisma = makePrisma();
      const monitor = new SecurityMonitor(prisma as unknown as PrismaClient);
      const eventCounts: Map<string, any> = (monitor as any).eventCounts;

      // Inject an old entry (2 hours old) and a fresh entry
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const justNow = new Date(Date.now() - 1000);
      eventCounts.set('old-event-key', { count: 3, firstSeen: twoHoursAgo });
      eventCounts.set('fresh-event-key', { count: 1, firstSeen: justNow });

      // Trigger the 10-minute interval
      jest.advanceTimersByTime(10 * 60 * 1000 + 100);

      expect(eventCounts.has('old-event-key')).toBe(false);
      expect(eventCounts.has('fresh-event-key')).toBe(true);
    });
  });
});
