/**
 * Unit tests for getAffiliateToken route (devices.ts)
 * Tests GET /users/:userId/affiliate-token.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { getAffiliateToken } from '../../../../routes/users/devices';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: USER_ID }),
    },
    affiliateToken: {
      findFirst: jest.fn().mockResolvedValue({ token: 'aff_token_abc123' }),
    },
  });
  app.decorate('authenticate', async () => {});

  await getAffiliateToken(app);
  await app.ready();
  return app;
}

// ─── GET /users/:userId/affiliate-token ──────────────────────────────────────

describe('GET /users/:userId/affiliate-token', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when user not found', async () => {
    (app as any).prisma.user.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/users/' + USER_ID + '/affiliate-token' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with token when user has active affiliate token', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/' + USER_ID + '/affiliate-token' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.token).toBe('aff_token_abc123');
  });

  it('returns 200 with null when user has no active affiliate token', async () => {
    (app as any).prisma.affiliateToken.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/users/' + USER_ID + '/affiliate-token' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeNull();
  });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.user.findUnique.mockRejectedValueOnce(new Error('DB error'));
    const res = await app.inject({ method: 'GET', url: '/users/' + USER_ID + '/affiliate-token' });
    expect(res.statusCode).toBe(500);
  });
});
