/**
 * `POST /auth/verification/status` (#8083) — l'écran du code demande si
 * l'adresse a été prouvée ailleurs.
 *
 * Contrat (décision porteur « si et seulement si ») : `{ pendingSessionToken }`
 * ⇒ 200 `{ status: 'pending' | 'proven' }`. Jamais une session, jamais
 * l'adresse. Jeton inconnu ⇒ 401 `PENDING_TOKEN_INVALID` ; expiré ⇒ 410
 * `PENDING_TOKEN_EXPIRED`. Débit borné par jeton ET par IP, dimensionné pour
 * un écran qui interroge toutes les ~3 s.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';
import Fastify from 'fastify';

const mockLog = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => mockLog) },
}));

import { registerVerificationStatusRoute } from '../../../../routes/auth/verification-status';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const dans = (ms: number) => new Date(Date.now() + ms);

type Watch = { tokenHash: string; userId: string | null; expiresAt: Date; provenAt: Date | null };

const construire = async (watches: Watch[]) => {
  const findUnique = jest.fn(async (args: { where: { tokenHash: string } }) =>
    watches.find((w) => w.tokenHash === args.where.tokenHash) ?? null,
  );
  const app = Fastify({ logger: false });
  app.decorate('prisma', { emailVerificationWatch: { findUnique } });
  registerVerificationStatusRoute({ fastify: app, prisma: app.prisma, redis: null } as never);
  await app.ready();
  return app;
};

const attente = (jeton: string, extra: Partial<Watch> = {}): Watch => ({
  tokenHash: sha256(jeton),
  userId: 'user-marie',
  expiresAt: dans(15 * 60_000),
  provenAt: null,
  ...extra,
});

const lire = (app: Awaited<ReturnType<typeof construire>>, payload: unknown, ip = '203.0.113.7') =>
  app.inject({ method: 'POST', url: '/verification/status', payload: payload as object, remoteAddress: ip });

const envAvant = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.RATE_LIMIT_DISABLED;
});
afterEach(() => {
  process.env = { ...envAvant };
});

describe('l’état, et rien d’autre', () => {
  it('« pending » tant que l’adresse n’est pas prouvée', async () => {
    const app = await construire([attente('jeton-a')]);
    const res = await lire(app, { pendingSessionToken: 'jeton-a' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { status: 'pending' } });
    await app.close();
  });

  it('« proven » une fois l’adresse prouvée — sans session ni adresse dans la réponse', async () => {
    const app = await construire([attente('jeton-a', { provenAt: new Date() })]);
    const res = await lire(app, { pendingSessionToken: 'jeton-a' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { status: 'proven' } });
    expect(res.body).not.toMatch(/token|session|user|@/i);
    await app.close();
  });

  it('jeton inconnu : 401 PENDING_TOKEN_INVALID', async () => {
    const app = await construire([attente('jeton-a')]);
    const res = await lire(app, { pendingSessionToken: 'jeton-inconnu' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, code: 'PENDING_TOKEN_INVALID' });
    await app.close();
  });

  it('jeton expiré : 410 PENDING_TOKEN_EXPIRED', async () => {
    const app = await construire([attente('jeton-a', { expiresAt: dans(-1000) })]);
    const res = await lire(app, { pendingSessionToken: 'jeton-a' });

    expect(res.statusCode).toBe(410);
    expect(res.json()).toMatchObject({ success: false, code: 'PENDING_TOKEN_EXPIRED' });
    await app.close();
  });

  it('corps sans jeton : 400', async () => {
    const app = await construire([]);
    const res = await lire(app, {});

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('le jeton n’est jamais journalisé', async () => {
    const app = await construire([attente('jeton-secret-a')]);
    await lire(app, { pendingSessionToken: 'jeton-secret-a' });
    await lire(app, { pendingSessionToken: 'jeton-secret-inconnu' });

    const journal = JSON.stringify([mockLog.info.mock.calls, mockLog.warn.mock.calls, mockLog.debug.mock.calls, mockLog.error.mock.calls]);
    expect(journal).not.toContain('jeton-secret');
    await app.close();
  });
});

describe('le débit est borné, et suffit à un écran qui interroge toutes les ~3 s', () => {
  it('un écran au premier plan (20 lectures par minute) n’est jamais refusé', async () => {
    const app = await construire([attente('jeton-a')]);
    const statuts: number[] = [];
    for (let i = 0; i < 20; i += 1) statuts.push((await lire(app, { pendingSessionToken: 'jeton-a' })).statusCode);

    expect(new Set(statuts)).toEqual(new Set([200]));
    await app.close();
  });

  it('par jeton : au-delà de 40 lectures par minute, 429', async () => {
    const app = await construire([attente('jeton-a')]);
    let dernier = 0;
    for (let i = 0; i < 41; i += 1) dernier = (await lire(app, { pendingSessionToken: 'jeton-a' })).statusCode;

    expect(dernier).toBe(429);
    await app.close();
  });

  it('par IP : au-delà de 120 lectures par minute, même en tournant les jetons', async () => {
    const app = await construire([]);
    let dernier = 0;
    for (let i = 0; i < 121; i += 1) dernier = (await lire(app, { pendingSessionToken: `essai-${i}` })).statusCode;

    expect(dernier).toBe(429);
    await app.close();
  });
});
