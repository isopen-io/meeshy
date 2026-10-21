/**
 * #10866 — `POST /auth/reset-password` est borné en débit par ADRESSE et par
 * JETON, dans les MÊMES seaux que la vérification du jeton (#10864) : sonder un
 * jeton et le soumettre puisent dans un seul quota. Et chaque refus de l'envoi
 * sert son `code` à côté du texte historique.
 *
 * Les limiteurs sont RÉELS (magasin mémoire, `redis` nul) : le témoin mesure le
 * 429 que la route rend, pas l'appel d'un mock.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

const completePasswordReset = jest.fn<any>();

jest.mock('../../../services/CacheStore', () => ({ getCacheStore: jest.fn(() => ({})) }));
jest.mock('../../../services/EmailService', () => ({ EmailService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/SmsService', () => ({ SmsService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/GeoIPService', () => ({ GeoIPService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/PasswordResetService', () => ({
  PasswordResetService: jest.fn().mockImplementation(() => ({ completePasswordReset })),
}));
jest.mock('../../../services/PhonePasswordResetService', () => ({
  PhonePasswordResetService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../utils/logger-enhanced', () => {
  const child = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
  return { enhancedLogger: { ...child, child: () => child } };
});

import { passwordResetRoutes } from '../../../routes/password-reset';

const PER_TOKEN_MAX = 10;
const PER_IP_MAX = 20;
const PASSWORD = 'Kx7#pQ2!vL9@zR4$wN6%';

async function buildApp(): Promise<FastifyInstance> {
  completePasswordReset.mockReset();
  completePasswordReset.mockResolvedValue({ success: false, error: 'Invalid 2FA code', code: 'TWO_FACTOR_INVALID' });
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', { passwordResetToken: { findUnique: jest.fn<any>().mockResolvedValue(null) } });
  app.decorate('redis', null);
  await passwordResetRoutes(app);
  await app.ready();
  return app;
}

function submit(app: FastifyInstance, params: { token: string; ip: string }) {
  return app.inject({
    method: 'POST',
    url: '/reset-password',
    payload: { token: params.token, newPassword: PASSWORD, confirmPassword: PASSWORD, twoFactorCode: '123456' },
    remoteAddress: params.ip,
  });
}

function verify(app: FastifyInstance, params: { token: string; ip: string }) {
  return app.inject({
    method: 'POST',
    url: '/reset-password/verify-token',
    payload: { token: params.token },
    remoteAddress: params.ip,
  });
}

const ipNumber = (n: number) => `198.51.100.${n}`;

describe('POST /reset-password — plafond par jeton (#10866)', () => {
  it(`un même jeton soumis depuis ${PER_TOKEN_MAX + 1} adresses rend 429, sans atteindre le service`, async () => {
    const app = await buildApp();
    const statuses = [];
    for (let i = 0; i < PER_TOKEN_MAX; i++) {
      statuses.push((await submit(app, { token: 'stolen-token', ip: ipNumber(i + 1) })).statusCode);
    }
    expect(statuses.every((s) => s === 400)).toBe(true);

    const blocked = await submit(app, { token: 'stolen-token', ip: ipNumber(200) });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ success: false, error: 'RATE_LIMIT_EXCEEDED' });
    expect(completePasswordReset).toHaveBeenCalledTimes(PER_TOKEN_MAX);
    await app.close();
  });

  it('le seau du jeton est PARTAGÉ avec sa vérification', async () => {
    const app = await buildApp();
    for (let i = 0; i < PER_TOKEN_MAX; i++) {
      await verify(app, { token: 'shared-token', ip: ipNumber(i + 1) });
    }
    expect((await submit(app, { token: 'shared-token', ip: ipNumber(150) })).statusCode).toBe(429);
    await app.close();
  });
});

describe('POST /reset-password — plafond par adresse (#10866)', () => {
  it(`${PER_IP_MAX} envois d'une adresse, puis 429 ; partagé avec la vérification`, async () => {
    const app = await buildApp();
    for (let i = 0; i < PER_IP_MAX - 1; i++) {
      await submit(app, { token: `guess-${i}`, ip: '203.0.113.21' });
    }
    expect((await verify(app, { token: 'guess-v', ip: '203.0.113.21' })).statusCode).toBe(200);
    expect((await submit(app, { token: 'guess-last', ip: '203.0.113.21' })).statusCode).toBe(429);
    expect((await submit(app, { token: 'guess-last', ip: '203.0.113.22' })).statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /reset-password — un refus sert son code (#10866)', () => {
  it('le 400 porte `code` à côté du texte historique', async () => {
    const app = await buildApp();
    const res = await submit(app, { token: 'one', ip: '203.0.113.30' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: 'Invalid 2FA code', code: 'TWO_FACTOR_INVALID' });
    await app.close();
  });
});

describe('POST /reset-password — une panne n’est pas un 400 (#10866)', () => {
  it('RESET_UNAVAILABLE part en 503 avec son code, jamais lu « lien invalide »', async () => {
    const app = await buildApp();
    completePasswordReset.mockResolvedValue({
      success: false,
      error: 'An error occurred while resetting your password. Please try again.',
      code: 'RESET_UNAVAILABLE',
    });
    const res = await submit(app, { token: 'one', ip: '203.0.113.31' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ success: false, code: 'RESET_UNAVAILABLE' });
    await app.close();
  });
});
