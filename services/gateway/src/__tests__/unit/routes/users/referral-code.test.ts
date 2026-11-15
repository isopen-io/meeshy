/**
 * Unit tests for GET /users/me/referral-code (referral-code.ts, #3690).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

jest.mock('../../../../utils/logger', () => ({
  ...(jest.requireActual('../../../../utils/logger') as object),
  logError: jest.fn(),
}));

import { getReferralCode } from '../../../../routes/users/referral-code';

const CURRENT_USER_ID = '507f1f77bcf86cd799439011';

function makePrisma(options: { referralCode?: string | null } = {}) {
  const { referralCode = null } = options;
  let stored: string | null = referralCode;
  return {
    user: {
      findUnique: jest.fn<any>().mockImplementation(async (args: any) => {
        if (args.where.id === CURRENT_USER_ID) return { id: CURRENT_USER_ID, referralCode: stored };
        if (args.where.id) return null;
        // Collision check by referralCode — always free in this harness.
        return null;
      }),
      update: jest.fn<any>().mockImplementation(async (args: any) => {
        stored = args.data.referralCode;
        return { referralCode: stored };
      }),
    },
  } as any;
}

async function buildApp(opts: { auth?: 'authenticated' | 'unauthenticated'; prisma?: any } = {}) {
  const { auth = 'authenticated', prisma = makePrisma() } = opts;
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = auth === 'authenticated'
      ? { isAuthenticated: true, registeredUser: { id: CURRENT_USER_ID, role: 'USER' }, userId: CURRENT_USER_ID }
      : { isAuthenticated: false, registeredUser: null, userId: '' };
  });
  await getReferralCode(app);
  await app.ready();
  return { app, prisma };
}

describe('GET /users/me/referral-code', () => {
  it('rejects an unauthenticated caller', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: '/users/me/referral-code' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('generates and serves a referral code on first access', async () => {
    const { app, prisma } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/users/me/referral-code' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.referralCode).toBe('string');
    expect(body.data.referralCode.startsWith('ref_')).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('serves the SAME code on a second call, without writing again', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });

    const first = await app.inject({ method: 'GET', url: '/users/me/referral-code' });
    const second = await app.inject({ method: 'GET', url: '/users/me/referral-code' });

    expect(first.json().data.referralCode).toBe(second.json().data.referralCode);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('serves the already-stored code without generating a new one', async () => {
    const prisma = makePrisma({ referralCode: 'ref_deja_la' });
    const { app } = await buildApp({ prisma });

    const res = await app.inject({ method: 'GET', url: '/users/me/referral-code' });

    expect(res.json().data.referralCode).toBe('ref_deja_la');
    expect(prisma.user.update).not.toHaveBeenCalled();
    await app.close();
  });
});
