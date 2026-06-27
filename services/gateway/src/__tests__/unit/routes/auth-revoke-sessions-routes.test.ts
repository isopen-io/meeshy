/**
 * auth-revoke-sessions-routes.test.ts
 *
 * Unit tests for src/routes/auth/revoke-all-sessions.ts
 * Covers: GET /auth/revoke-all-sessions
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

const mockJwtVerify = jest.fn<any>();
jest.mock('jsonwebtoken', () => ({
  default: { verify: (...args: any[]) => mockJwtVerify(...args) },
  verify: (...args: any[]) => mockJwtVerify(...args),
}));

const mockInvalidateAllSessions = jest.fn<any>().mockResolvedValue(3);
jest.mock('../../../services/SessionService', () => ({
  invalidateAllSessions: (...args: any[]) => mockInvalidateAllSessions(...args),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerRevokeAllSessionsRoute } from '../../../routes/auth/revoke-all-sessions';

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', {});

  registerRevokeAllSessionsRoute({
    fastify: app,
    authService: null as any,
    phoneTransferService: null as any,
    smsService: null as any,
    cacheStore: null as any,
    redis: null,
    prisma: {},
  });

  return app;
}

// ---------------------------------------------------------------------------
// GET /auth/revoke-all-sessions
// ---------------------------------------------------------------------------

describe('GET /auth/revoke-all-sessions', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 HTML with session count on valid token', async () => {
    await app.ready();
    mockJwtVerify.mockReturnValue({ userId: 'user-123', action: 'revoke-all' });
    mockInvalidateAllSessions.mockResolvedValue(5);

    const res = await app.inject({
      method: 'GET',
      url: '/auth/revoke-all-sessions?token=valid-token',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('All sessions disconnected');
    expect(res.body).toContain('5 session(s)');
    expect(mockInvalidateAllSessions).toHaveBeenCalledWith('user-123', undefined, 'email_revoke_all');
  });

  it('returns 400 HTML when JWT verification fails', async () => {
    await app.ready();
    mockJwtVerify.mockImplementation(() => { throw new Error('jwt expired'); });

    const res = await app.inject({
      method: 'GET',
      url: '/auth/revoke-all-sessions?token=expired-token',
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('expired');
  });

  it('returns 400 HTML when action is not revoke-all', async () => {
    await app.ready();
    mockJwtVerify.mockReturnValue({ userId: 'user-123', action: 'invalid-action' });

    const res = await app.inject({
      method: 'GET',
      url: '/auth/revoke-all-sessions?token=bad-action-token',
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Invalid link');
  });

  it('returns 400 HTML when userId is missing from payload', async () => {
    await app.ready();
    mockJwtVerify.mockReturnValue({ action: 'revoke-all' });

    const res = await app.inject({
      method: 'GET',
      url: '/auth/revoke-all-sessions?token=no-userid-token',
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Invalid link');
  });

  it('returns 200 HTML with 0 sessions when no sessions exist', async () => {
    await app.ready();
    mockJwtVerify.mockReturnValue({ userId: 'user-123', action: 'revoke-all' });
    mockInvalidateAllSessions.mockResolvedValue(0);

    const res = await app.inject({
      method: 'GET',
      url: '/auth/revoke-all-sessions?token=valid-token',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('0 session(s)');
  });
});
