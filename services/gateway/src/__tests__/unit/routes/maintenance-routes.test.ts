/**
 * Route tests — maintenance routes
 *
 * Covers:
 *   GET  /stats
 *   POST /cleanup
 *   POST /user-status
 *   GET  /status-metrics
 *   POST /status-metrics/reset
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mock services before importing the route ─────────────────────────────────

const mockGetMaintenanceStats = jest.fn() as jest.Mock;
const mockCleanupExpiredData = jest.fn() as jest.Mock;
const mockUpdateUserOnlineStatus = jest.fn() as jest.Mock;
const mockGetMetrics = jest.fn() as jest.Mock;
const mockResetMetrics = jest.fn() as jest.Mock;

jest.mock('../../../services/MaintenanceService', () => ({
  MaintenanceService: jest.fn().mockImplementation(() => ({
    getMaintenanceStats: (...a: unknown[]) => mockGetMaintenanceStats(...a),
    cleanupExpiredData: (...a: unknown[]) => mockCleanupExpiredData(...a),
    updateUserOnlineStatus: (...a: unknown[]) => mockUpdateUserOnlineStatus(...a),
  })),
}));

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/StatusService', () => ({
  StatusService: jest.fn().mockImplementation(() => ({
    getMetrics: (...a: unknown[]) => mockGetMetrics(...a),
    resetMetrics: (...a: unknown[]) => mockResetMetrics(...a),
  })),
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

// ─── Import route under test ──────────────────────────────────────────────────

import { maintenanceRoutes } from '../../../routes/maintenance';

// ─── App builder ─────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: false } },
  });
  app.decorate('prisma', {} as unknown);
  await app.register(maintenanceRoutes, { prefix: '/maintenance' });
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Maintenance Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── GET /maintenance/stats ────────────────────────────────────────────────

  describe('GET /maintenance/stats', () => {
    it('returns 200 with stats when service succeeds', async () => {
      mockGetMaintenanceStats.mockResolvedValue({
        onlineUsers: 42,
        totalUsers: 1000,
        anonymousSessions: 5,
        offlineThresholdMinutes: 5,
        maintenanceActive: false,
      });

      const res = await app.inject({ method: 'GET', url: '/maintenance/stats' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.onlineUsers).toBe(42);
    });

    it('returns 500 when getMaintenanceStats returns null', async () => {
      mockGetMaintenanceStats.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: '/maintenance/stats' });

      expect(res.statusCode).toBe(500);
    });

    it('returns 500 when getMaintenanceStats throws', async () => {
      mockGetMaintenanceStats.mockRejectedValue(new Error('db error'));

      const res = await app.inject({ method: 'GET', url: '/maintenance/stats' });

      expect(res.statusCode).toBe(500);
    });
  });

  // ── POST /maintenance/cleanup ─────────────────────────────────────────────

  describe('POST /maintenance/cleanup', () => {
    it('returns 200 when cleanup succeeds', async () => {
      mockCleanupExpiredData.mockResolvedValue(undefined);

      const res = await app.inject({ method: 'POST', url: '/maintenance/cleanup' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toContain('terminé');
    });

    it('returns 500 when cleanupExpiredData throws', async () => {
      mockCleanupExpiredData.mockRejectedValue(new Error('cleanup failed'));

      const res = await app.inject({ method: 'POST', url: '/maintenance/cleanup' });

      expect(res.statusCode).toBe(500);
    });
  });

  // ── POST /maintenance/user-status ─────────────────────────────────────────

  describe('POST /maintenance/user-status', () => {
    it('returns 200 with "en ligne" message when isOnline is true', async () => {
      mockUpdateUserOnlineStatus.mockResolvedValue(undefined);

      const res = await app.inject({
        method: 'POST',
        url: '/maintenance/user-status',
        payload: { userId: 'user-abc', isOnline: true },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toContain('en ligne');
      expect(mockUpdateUserOnlineStatus).toHaveBeenCalledWith('user-abc', true);
    });

    it('returns 200 with "hors ligne" message when isOnline is false', async () => {
      mockUpdateUserOnlineStatus.mockResolvedValue(undefined);

      const res = await app.inject({
        method: 'POST',
        url: '/maintenance/user-status',
        payload: { userId: 'user-abc', isOnline: false },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.message).toContain('hors ligne');
    });

    it('returns 500 when updateUserOnlineStatus throws', async () => {
      mockUpdateUserOnlineStatus.mockRejectedValue(new Error('service error'));

      const res = await app.inject({
        method: 'POST',
        url: '/maintenance/user-status',
        payload: { userId: 'user-abc', isOnline: true },
      });

      expect(res.statusCode).toBe(500);
    });
  });

  // ── GET /maintenance/status-metrics ──────────────────────────────────────

  describe('GET /maintenance/status-metrics', () => {
    it('returns 200 with computed throttleRate when totalRequests > 0', async () => {
      mockGetMetrics.mockReturnValue({
        totalRequests: 100,
        throttledRequests: 10,
        successfulUpdates: 90,
        failedUpdates: 0,
        cacheSize: 50,
      });

      const res = await app.inject({ method: 'GET', url: '/maintenance/status-metrics' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.throttleRate).toBe(10);
      expect(body.data.totalRequests).toBe(100);
    });

    it('returns throttleRate of 0 when totalRequests is 0', async () => {
      mockGetMetrics.mockReturnValue({
        totalRequests: 0,
        throttledRequests: 0,
        successfulUpdates: 0,
        failedUpdates: 0,
        cacheSize: 0,
      });

      const res = await app.inject({ method: 'GET', url: '/maintenance/status-metrics' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.throttleRate).toBe(0);
    });

    it('returns 500 when getMetrics throws', async () => {
      mockGetMetrics.mockImplementation(() => { throw new Error('metrics unavailable'); });

      const res = await app.inject({ method: 'GET', url: '/maintenance/status-metrics' });

      expect(res.statusCode).toBe(500);
    });
  });

  // ── POST /maintenance/status-metrics/reset ────────────────────────────────

  describe('POST /maintenance/status-metrics/reset', () => {
    it('returns 200 when reset succeeds', async () => {
      mockResetMetrics.mockReturnValue(undefined);

      const res = await app.inject({ method: 'POST', url: '/maintenance/status-metrics/reset' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toContain('réinitialisées');
      expect(mockResetMetrics).toHaveBeenCalledTimes(1);
    });

    it('returns 500 when resetMetrics throws', async () => {
      mockResetMetrics.mockImplementation(() => { throw new Error('reset failed'); });

      const res = await app.inject({ method: 'POST', url: '/maintenance/status-metrics/reset' });

      expect(res.statusCode).toBe(500);
    });
  });
});
