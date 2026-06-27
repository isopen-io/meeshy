/**
 * affiliate-routes.test.ts
 *
 * Unit tests for src/routes/affiliate.ts
 * Covers:
 *   - POST   /affiliate/tokens
 *   - GET    /affiliate/tokens
 *   - GET    /affiliate/stats
 *   - GET    /affiliate/validate/:token
 *   - POST   /affiliate/track-visit
 *   - POST   /affiliate/register
 *   - POST   /affiliate/click/:token
 *   - DELETE /affiliate/tokens/:id
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  affiliateTokenSchema:    { type: 'object', additionalProperties: true },
  affiliateRelationSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema:     { type: 'object', additionalProperties: true },
}));

jest.mock('../../../middleware/auth', () => ({ UnifiedAuthRequest: {} }));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info:  jest.fn(),
      warn:  jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

const mockGetAffiliateStats    = jest.fn<any>();
const mockTrackAffiliateVisit  = jest.fn<any>();
const mockConvertAffiliateVisit = jest.fn<any>();

jest.mock('../../../services/AffiliateTrackingService', () => ({
  AffiliateTrackingService: {
    getAffiliateStats:     (...args: any[]) => mockGetAffiliateStats(...args),
    trackAffiliateVisit:   (...args: any[]) => mockTrackAffiliateVisit(...args),
    convertAffiliateVisit: (...args: any[]) => mockConvertAffiliateVisit(...args),
  },
}));

// ---------------------------------------------------------------------------
// Import routes under test (after mocks)
// ---------------------------------------------------------------------------

import affiliateRoutes from '../../../routes/affiliate';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID    = '507f1f77bcf86cd799439011';
const TOKEN_ID   = '507f1f77bcf86cd799439022';
const TOKEN_CODE = 'aff_test_token_123';

// ---------------------------------------------------------------------------
// Prisma mocks
// ---------------------------------------------------------------------------

const mockAffiliateTokenCreate     = jest.fn<any>();
const mockAffiliateTokenFindUnique = jest.fn<any>();
const mockAffiliateTokenFindFirst  = jest.fn<any>();
const mockAffiliateTokenFindMany   = jest.fn<any>();
const mockAffiliateTokenCount      = jest.fn<any>();
const mockAffiliateTokenUpdate     = jest.fn<any>();
const mockAffiliateTokenDelete     = jest.fn<any>();
const mockAffiliateRelationCount   = jest.fn<any>();

const mockPrisma: any = {
  affiliateToken: {
    create:     (...args: any[]) => mockAffiliateTokenCreate(...args),
    findUnique: (...args: any[]) => mockAffiliateTokenFindUnique(...args),
    findFirst:  (...args: any[]) => mockAffiliateTokenFindFirst(...args),
    findMany:   (...args: any[]) => mockAffiliateTokenFindMany(...args),
    count:      (...args: any[]) => mockAffiliateTokenCount(...args),
    update:     (...args: any[]) => mockAffiliateTokenUpdate(...args),
    delete:     (...args: any[]) => mockAffiliateTokenDelete(...args),
  },
  affiliateRelation: {
    count: (...args: any[]) => mockAffiliateRelationCount(...args),
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToken(overrides: any = {}): any {
  return {
    id: TOKEN_ID,
    token: TOKEN_CODE,
    name: 'Test Campaign',
    createdBy: USER_ID,
    maxUses: null,
    currentUses: 0,
    clickCount: 0,
    isActive: true,
    expiresAt: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    creator: {
      id: USER_ID, username: 'testuser', firstName: 'Test', lastName: 'User',
      displayName: 'Test User', avatar: null,
    },
    _count: { affiliations: 0 },
    ...overrides,
  };
}

function buildApp(authOverrides: { isAuthenticated?: boolean; registeredUser?: any } = {}): FastifyInstance {
  const authContext = {
    isAuthenticated: authOverrides.isAuthenticated ?? true,
    userId: USER_ID,
    registeredUser: authOverrides.registeredUser !== undefined
      ? authOverrides.registeredUser
      : { id: USER_ID },
  };

  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });

  app.decorate('authenticate', async (req: any) => {
    req.authContext = authContext;
  });
  app.decorate('prisma', mockPrisma);
  app.register(affiliateRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// POST /affiliate/tokens
// ---------------------------------------------------------------------------

describe('POST /affiliate/tokens', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAffiliateTokenCreate.mockReset();
    app = buildApp();
    mockAffiliateTokenCreate.mockResolvedValue(makeToken());
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful token creation', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/affiliate/tokens',
      payload: { name: 'Test Campaign' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.token).toBeDefined();
  });

  it('calls affiliateToken.create with createdBy userId', async () => {
    await app.ready();
    await app.inject({
      method: 'POST', url: '/affiliate/tokens',
      payload: { name: 'Test Campaign' },
    });
    expect(mockAffiliateTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Test Campaign', createdBy: USER_ID }),
      })
    );
  });

  it('returns 401 when not authenticated', async () => {
    const unauthed = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthed.ready();
    const res = await unauthed.inject({
      method: 'POST', url: '/affiliate/tokens',
      payload: { name: 'Test Campaign' },
    });
    await unauthed.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on DB error', async () => {
    mockAffiliateTokenCreate.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/affiliate/tokens',
      payload: { name: 'Test Campaign' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /affiliate/tokens
// ---------------------------------------------------------------------------

describe('GET /affiliate/tokens', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAffiliateTokenFindMany.mockReset();
    mockAffiliateTokenCount.mockReset();
    app = buildApp();
    mockAffiliateTokenFindMany.mockResolvedValue([makeToken()]);
    mockAffiliateTokenCount.mockResolvedValue(1);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with token list', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/affiliate/tokens' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthed = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthed.ready();
    const res = await unauthed.inject({ method: 'GET', url: '/affiliate/tokens' });
    await unauthed.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on DB error', async () => {
    mockAffiliateTokenFindMany.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/affiliate/tokens' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /affiliate/stats
// ---------------------------------------------------------------------------

describe('GET /affiliate/stats', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAffiliateStats.mockReset();
    app = buildApp();
    mockGetAffiliateStats.mockResolvedValue({ success: true, data: { total: 5, conversions: 2 } });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with stats data', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/affiliate/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('returns 401 when not authenticated', async () => {
    const unauthed = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthed.ready();
    const res = await unauthed.inject({ method: 'GET', url: '/affiliate/stats' });
    await unauthed.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when service returns error', async () => {
    mockGetAffiliateStats.mockResolvedValue({ success: false, error: 'Invalid filter' });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/affiliate/stats' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on service throw', async () => {
    mockGetAffiliateStats.mockRejectedValue(new Error('Service error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/affiliate/stats' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /affiliate/validate/:token
// ---------------------------------------------------------------------------

describe('GET /affiliate/validate/:token', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAffiliateTokenFindUnique.mockReset();
    app = buildApp();
    mockAffiliateTokenFindUnique.mockResolvedValue(makeToken());
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with isValid=true for valid token', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/affiliate/validate/${TOKEN_CODE}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.isValid).toBe(true);
    expect(body.data.token).toBeDefined();
    expect(body.data.affiliateUser).toBeDefined();
  });

  it('returns isValid=false for unknown token', async () => {
    mockAffiliateTokenFindUnique.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/affiliate/validate/unknown_token' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.isValid).toBe(false);
  });

  it('returns isValid=false for inactive token', async () => {
    mockAffiliateTokenFindUnique.mockResolvedValue(makeToken({ isActive: false }));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/affiliate/validate/${TOKEN_CODE}` });
    const body = JSON.parse(res.body);
    expect(body.data.isValid).toBe(false);
  });

  it('returns isValid=false for expired token', async () => {
    mockAffiliateTokenFindUnique.mockResolvedValue(
      makeToken({ expiresAt: new Date('2020-01-01') })
    );
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/affiliate/validate/${TOKEN_CODE}` });
    const body = JSON.parse(res.body);
    expect(body.data.isValid).toBe(false);
  });

  it('returns isValid=false when maxUses reached', async () => {
    mockAffiliateTokenFindUnique.mockResolvedValue(makeToken({ maxUses: 5, currentUses: 5 }));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/affiliate/validate/${TOKEN_CODE}` });
    const body = JSON.parse(res.body);
    expect(body.data.isValid).toBe(false);
  });

  it('returns 500 on DB error', async () => {
    mockAffiliateTokenFindUnique.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/affiliate/validate/${TOKEN_CODE}` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /affiliate/track-visit
// ---------------------------------------------------------------------------

describe('POST /affiliate/track-visit', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackAffiliateVisit.mockReset();
    app = buildApp();
    mockTrackAffiliateVisit.mockResolvedValue({ success: true, data: { sessionKey: 'session-key-abc' } });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with session key on success', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/affiliate/track-visit',
      payload: { token: TOKEN_CODE },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.sessionKey).toBe('session-key-abc');
  });

  it('returns 400 when service rejects', async () => {
    mockTrackAffiliateVisit.mockResolvedValue({ success: false, error: 'Invalid token' });
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/affiliate/track-visit',
      payload: { token: 'bad_token' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on service throw', async () => {
    mockTrackAffiliateVisit.mockRejectedValue(new Error('Service error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/affiliate/track-visit',
      payload: { token: TOKEN_CODE },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /affiliate/register
// ---------------------------------------------------------------------------

describe('POST /affiliate/register', () => {
  let app: FastifyInstance;
  const REFERRED_USER = '507f1f77bcf86cd799439044';

  beforeEach(() => {
    jest.clearAllMocks();
    mockConvertAffiliateVisit.mockReset();
    app = buildApp();
    mockConvertAffiliateVisit.mockResolvedValue({ success: true, data: { id: 'relation-1' } });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful registration', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/affiliate/register',
      payload: { token: TOKEN_CODE, referredUserId: REFERRED_USER },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 400 when service rejects', async () => {
    mockConvertAffiliateVisit.mockResolvedValue({ success: false, error: 'Token expired' });
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/affiliate/register',
      payload: { token: TOKEN_CODE, referredUserId: REFERRED_USER },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on service throw', async () => {
    mockConvertAffiliateVisit.mockRejectedValue(new Error('Service error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/affiliate/register',
      payload: { token: TOKEN_CODE, referredUserId: REFERRED_USER },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /affiliate/click/:token
// ---------------------------------------------------------------------------

describe('POST /affiliate/click/:token', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAffiliateTokenFindFirst.mockReset();
    mockAffiliateTokenUpdate.mockReset();
    app = buildApp();
    mockAffiliateTokenFindFirst.mockResolvedValue(makeToken());
    mockAffiliateTokenUpdate.mockResolvedValue(makeToken({ clickCount: 1 }));
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with tracked=true on success', async () => {
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/affiliate/click/${TOKEN_CODE}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.tracked).toBe(true);
  });

  it('increments clickCount', async () => {
    await app.ready();
    await app.inject({ method: 'POST', url: `/affiliate/click/${TOKEN_CODE}` });
    expect(mockAffiliateTokenUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { clickCount: { increment: 1 } },
      })
    );
  });

  it('returns 404 when token not found or inactive', async () => {
    mockAffiliateTokenFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/affiliate/click/unknown_token' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on DB error', async () => {
    mockAffiliateTokenUpdate.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/affiliate/click/${TOKEN_CODE}` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /affiliate/tokens/:id
// ---------------------------------------------------------------------------

describe('DELETE /affiliate/tokens/:id', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAffiliateTokenFindFirst.mockReset();
    mockAffiliateTokenDelete.mockReset();
    app = buildApp();
    mockAffiliateTokenFindFirst.mockResolvedValue(makeToken());
    mockAffiliateTokenDelete.mockResolvedValue(makeToken());
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful deletion', async () => {
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/affiliate/tokens/${TOKEN_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthed = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthed.ready();
    const res = await unauthed.inject({ method: 'DELETE', url: `/affiliate/tokens/${TOKEN_ID}` });
    await unauthed.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when token not found or not owned by user', async () => {
    mockAffiliateTokenFindFirst.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/affiliate/tokens/${TOKEN_ID}` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on DB error', async () => {
    mockAffiliateTokenDelete.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/affiliate/tokens/${TOKEN_ID}` });
    expect(res.statusCode).toBe(500);
  });
});
