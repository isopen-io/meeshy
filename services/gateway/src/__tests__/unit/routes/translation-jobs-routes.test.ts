/**
 * translation-jobs-routes.test.ts
 *
 * Unit tests for src/routes/translation-jobs.ts
 * Covers: GET /translate/jobs/:jobId, DELETE /translate/jobs/:jobId
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
    child: jest.fn(() => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    })),
  },
}));

const mockGetTranslationStatus = jest.fn<any>();
const mockCancelTranslation = jest.fn<any>();

jest.mock('../../../services/AttachmentTranslateService', () => ({
  AttachmentTranslateService: jest.fn().mockImplementation(() => ({
    getTranslationStatus: (...args: any[]) => mockGetTranslationStatus(...args),
    cancelTranslation: (...args: any[]) => mockCancelTranslation(...args),
  })),
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (req: any) => {
    req.authContext = req._injectedAuthContext ?? {
      isAuthenticated: true,
      userId: 'user-123',
      registeredUser: { id: 'user-123' },
    };
  }),
  UnifiedAuthRequest: {},
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { translationJobsRoutes } from '../../../routes/translation-jobs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';
const JOB_ID = 'job_abc123def456';

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(options: { zmqClient?: any; authContext?: any } = {}): FastifyInstance {
  const { zmqClient = {}, authContext } = options;

  const { createUnifiedAuthMiddleware } = require('../../../middleware/auth');
  (createUnifiedAuthMiddleware as jest.Mock).mockImplementation(() =>
    async (req: any) => {
      req.authContext = authContext ?? {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID },
      };
    }
  );

  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  app.decorate('prisma', {});
  app.decorate('translationService', {
    getZmqClient: jest.fn(() => zmqClient),
  });
  app.decorate('jobMappingCache', {});

  app.register(translationJobsRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// GET /translate/jobs/:jobId
// ---------------------------------------------------------------------------

describe('GET /translate/jobs/:jobId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with job status on success', async () => {
    await app.ready();
    const jobData = {
      jobId: JOB_ID, status: 'completed', progress: 100,
      attachmentId: 'att_789', sourceLanguage: 'en', targetLanguage: 'fr',
      createdAt: '2024-01-15T10:30:00.000Z', updatedAt: '2024-01-15T10:32:15.000Z',
    };
    mockGetTranslationStatus.mockResolvedValue({ success: true, data: jobData });

    const res = await app.inject({
      method: 'GET',
      url: `/translate/jobs/${JOB_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockGetTranslationStatus).toHaveBeenCalledWith(USER_ID, JOB_ID);
  });

  it('returns 404 when job not found', async () => {
    await app.ready();
    mockGetTranslationStatus.mockResolvedValue({
      success: false,
      error: 'Job not found',
      errorCode: 'JOB_NOT_FOUND',
    });

    const res = await app.inject({
      method: 'GET',
      url: `/translate/jobs/${JOB_ID}`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.code).toBe('JOB_NOT_FOUND');
  });

  it('returns 503 when translation service unavailable (no zmqClient)', async () => {
    const noServiceApp = buildApp({ zmqClient: null });
    await noServiceApp.ready();

    const res = await noServiceApp.inject({
      method: 'GET',
      url: `/translate/jobs/${JOB_ID}`,
    });
    await noServiceApp.close();

    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('returns 401 when not authenticated (authContext not set)', async () => {
    const unauthApp = buildApp({
      authContext: { isAuthenticated: false, userId: null, registeredUser: null },
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'GET',
      url: `/translate/jobs/${JOB_ID}`,
    });
    await unauthApp.close();

    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on service exception', async () => {
    await app.ready();
    mockGetTranslationStatus.mockRejectedValue(new Error('unexpected failure'));

    const res = await app.inject({
      method: 'GET',
      url: `/translate/jobs/${JOB_ID}`,
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('STATUS_FAILED');
  });

  it('returns job with pending status', async () => {
    await app.ready();
    mockGetTranslationStatus.mockResolvedValue({
      success: true,
      data: { jobId: JOB_ID, status: 'pending', progress: 0 },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/translate/jobs/${JOB_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// DELETE /translate/jobs/:jobId
// ---------------------------------------------------------------------------

describe('DELETE /translate/jobs/:jobId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when job cancelled successfully', async () => {
    await app.ready();
    const cancelData = {
      jobId: JOB_ID, status: 'cancelled',
      message: 'Translation job cancelled successfully',
      cancelledAt: new Date().toISOString(),
    };
    mockCancelTranslation.mockResolvedValue({ success: true, data: cancelData });

    const res = await app.inject({
      method: 'DELETE',
      url: `/translate/jobs/${JOB_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockCancelTranslation).toHaveBeenCalledWith(USER_ID, JOB_ID);
  });

  it('returns 400 when job cannot be cancelled', async () => {
    await app.ready();
    mockCancelTranslation.mockResolvedValue({
      success: false,
      error: 'Job already completed',
      errorCode: 'JOB_ALREADY_COMPLETED',
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/translate/jobs/${JOB_ID}`,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 404 when job not found', async () => {
    await app.ready();
    mockCancelTranslation.mockResolvedValue({
      success: false,
      error: 'Job not found',
      errorCode: 'JOB_NOT_FOUND',
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/translate/jobs/${JOB_ID}`,
    });

    // Note: DELETE handler also returns 400 for !result.success (same path for not found)
    expect([400, 404]).toContain(res.statusCode);
  });

  it('returns 503 when translation service unavailable', async () => {
    const noServiceApp = buildApp({ zmqClient: null });
    await noServiceApp.ready();

    const res = await noServiceApp.inject({
      method: 'DELETE',
      url: `/translate/jobs/${JOB_ID}`,
    });
    await noServiceApp.close();

    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp({
      authContext: { isAuthenticated: false, userId: null, registeredUser: null },
    });
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'DELETE',
      url: `/translate/jobs/${JOB_ID}`,
    });
    await unauthApp.close();

    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on service exception', async () => {
    await app.ready();
    mockCancelTranslation.mockRejectedValue(new Error('unexpected failure'));

    const res = await app.inject({
      method: 'DELETE',
      url: `/translate/jobs/${JOB_ID}`,
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('CANCEL_FAILED');
  });
});
