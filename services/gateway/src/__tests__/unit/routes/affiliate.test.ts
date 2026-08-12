/**
 * Unit tests for affiliate routes (affiliate.ts)
 * Tests all 8 endpoints: tokens CRUD, stats, validate, track-visit, register, click.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn() }) },
}));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((s: string) => s) },
}));

jest.mock('../../../utils/pagination', () => ({
  validatePagination: jest.fn((offset: any, limit: any) => ({
    offset: Number(offset) || 0,
    limit: Number(limit) || 50,
  })),
}));

const mockGetStats = jest.fn().mockResolvedValue({ success: true, data: { total: 3 } });
const mockTrackVisit = jest.fn().mockResolvedValue({ success: true, data: { sessionKey: 'sk_abc' } });
const mockConvertVisit = jest.fn().mockResolvedValue({ success: true, data: { id: 'rel_1' } });

jest.mock('../../../services/AffiliateTrackingService', () => ({
  AffiliateTrackingService: {
    getAffiliateStats: (...args: any[]) => mockGetStats(...args),
    trackAffiliateVisit: (...args: any[]) => mockTrackVisit(...args),
    convertAffiliateVisit: (...args: any[]) => mockConvertVisit(...args),
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  affiliateTokenSchema: { type: 'object', additionalProperties: true },
  affiliateRelationSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema: { type: 'object', properties: {} },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import affiliateRoutes from '../../../routes/affiliate';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc123';
const TOKEN_ID = '507f1f77bcf86cd799439011';
const TOKEN_CODE = 'aff_1234567890_abc';

const mockAuthContext = {
  type: 'registered' as const,
  isAuthenticated: true,
  userId: USER_ID,
  hasFullAccess: true,
  registeredUser: {
    id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith',
    displayName: 'Alice Smith', avatar: null, role: 'USER',
  },
};

const mockAffiliateToken = {
  id: TOKEN_ID,
  token: TOKEN_CODE,
  name: 'My Token',
  createdBy: USER_ID,
  maxUses: null,
  currentUses: 0,
  isActive: true,
  clickCount: 0,
  expiresAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  creator: {
    id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith',
    displayName: 'Alice Smith', avatar: null,
  },
  _count: { affiliations: 2 },
};

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (req: any) => {
    req.authContext = mockAuthContext;
  });

  app.decorate('prisma', {
    affiliateToken: {
      create: jest.fn().mockResolvedValue(mockAffiliateToken),
      findMany: jest.fn().mockResolvedValue([mockAffiliateToken]),
      count: jest.fn().mockResolvedValue(1),
      findUnique: jest.fn().mockResolvedValue(mockAffiliateToken),
      findFirst: jest.fn().mockResolvedValue(mockAffiliateToken),
      update: jest.fn().mockResolvedValue(mockAffiliateToken),
      delete: jest.fn().mockResolvedValue(mockAffiliateToken),
    },
    affiliateRelation: {
      count: jest.fn().mockResolvedValue(0),
    },
  });

  await affiliateRoutes(app);
  await app.ready();
  return app;
}

// ─── POST /affiliate/tokens ───────────────────────────────────────────────────

describe('POST /affiliate/tokens', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful token creation', async () => {
    const res = await app.inject({
      method: 'POST', url: '/affiliate/tokens',
      payload: { name: 'My Campaign' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.affiliateToken.create.mockRejectedValueOnce(new Error('DB'));
    const res = await app.inject({
      method: 'POST', url: '/affiliate/tokens',
      payload: { name: 'My Campaign' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /affiliate/tokens ────────────────────────────────────────────────────

describe('GET /affiliate/tokens', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with paginated tokens', async () => {
    const res = await app.inject({ method: 'GET', url: '/affiliate/tokens' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.affiliateToken.findMany.mockRejectedValueOnce(new Error('DB'));
    const res = await app.inject({ method: 'GET', url: '/affiliate/tokens' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /affiliate/stats ─────────────────────────────────────────────────────

describe('GET /affiliate/stats', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/affiliate/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 400 when service returns error', async () => {
    mockGetStats.mockResolvedValueOnce({ success: false, error: 'Invalid filter' });
    const res = await app.inject({ method: 'GET', url: '/affiliate/stats' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on unexpected error', async () => {
    mockGetStats.mockRejectedValueOnce(new Error('boom'));
    const res = await app.inject({ method: 'GET', url: '/affiliate/stats' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /affiliate/validate/:token ──────────────────────────────────────────

describe('GET /affiliate/validate/:token', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with isValid=false when token not found', async () => {
    (app as any).prisma.affiliateToken.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/affiliate/validate/bad_token' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.isValid).toBe(false);
  });

  it('returns 200 with isValid=false when token inactive', async () => {
    (app as any).prisma.affiliateToken.findUnique.mockResolvedValueOnce({ ...mockAffiliateToken, isActive: false });
    const res = await app.inject({ method: 'GET', url: '/affiliate/validate/' + TOKEN_CODE });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.isValid).toBe(false);
  });

  it('returns 200 with isValid=false when token expired', async () => {
    (app as any).prisma.affiliateToken.findUnique.mockResolvedValueOnce({
      ...mockAffiliateToken, expiresAt: new Date(0),
    });
    const res = await app.inject({ method: 'GET', url: '/affiliate/validate/' + TOKEN_CODE });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.isValid).toBe(false);
  });

  it('returns 200 with isValid=false when max uses exceeded', async () => {
    (app as any).prisma.affiliateToken.findUnique.mockResolvedValueOnce({
      ...mockAffiliateToken, maxUses: 5, currentUses: 5,
    });
    const res = await app.inject({ method: 'GET', url: '/affiliate/validate/' + TOKEN_CODE });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.isValid).toBe(false);
  });

  it('returns 200 with isValid=true for valid token', async () => {
    const res = await app.inject({ method: 'GET', url: '/affiliate/validate/' + TOKEN_CODE });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.isValid).toBe(true);
  });
});

// ─── POST /affiliate/track-visit ─────────────────────────────────────────────

describe('POST /affiliate/track-visit', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with sessionKey on success', async () => {
    const res = await app.inject({
      method: 'POST', url: '/affiliate/track-visit',
      payload: { token: TOKEN_CODE },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.sessionKey).toBe('sk_abc');
  });

  it('returns 400 when service returns error', async () => {
    mockTrackVisit.mockResolvedValueOnce({ success: false, error: 'Token not found' });
    const res = await app.inject({
      method: 'POST', url: '/affiliate/track-visit',
      payload: { token: 'bad_token' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on unexpected error', async () => {
    mockTrackVisit.mockRejectedValueOnce(new Error('boom'));
    const res = await app.inject({
      method: 'POST', url: '/affiliate/track-visit',
      payload: { token: TOKEN_CODE },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── POST /affiliate/register ─────────────────────────────────────────────────

describe('POST /affiliate/register', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful referral registration', async () => {
    const res = await app.inject({
      method: 'POST', url: '/affiliate/register',
      payload: { token: TOKEN_CODE, referredUserId: 'new_user_id' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 400 when conversion fails', async () => {
    mockConvertVisit.mockResolvedValueOnce({ success: false, error: 'Token invalid' });
    const res = await app.inject({
      method: 'POST', url: '/affiliate/register',
      payload: { token: 'bad', referredUserId: 'uid' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /affiliate/click/:token ─────────────────────────────────────────────

describe('POST /affiliate/click/:token', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when token not found', async () => {
    (app as any).prisma.affiliateToken.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: '/affiliate/click/bad_token' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 on successful click tracking', async () => {
    const res = await app.inject({ method: 'POST', url: '/affiliate/click/' + TOKEN_CODE });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.tracked).toBe(true);
  });
});

// ─── DELETE /affiliate/tokens/:id ────────────────────────────────────────────

describe('DELETE /affiliate/tokens/:id', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when token not found or not owned', async () => {
    (app as any).prisma.affiliateToken.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/affiliate/tokens/' + TOKEN_ID });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 on successful deletion', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/affiliate/tokens/' + TOKEN_ID });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});
