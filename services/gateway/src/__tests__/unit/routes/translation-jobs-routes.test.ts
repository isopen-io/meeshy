/**
 * Route tests — translation-jobs routes
 *
 * Covers both routes via Fastify inject:
 *   GET    /translate/jobs/:jobId  - get job status
 *   DELETE /translate/jobs/:jobId  - cancel job
 *
 * Key branches:
 *   - translateService null (ZMQ unavailable) → 503
 *   - authContext.isAuthenticated false → 401
 *   - service returns { success: false } → 404 (GET) / 400 (DELETE)
 *   - service returns { success: true } → 200
 *   - service throws → 500
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ─── Module-level mock controls ───────────────────────────────────────────────

const mockGetTranslationStatus = jest.fn<any>();
const mockCancelTranslation = jest.fn<any>();

jest.mock('../../../services/AttachmentTranslateService', () => ({
  AttachmentTranslateService: jest.fn().mockImplementation(() => ({
    getTranslationStatus: (...a: unknown[]) => mockGetTranslationStatus(...a),
    cancelTranslation: (...a: unknown[]) => mockCancelTranslation(...a),
  })),
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

// authContext is mutable per-test
let testAuthContext: Record<string, unknown> = {
  isAuthenticated: true,
  isAnonymous: false,
  userId: '507f1f77bcf86cd799439011',
};

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() =>
    async (request: any, _reply: any) => {
      request.authContext = testAuthContext;
    }
  ),
  UnifiedAuthRequest: {},
}));

// Do NOT mock @meeshy/shared/types/api-schemas — use the real schema so that
// fast-json-stringify includes `error` and `code` fields in responses.

// ─── Import under test ────────────────────────────────────────────────────────

import { translationJobsRoutes } from '../../../routes/translation-jobs';

// ─── Constants ───────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const JOB_ID = 'job_abc123def456';
const AUTH = { authorization: 'Bearer valid-token' };

// ─── App builders ─────────────────────────────────────────────────────────────

async function buildApp(withZmqClient: boolean): Promise<FastifyInstance> {
  // strict: false because the real errorResponseSchema uses the `example` keyword
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {} as unknown);
  app.decorate('jobMappingCache', new Map() as unknown);
  app.decorate('translationService', {
    getZmqClient: () => withZmqClient ? { /* truthy ZMQ client stub */ } : null,
  } as unknown);
  await app.register(translationJobsRoutes);
  await app.ready();
  return app;
}

// ─── GET /translate/jobs/:jobId ───────────────────────────────────────────────

describe('GET /translate/jobs/:jobId — no ZMQ client (503)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(false); });
  afterAll(() => app.close());

  it('returns 503 when translation service is unavailable', async () => {
    const res = await app.inject({ method: 'GET', url: `/translate/jobs/${JOB_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('SERVICE_UNAVAILABLE');
  });
});

describe('GET /translate/jobs/:jobId — with ZMQ client', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildApp(true); });
  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    testAuthContext = { isAuthenticated: true, isAnonymous: false, userId: USER_ID };
  });

  it('returns 401 when authContext.isAuthenticated is false', async () => {
    testAuthContext = { isAuthenticated: false, isAnonymous: false, userId: USER_ID };
    const res = await app.inject({ method: 'GET', url: `/translate/jobs/${JOB_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 200 on success', async () => {
    mockGetTranslationStatus.mockResolvedValue({
      success: true,
      data: { jobId: JOB_ID, status: 'completed', progress: 100 },
    });
    const res = await app.inject({ method: 'GET', url: `/translate/jobs/${JOB_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 when job not found', async () => {
    mockGetTranslationStatus.mockResolvedValue({
      success: false,
      error: 'Job not found',
      errorCode: 'JOB_NOT_FOUND',
    });
    const res = await app.inject({ method: 'GET', url: `/translate/jobs/${JOB_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('JOB_NOT_FOUND');
  });

  it('returns 500 when service throws', async () => {
    mockGetTranslationStatus.mockRejectedValue(new Error('unexpected failure'));
    const res = await app.inject({ method: 'GET', url: `/translate/jobs/${JOB_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.code).toBe('STATUS_FAILED');
  });
});

// ─── DELETE /translate/jobs/:jobId ───────────────────────────────────────────

describe('DELETE /translate/jobs/:jobId — no ZMQ client (503)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(false); });
  afterAll(() => app.close());

  it('returns 503 when translation service is unavailable', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/translate/jobs/${JOB_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.code).toBe('SERVICE_UNAVAILABLE');
  });
});

describe('DELETE /translate/jobs/:jobId — with ZMQ client', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildApp(true); });
  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    testAuthContext = { isAuthenticated: true, isAnonymous: false, userId: USER_ID };
  });

  it('returns 401 when authContext.isAuthenticated is false', async () => {
    testAuthContext = { isAuthenticated: false, isAnonymous: false, userId: USER_ID };
    const res = await app.inject({ method: 'DELETE', url: `/translate/jobs/${JOB_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 on successful cancellation', async () => {
    mockCancelTranslation.mockResolvedValue({
      success: true,
      data: { jobId: JOB_ID, status: 'cancelled', message: 'Cancelled', cancelledAt: new Date().toISOString() },
    });
    const res = await app.inject({ method: 'DELETE', url: `/translate/jobs/${JOB_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 400 when cancellation fails (already completed)', async () => {
    mockCancelTranslation.mockResolvedValue({
      success: false,
      error: 'Job already completed',
      errorCode: 'JOB_NOT_CANCELLABLE',
    });
    const res = await app.inject({ method: 'DELETE', url: `/translate/jobs/${JOB_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('JOB_NOT_CANCELLABLE');
  });

  it('returns 500 when service throws', async () => {
    mockCancelTranslation.mockRejectedValue(new Error('unexpected failure'));
    const res = await app.inject({ method: 'DELETE', url: `/translate/jobs/${JOB_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.code).toBe('CANCEL_FAILED');
  });
});
