/**
 * L'administrateur RENVOIE la vérification d'un contact (#8289) —
 * `POST /admin/users/:userId/verification-requests`.
 *
 * Le geste réutilise les envois que le membre déclencherait lui-même (e-mail :
 * code + lien ; téléphone : SMS), sous les gardes des écritures d'un compte
 * (permission, RANG, loi du champ de vérification). La trace d'audit dit QUEL
 * canal a été relancé — jamais le code, ni le lien, ni l'adresse.
 *
 * Les témoins assertent sur l'EFFET : ce que l'envoyeur a reçu, la ligne
 * d'audit écrite, et ce que la réponse dit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

import { registerUserVerificationRequestRoutes } from '../../../../routes/admin/user-verification-requests';

const ADMIN_ID = '507f1f77bcf86cd799439011';
const CIBLE_ID = '507f1f77bcf86cd799439022';

type Row = Record<string, unknown>;

const cibleRow = (overrides: Row = {}): Row => ({
  id: CIBLE_ID,
  role: 'USER',
  email: 'cible@meeshy.me',
  phoneNumber: '+33612345678',
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  ...overrides,
});

type Sent = { ok: boolean; error?: string };

function buildDeps(options: { cible?: Row | null; envoi?: Sent } = {}) {
  const cible = options.cible === undefined ? cibleRow() : options.cible;
  const envoi = options.envoi ?? { ok: true };
  const prisma = {
    user: {
      findUnique: jest.fn(async (args: Row) => {
        const select = (args.select ?? {}) as Row;
        if (cible === null) return null;
        if (Object.keys(select).length === 1 && select.role === true) return { role: cible.role };
        return cible;
      }),
    },
  };
  const sender = {
    email: jest.fn(async (_address: string) => (envoi.ok ? { success: true } : { success: false, error: envoi.error })),
    phone: jest.fn(async (_number: string) => (envoi.ok ? { success: true } : { success: false, error: envoi.error })),
  };
  const createAuditLog = jest.fn(async (_entree: Row) => undefined);
  return { prisma, sender, createAuditLog };
}

type Deps = ReturnType<typeof buildDeps>;

async function buildApp(deps: Deps, role = 'ADMIN'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: { authContext?: unknown }) => {
    req.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID, role },
    };
  });
  app.decorate('prisma', deps.prisma as never);
  registerUserVerificationRequestRoutes(app, {
    userAuditService: { createAuditLog: deps.createAuditLog } as never,
    sender: deps.sender,
  });
  await app.ready();
  return app;
}

const post = (app: FastifyInstance, payload: Row) =>
  app.inject({ method: 'POST', url: `/admin/users/${CIBLE_ID}/verification-requests`, payload });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /admin/users/:userId/verification-requests', () => {
  it("renvoie la vérification de l'e-mail à l'adresse du membre, et trace le canal sans rien de secret", async () => {
    const deps = buildDeps();
    const app = await buildApp(deps);

    const res = await post(app, { channel: 'email', reason: 'le membre ne trouve pas le mail' });

    expect(res.statusCode).toBe(200);
    expect(deps.sender.email).toHaveBeenCalledWith('cible@meeshy.me');
    expect(deps.sender.phone).not.toHaveBeenCalled();
    expect(deps.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      userId: CIBLE_ID,
      adminId: ADMIN_ID,
      action: 'REQUEST_VERIFICATION',
      changes: { verificationRequested: { before: null, after: 'email' } },
      metadata: { reason: 'le membre ne trouve pas le mail' },
    }));
    const trace = JSON.stringify(deps.createAuditLog.mock.calls[0]?.[0]);
    expect(trace).not.toContain('cible@meeshy.me');
    expect(res.json()).toMatchObject({ success: true, data: { channel: 'email' } });
    await app.close();
  });

  it('renvoie le SMS de vérification au numéro du membre', async () => {
    const deps = buildDeps();
    const app = await buildApp(deps);

    const res = await post(app, { channel: 'phone' });

    expect(res.statusCode).toBe(200);
    expect(deps.sender.phone).toHaveBeenCalledWith('+33612345678');
    expect(deps.sender.email).not.toHaveBeenCalled();
    const trace = JSON.stringify(deps.createAuditLog.mock.calls[0]?.[0]);
    expect(trace).not.toContain('+33612345678');
    expect(res.json()).toMatchObject({ success: true, data: { channel: 'phone' } });
    await app.close();
  });

  it("refuse en 409 ALREADY_VERIFIED un contact déjà vérifié, sans rien envoyer", async () => {
    const deps = buildDeps({ cible: cibleRow({ emailVerifiedAt: new Date('2026-09-01T00:00:00Z') }) });
    const app = await buildApp(deps);

    const res = await post(app, { channel: 'email' });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, code: 'ALREADY_VERIFIED' });
    expect(deps.sender.email).not.toHaveBeenCalled();
    expect(deps.createAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it("refuse en 400 NO_CONTACT un canal que le membre n'a pas renseigné", async () => {
    const deps = buildDeps({ cible: cibleRow({ phoneNumber: null }) });
    const app = await buildApp(deps);

    const res = await post(app, { channel: 'phone' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: 'NO_CONTACT' });
    expect(deps.sender.phone).not.toHaveBeenCalled();
    await app.close();
  });

  it("rend 502 VERIFICATION_NOT_SENT quand l'envoi échoue, et ne trace aucun renvoi", async () => {
    const deps = buildDeps({ envoi: { ok: false, error: 'SMS provider down' } });
    const app = await buildApp(deps);

    const res = await post(app, { channel: 'phone' });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ success: false, code: 'VERIFICATION_NOT_SENT' });
    expect(deps.createAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un canal inconnu en 400', async () => {
    const deps = buildDeps();
    const app = await buildApp(deps);

    const res = await post(app, { channel: 'pigeon' });

    expect(res.statusCode).toBe(400);
    expect(deps.sender.email).not.toHaveBeenCalled();
    expect(deps.sender.phone).not.toHaveBeenCalled();
    await app.close();
  });

  it("refuse en 403 un acteur qui ne SURCLASSE pas sa cible, sans rien envoyer", async () => {
    const deps = buildDeps({ cible: cibleRow({ role: 'BIGBOSS' }) });
    const app = await buildApp(deps, 'ADMIN');

    const res = await post(app, { channel: 'email' });

    expect(res.statusCode).toBe(403);
    expect(deps.sender.email).not.toHaveBeenCalled();
    await app.close();
  });

  it("refuse en 403 un rôle sans droit d'écrire les vérifications", async () => {
    const deps = buildDeps();
    const app = await buildApp(deps, 'ANALYST');

    const res = await post(app, { channel: 'email' });

    expect(res.statusCode).toBe(403);
    expect(deps.sender.email).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse en 403 un membre introuvable — la hiérarchie échoue FERMÉE, sans dire « il n\'existe pas »', async () => {
    const deps = buildDeps({ cible: null });
    const app = await buildApp(deps, 'BIGBOSS');

    const res = await post(app, { channel: 'email' });

    expect(res.statusCode).toBe(403);
    expect(deps.sender.email).not.toHaveBeenCalled();
    await app.close();
  });
});
