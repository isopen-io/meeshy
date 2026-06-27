/**
 * maintenance-routes.test.ts
 *
 * Unit tests for src/routes/maintenance.ts
 * Covers:
 *   - GET  /stats                    (maintenance statistics)
 *   - POST /cleanup                  (trigger data cleanup)
 *   - POST /user-status              (update user online status)
 *   - GET  /status-metrics           (StatusService metrics)
 *   - POST /status-metrics/reset     (reset metrics)
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', additionalProperties: true },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
  },
}));

const mockGetMaintenanceStats      = jest.fn<any>();
const mockCleanupExpiredData       = jest.fn<any>();
const mockUpdateUserOnlineStatus   = jest.fn<any>();

jest.mock('../../../services/MaintenanceService', () => ({
  MaintenanceService: jest.fn().mockImplementation(() => ({
    getMaintenanceStats:    (...args: any[]) => mockGetMaintenanceStats(...args),
    cleanupExpiredData:     (...args: any[]) => mockCleanupExpiredData(...args),
    updateUserOnlineStatus: (...args: any[]) => mockUpdateUserOnlineStatus(...args),
  })),
}));

const mockGetMetrics   = jest.fn<any>();
const mockResetMetrics = jest.fn<any>();

jest.mock('../../../services/StatusService', () => ({
  StatusService: jest.fn().mockImplementation(() => ({
    getMetrics:   (...args: any[]) => mockGetMetrics(...args),
    resetMetrics: (...args: any[]) => mockResetMetrics(...args),
  })),
}));

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { maintenanceRoutes } from '../../../routes/maintenance';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockPrisma: any = {};

function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  app.decorate('prisma', mockPrisma);
  app.register(maintenanceRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// GET /stats
// ---------------------------------------------------------------------------

describe('GET /stats', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMaintenanceStats.mockReset();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with maintenance statistics', async () => {
    mockGetMaintenanceStats.mockResolvedValue({
      onlineUsers: 42,
      totalUsers: 1000,
      anonymousSessions: 5,
      offlineThresholdMinutes: 5,
      maintenanceActive: false,
    });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.onlineUsers).toBe(42);
    expect(body.data.totalUsers).toBe(1000);
  });

  it('returns 500 when stats is null', async () => {
    mockGetMaintenanceStats.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/stats' });
    expect(res.statusCode).toBe(500);
  });

  it('returns 500 on service error', async () => {
    mockGetMaintenanceStats.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/stats' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /cleanup
// ---------------------------------------------------------------------------

describe('POST /cleanup', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCleanupExpiredData.mockReset();
    app = buildApp();
    mockCleanupExpiredData.mockResolvedValue(undefined);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with success message after cleanup', async () => {
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/cleanup' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBeDefined();
  });

  it('calls cleanupExpiredData once', async () => {
    await app.ready();
    await app.inject({ method: 'POST', url: '/cleanup' });
    expect(mockCleanupExpiredData).toHaveBeenCalledTimes(1);
  });

  it('returns 500 on service error', async () => {
    mockCleanupExpiredData.mockRejectedValue(new Error('Cleanup failed'));
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/cleanup' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /user-status
// ---------------------------------------------------------------------------

describe('POST /user-status', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateUserOnlineStatus.mockReset();
    app = buildApp();
    mockUpdateUserOnlineStatus.mockResolvedValue(undefined);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when user set online', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/user-status',
      payload: { userId: 'user-123', isOnline: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toContain('user-123');
    expect(body.data.message).toContain('en ligne');
  });

  it('returns 200 when user set offline', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/user-status',
      payload: { userId: 'user-456', isOnline: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.message).toContain('hors ligne');
  });

  it('calls updateUserOnlineStatus with correct args', async () => {
    await app.ready();
    await app.inject({
      method: 'POST', url: '/user-status',
      payload: { userId: 'usr-xyz', isOnline: true },
    });
    expect(mockUpdateUserOnlineStatus).toHaveBeenCalledWith('usr-xyz', true);
  });

  it('returns 500 on service error', async () => {
    mockUpdateUserOnlineStatus.mockRejectedValue(new Error('User not found'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/user-status',
      payload: { userId: 'bad-id', isOnline: true },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /status-metrics
// ---------------------------------------------------------------------------

describe('GET /status-metrics', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMetrics.mockReset();
    app = buildApp();
    mockGetMetrics.mockReturnValue({
      totalRequests: 1000,
      throttledRequests: 25,
      successfulUpdates: 950,
      failedUpdates: 25,
      cacheSize: 200,
    });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with metrics', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/status-metrics' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.totalRequests).toBe(1000);
    expect(body.data.throttledRequests).toBe(25);
  });

  it('includes computed throttleRate percentage', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/status-metrics' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.throttleRate).toBe(2.5);
  });

  it('returns throttleRate of 0 when totalRequests is 0', async () => {
    mockGetMetrics.mockReturnValue({
      totalRequests: 0,
      throttledRequests: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      cacheSize: 0,
    });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/status-metrics' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.throttleRate).toBe(0);
  });

  it('returns 500 on service error', async () => {
    mockGetMetrics.mockImplementation(() => { throw new Error('metrics error'); });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/status-metrics' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /status-metrics/reset
// ---------------------------------------------------------------------------

describe('POST /status-metrics/reset', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockResetMetrics.mockReset();
    app = buildApp();
    mockResetMetrics.mockReturnValue(undefined);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with reset confirmation', async () => {
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/status-metrics/reset' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBeDefined();
  });

  it('calls resetMetrics once', async () => {
    await app.ready();
    await app.inject({ method: 'POST', url: '/status-metrics/reset' });
    expect(mockResetMetrics).toHaveBeenCalledTimes(1);
  });

  it('returns 500 on service error', async () => {
    mockResetMetrics.mockImplementation(() => { throw new Error('reset failed'); });
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/status-metrics/reset' });
    expect(res.statusCode).toBe(500);
  });
});
