/**
 * #10864 — la vérification d'un jeton de réinitialisation est bornée en débit,
 * par ADRESSE (énumération de jetons depuis une machine) et par JETON (un même
 * jeton sondé depuis une flotte d'adresses), sur le GET historique comme sur le
 * POST du lot #10859, qui partagent leurs seaux.
 *
 * Les limiteurs sont RÉELS (magasin mémoire, `redis` nul) : le témoin mesure le
 * 429 que la route rend, pas l'appel d'un mock.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../services/CacheStore', () => ({ getCacheStore: jest.fn(() => ({})) }));
jest.mock('../../../services/EmailService', () => ({ EmailService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/SmsService', () => ({ SmsService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/GeoIPService', () => ({ GeoIPService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/PasswordResetService', () => ({
  PasswordResetService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/PhonePasswordResetService', () => ({
  PhonePasswordResetService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../utils/logger-enhanced', () => {
  const child = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
  return { enhancedLogger: { ...child, child: () => child } };
});

import { createHash } from 'crypto';
import type { FastifyRequest } from 'fastify';
import { passwordResetRoutes } from '../../../routes/password-reset';
import { createResetTokenVerifyTokenRateLimiter } from '../../../utils/rate-limiter';

const PER_TOKEN_MAX = 10;
const PER_IP_MAX = 20;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', { passwordResetToken: { findUnique: jest.fn<any>().mockResolvedValue(null) } });
  app.decorate('redis', null);
  await passwordResetRoutes(app);
  await app.ready();
  return app;
}

function postVerify(app: FastifyInstance, params: { token: string; ip: string }) {
  return app.inject({
    method: 'POST',
    url: '/reset-password/verify-token',
    payload: { token: params.token },
    remoteAddress: params.ip,
  });
}

function getVerify(app: FastifyInstance, params: { token: string; ip: string }) {
  return app.inject({
    method: 'GET',
    url: `/reset-password/verify-token?token=${encodeURIComponent(params.token)}`,
    remoteAddress: params.ip,
  });
}

const ipNumber = (n: number) => `198.51.100.${n}`;

describe('POST /reset-password/verify-token — plafond par adresse (#10864)', () => {
  it(`laisse passer ${PER_IP_MAX} jetons distincts d'une même adresse, puis rend 429`, async () => {
    const app = await buildApp();
    const statuses = [];
    for (let i = 0; i < PER_IP_MAX; i++) {
      statuses.push((await postVerify(app, { token: `guess-${i}`, ip: '203.0.113.7' })).statusCode);
    }
    expect(statuses.every((s) => s === 200)).toBe(true);
    const blocked = await postVerify(app, { token: 'guess-last', ip: '203.0.113.7' });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ success: false, error: 'RATE_LIMIT_EXCEEDED' });
    const otherIp = await postVerify(app, { token: 'guess-last', ip: '203.0.113.8' });
    expect(otherIp.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /reset-password/verify-token — plafond par jeton (#10864)', () => {
  it(`borne un même jeton sondé depuis ${PER_TOKEN_MAX + 1} adresses`, async () => {
    const app = await buildApp();
    const statuses = [];
    for (let i = 0; i < PER_TOKEN_MAX; i++) {
      statuses.push((await postVerify(app, { token: 'one-token', ip: ipNumber(i + 1) })).statusCode);
    }
    expect(statuses.every((s) => s === 200)).toBe(true);
    const blocked = await postVerify(app, { token: 'one-token', ip: ipNumber(200) });
    expect(blocked.statusCode).toBe(429);
    const otherToken = await postVerify(app, { token: 'another-token', ip: ipNumber(201) });
    expect(otherToken.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /reset-password/verify-token — même régime, mêmes seaux que le POST (#10864)', () => {
  it('le GET historique compte dans le seau de son adresse, partagé avec le POST', async () => {
    const app = await buildApp();
    for (let i = 0; i < PER_IP_MAX; i++) {
      await postVerify(app, { token: `guess-${i}`, ip: '203.0.113.9' });
    }
    const viaGet = await getVerify(app, { token: 'guess-get', ip: '203.0.113.9' });
    expect(viaGet.statusCode).toBe(429);
    await app.close();
  });

  it('le GET historique compte dans le seau du jeton, partagé avec le POST', async () => {
    const app = await buildApp();
    for (let i = 0; i < PER_TOKEN_MAX; i++) {
      await getVerify(app, { token: 'shared-token', ip: ipNumber(i + 1) });
    }
    const viaPost = await postVerify(app, { token: 'shared-token', ip: ipNumber(150) });
    expect(viaPost.statusCode).toBe(429);
    await app.close();
  });
});

describe('clé du seau par jeton — le magasin de compteurs ne garde rien qui ouvre un compte (#10864)', () => {
  it('ni le jeton ni le tokenHash indexé en base ne figurent dans la clé, corps et requête donnent la même', () => {
    const token = 'a-very-secret-reset-token';
    const limiter = createResetTokenVerifyTokenRateLimiter();
    const viaBody = limiter.keyFor({ ip: '203.0.113.1', body: { token } } as unknown as FastifyRequest);
    const viaQuery = limiter.keyFor({ ip: '203.0.113.2', query: { token } } as unknown as FastifyRequest);
    const dbHash = createHash('sha256').update(token).digest('hex');
    expect(viaBody).toBe(viaQuery);
    expect(viaBody).not.toContain(token);
    expect(viaBody).not.toContain(dbHash);
  });
});
