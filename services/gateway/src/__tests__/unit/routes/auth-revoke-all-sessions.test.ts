/**
 * Unit tests for auth/revoke-all-sessions.ts
 * Tests GET /auth/revoke-all-sessions
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockJwtVerify = jest.fn<any>();
jest.mock('jsonwebtoken', () => ({
  verify: (...a: any[]) => mockJwtVerify(...a),
}));

const mockInvalidateAllSessions = jest.fn<any>().mockResolvedValue(3);
jest.mock('../../../services/SessionService', () => ({
  invalidateAllSessions: (...a: any[]) => mockInvalidateAllSessions(...a),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerRevokeAllSessionsRoute } from '../../../routes/auth/revoke-all-sessions';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

// ─── Factory ─────────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const context = {
    fastify: app,
    authService: {} as any,
    redis: {} as any,
    prisma: {} as any,
    phoneTransferService: {} as any,
    smsService: {} as any,
    cacheStore: {} as any,
  };

  registerRevokeAllSessionsRoute(context);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /auth/revoke-all-sessions — invalid token', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockJwtVerify.mockImplementation(() => { throw new Error('jwt expired'); });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 HTML when token is invalid or expired', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/revoke-all-sessions?token=bad-token' });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('expired');
  });
});

describe('GET /auth/revoke-all-sessions — wrong action', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockJwtVerify.mockReturnValue({ userId: USER_ID, action: 'wrong-action' });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 HTML when payload action is not revoke-all', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/revoke-all-sessions?token=valid-token' });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Invalid link');
  });
});

describe('GET /auth/revoke-all-sessions — missing userId', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockJwtVerify.mockReturnValue({ action: 'revoke-all' }); // no userId
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 HTML when userId is missing from payload', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/revoke-all-sessions?token=valid-token' });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('text/html');
  });
});

describe('GET /auth/revoke-all-sessions — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockJwtVerify.mockReturnValue({ userId: USER_ID, action: 'revoke-all' });
    mockInvalidateAllSessions.mockResolvedValue(3);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 HTML with session count on success', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/revoke-all-sessions?token=valid-token' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('3');
    expect(res.body).toContain('session');
  });

  it('calls invalidateAllSessions with the userId from token', async () => {
    await app.inject({ method: 'GET', url: '/auth/revoke-all-sessions?token=valid-token' });
    expect(mockInvalidateAllSessions).toHaveBeenCalledWith(USER_ID, undefined, 'email_revoke_all');
  });
});

describe('GET /auth/revoke-all-sessions — missing token param', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockJwtVerify.mockReturnValue({ userId: USER_ID, action: 'revoke-all' });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 when token query param is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/revoke-all-sessions' });
    expect(res.statusCode).toBe(400);
  });
});
