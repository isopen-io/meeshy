import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Mock variables ────────────────────────────────────────────────────────────

const mockSendSuccess = jest.fn<any>((reply: any, data: any) => {
  reply._body = { success: true, data };
  reply._status = 200;
  return reply;
});
const mockSendBadRequest = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 400;
  return reply;
});
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 404;
  return reply;
});
const mockSendUnauthorized = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 401;
  return reply;
});
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = 500;
  return reply;
});
const mockSendError = jest.fn<any>((reply: any, statusCode: number, msg: any) => {
  reply._body = { success: false, error: msg };
  reply._status = statusCode;
  return reply;
});

const mockGetTranslationStatus = jest.fn<any>();
const mockCancelTranslation = jest.fn<any>();
const mockCreateUnifiedAuthMiddleware = jest.fn<any>().mockReturnValue(jest.fn<any>());

// ─── jest.mock calls ──────────────────────────────────────────────────────────

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendUnauthorized: (...args: any[]) => mockSendUnauthorized(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
  sendError: (...args: any[]) => mockSendError(...args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
  },
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (...args: any[]) => mockCreateUnifiedAuthMiddleware(...args),
}));

jest.mock('../../../services/AttachmentTranslateService', () => ({
  AttachmentTranslateService: jest.fn().mockImplementation(() => ({
    getTranslationStatus: (...args: any[]) => mockGetTranslationStatus(...args),
    cancelTranslation: (...args: any[]) => mockCancelTranslation(...args),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { translationJobsRoutes } from '../../../routes/translation-jobs';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const VALID_JOB_ID = '507f1f77bcf86cd799439099';

// ─── Factories ────────────────────────────────────────────────────────────────

type Routes = Record<string, Record<string, Function>>;

const createMockFastify = (withZmq = true) => {
  const routes: Routes = {};
  const zmqClient = withZmq ? { send: jest.fn() } : null;
  const fastify: any = {
    prisma: {},
    translationService: {
      getZmqClient: jest.fn().mockReturnValue(zmqClient),
    },
    jobMappingCache: {},
    get: jest.fn((path: string, opts: any, handler: Function) => {
      routes['GET'] = routes['GET'] || {};
      routes['GET'][path] = handler;
    }),
    delete: jest.fn((path: string, opts: any, handler: Function) => {
      routes['DELETE'] = routes['DELETE'] || {};
      routes['DELETE'][path] = handler;
    }),
    _routes: routes,
  };
  return fastify;
};

const getHandler = (fastify: any, method: string, path: string): Function => {
  const methodRoutes = fastify._routes[method] || {};
  const key = Object.keys(methodRoutes).find(k => k === path)
    ?? Object.keys(methodRoutes).find(k => k.includes(path));
  if (!key) throw new Error(`No ${method} route at '${path}'. Available: ${Object.keys(methodRoutes).join(', ')}`);
  return methodRoutes[key];
};

const makeRequest = (overrides: any = {}) => ({
  params: { jobId: VALID_JOB_ID },
  authContext: {
    isAuthenticated: true,
    isAnonymous: false,
    userId: USER_ID,
    registeredUser: { id: USER_ID },
  },
  ...overrides,
});

const makeReply = () => {
  const reply: any = { _body: null, _status: 200 };
  return reply;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('translationJobsRoutes', () => {
  let fastify: ReturnType<typeof createMockFastify>;

  beforeEach(async () => {
    fastify = createMockFastify(true);
    await translationJobsRoutes(fastify);

    jest.clearAllMocks();
    mockSendSuccess.mockImplementation((reply: any, data: any) => {
      reply._body = { success: true, data };
      reply._status = 200;
      return reply;
    });
    mockSendBadRequest.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 400;
      return reply;
    });
    mockSendNotFound.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 404;
      return reply;
    });
    mockSendUnauthorized.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 401;
      return reply;
    });
    mockSendInternalError.mockImplementation((reply: any, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = 500;
      return reply;
    });
    mockSendError.mockImplementation((reply: any, statusCode: number, msg: any) => {
      reply._body = { success: false, error: msg };
      reply._status = statusCode;
      return reply;
    });
  });

  describe('GET /translate/jobs/:jobId', () => {
    it('returns job status when service is available and job exists', async () => {
      const handler = getHandler(fastify, 'GET', '/translate/jobs/:jobId');
      mockGetTranslationStatus.mockResolvedValue({
        success: true,
        data: { jobId: VALID_JOB_ID, status: 'completed', progress: 100 },
      });

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
      expect(reply._body.data).toMatchObject({ jobId: VALID_JOB_ID, status: 'completed' });
    });

    it('returns 503 when translateService is null (no ZMQ client)', async () => {
      const noZmqFastify = createMockFastify(false);
      await translationJobsRoutes(noZmqFastify);
      const handler = getHandler(noZmqFastify, 'GET', '/translate/jobs/:jobId');

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(503);
    });

    it('returns 401 when not authenticated', async () => {
      const handler = getHandler(fastify, 'GET', '/translate/jobs/:jobId');

      const req = makeRequest({ authContext: { isAuthenticated: false } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(401);
    });

    it('returns 400 for invalid job ID format', async () => {
      const handler = getHandler(fastify, 'GET', '/translate/jobs/:jobId');

      const req = makeRequest({ params: { jobId: 'not-a-valid-object-id' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(400);
    });

    it('returns 404 when job not found', async () => {
      const handler = getHandler(fastify, 'GET', '/translate/jobs/:jobId');
      mockGetTranslationStatus.mockResolvedValue({
        success: false,
        error: 'Job not found',
        errorCode: 'JOB_NOT_FOUND',
      });

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(404);
    });

    it('returns 500 on unexpected error', async () => {
      const handler = getHandler(fastify, 'GET', '/translate/jobs/:jobId');
      mockGetTranslationStatus.mockRejectedValue(new Error('DB error'));

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(500);
    });
  });

  describe('DELETE /translate/jobs/:jobId', () => {
    it('cancels job successfully', async () => {
      const handler = getHandler(fastify, 'DELETE', '/translate/jobs/:jobId');
      mockCancelTranslation.mockResolvedValue({
        success: true,
        data: { jobId: VALID_JOB_ID, status: 'cancelled', message: 'Translation job cancelled successfully' },
      });

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(200);
      expect(reply._body.data).toMatchObject({ status: 'cancelled' });
    });

    it('returns 503 when translateService is null (no ZMQ client)', async () => {
      const noZmqFastify = createMockFastify(false);
      await translationJobsRoutes(noZmqFastify);
      const handler = getHandler(noZmqFastify, 'DELETE', '/translate/jobs/:jobId');

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(503);
    });

    it('returns 401 when not authenticated', async () => {
      const handler = getHandler(fastify, 'DELETE', '/translate/jobs/:jobId');

      const req = makeRequest({ authContext: { isAuthenticated: false } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(401);
    });

    it('returns 400 for invalid job ID format', async () => {
      const handler = getHandler(fastify, 'DELETE', '/translate/jobs/:jobId');

      const req = makeRequest({ params: { jobId: 'bad-id' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(400);
    });

    it('returns 400 when cancellation fails (job already completed)', async () => {
      const handler = getHandler(fastify, 'DELETE', '/translate/jobs/:jobId');
      mockCancelTranslation.mockResolvedValue({
        success: false,
        error: 'Job already completed',
        errorCode: 'JOB_ALREADY_COMPLETED',
      });

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(400);
    });

    it('returns 500 on unexpected error', async () => {
      const handler = getHandler(fastify, 'DELETE', '/translate/jobs/:jobId');
      mockCancelTranslation.mockRejectedValue(new Error('DB error'));

      const req = makeRequest();
      const reply = makeReply();

      await handler(req, reply);

      expect(reply._status).toBe(500);
    });
  });
});
