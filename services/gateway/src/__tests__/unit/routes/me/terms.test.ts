/**
 * `GET /me/terms` et `PUT /me/terms` (#3635) — la moitié « re-consentement »
 * de la promesse CGU, montage AUTONOME (`onRequest: [fastify.authenticate]`).
 *
 * Même patron que `me/consents.test.ts` : double Prisma STATEFUL (`update`
 * change ce que `findUnique` rend ensuite), et un témoin de bout en bout
 * (accepter une version périmée refuse, accepter la bonne version fait
 * passer `upToDate` de `false` à `true`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { meTermsRoutes } from '../../../../routes/me/terms';
import { CURRENT_TERMS_VERSION } from '@meeshy/shared/types/terms';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

const USER_ID = '68a000000000000000000002';

type TermsColumns = { termsVersion: string | null; termsAcceptedAt: Date | null };

const NO_TERMS: TermsColumns = { termsVersion: null, termsAcceptedAt: null };

/** Double STATEFUL — `update()` doit changer ce que `findUnique()` rend ensuite. */
function makePrisma(initial: Partial<Record<string, TermsColumns>> = {}) {
  const store = new Map<string, TermsColumns>(
    Object.entries(initial).map(([id, cols]) => [id, { ...NO_TERMS, ...cols }])
  );

  return {
    user: {
      findUnique: jest.fn<any>().mockImplementation(async ({ where }: any) => {
        const row = store.get(where.id);
        return row ? { ...row } : null;
      }),
      update: jest.fn<any>().mockImplementation(async ({ where, data }: any) => {
        const row = store.get(where.id) ?? { ...NO_TERMS };
        const next = { ...row, ...data };
        store.set(where.id, next);
        return { ...next };
      }),
    },
  } as any;
}

async function buildApp(prisma = makePrisma({ [USER_ID]: NO_TERMS })): Promise<{
  app: FastifyInstance;
  prisma: ReturnType<typeof makePrisma>;
}> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    const userId = req.headers['x-test-user-id'] as string | undefined;
    (req as any).auth = userId ? { userId, isAuthenticated: true } : undefined;
  });
  await app.register(meTermsRoutes, { prefix: '/api/v1/me' });
  await app.ready();
  return { app, prisma };
}

function getTerms(app: FastifyInstance, userId?: string) {
  return app.inject({
    method: 'GET',
    url: '/api/v1/me/terms',
    headers: userId ? { 'x-test-user-id': userId } : {},
  });
}

function putTerms(app: FastifyInstance, payload: Record<string, unknown>, userId?: string) {
  return app.inject({
    method: 'PUT',
    url: '/api/v1/me/terms',
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-test-user-id': userId } : {}),
    },
    payload,
  });
}

describe('GET /me/terms', () => {
  it('401 sans authentification', async () => {
    const { app } = await buildApp();
    const res = await getTerms(app);
    expect(res.statusCode).toBe(401);
  });

  it('404 quand l’utilisateur authentifié n’existe plus en base', async () => {
    const { app } = await buildApp(makePrisma());
    const res = await getTerms(app, 'ghost-user');
    expect(res.statusCode).toBe(404);
  });

  it('un compte sans aucune version gravée est upToDate:false, jamais confondu avec « à jour »', async () => {
    const { app } = await buildApp();
    const res = await getTerms(app, USER_ID);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual({
      version: null,
      acceptedAt: null,
      currentVersion: CURRENT_TERMS_VERSION,
      upToDate: false,
    });
  });

  it('un compte gravé sous la version EN VIGUEUR est upToDate:true', async () => {
    const acceptedAt = new Date('2026-08-23T00:00:00.000Z');
    const { app } = await buildApp(
      makePrisma({ [USER_ID]: { termsVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: acceptedAt } })
    );

    const res = await getTerms(app, USER_ID);
    const body = JSON.parse(res.body);

    expect(body.data.upToDate).toBe(true);
    expect(body.data.version).toBe(CURRENT_TERMS_VERSION);
    expect(body.data.acceptedAt).toBe(acceptedAt.toISOString());
  });

  it('un compte gravé sous une version PÉRIMÉE est upToDate:false', async () => {
    const { app } = await buildApp(
      makePrisma({ [USER_ID]: { termsVersion: '2020-01-01', termsAcceptedAt: new Date('2020-01-01') } })
    );

    const res = await getTerms(app, USER_ID);
    const body = JSON.parse(res.body);

    expect(body.data.upToDate).toBe(false);
    expect(body.data.version).toBe('2020-01-01');
  });
});

describe('PUT /me/terms', () => {
  it('401 sans authentification', async () => {
    const { app } = await buildApp();
    const res = await putTerms(app, { version: CURRENT_TERMS_VERSION });
    expect(res.statusCode).toBe(401);
  });

  it('400 — Zod strict rejette un corps sans `version`', async () => {
    const { app } = await buildApp();
    const res = await putTerms(app, {}, USER_ID);
    expect(res.statusCode).toBe(400);
  });

  it('400 — Zod strict rejette tout champ en plus (aucune date acceptée du client)', async () => {
    const { app } = await buildApp();
    const res = await putTerms(
      app,
      { version: CURRENT_TERMS_VERSION, acceptedAt: '2020-01-01T00:00:00Z' },
      USER_ID
    );
    expect(res.statusCode).toBe(400);
  });

  it('409 quand `version` ne cite pas la version EN VIGUEUR — jamais un ré-accepte silencieux', async () => {
    const { app, prisma } = await buildApp();
    const res = await putTerms(app, { version: '1999-01-01' }, USER_ID);

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('TERMS_VERSION_MISMATCH');
    expect(body.expectedVersion).toBe(CURRENT_TERMS_VERSION);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('404 quand l’utilisateur authentifié n’existe plus en base', async () => {
    const { app } = await buildApp(makePrisma());
    const res = await putTerms(app, { version: CURRENT_TERMS_VERSION }, 'ghost-user');
    expect(res.statusCode).toBe(404);
  });

  it('la version EN VIGUEUR pose new Date() et la version, jamais une date reçue du client', async () => {
    const { app, prisma } = await buildApp();
    const before = Date.now();

    const res = await putTerms(app, { version: CURRENT_TERMS_VERSION }, USER_ID);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.upToDate).toBe(true);
    expect(body.data.version).toBe(CURRENT_TERMS_VERSION);
    expect(new Date(body.data.acceptedAt).getTime()).toBeGreaterThanOrEqual(before);

    const updateCall = prisma.user.update.mock.calls[0][0];
    expect(updateCall.data.termsAcceptedAt).toBeInstanceOf(Date);
    expect(updateCall.data.termsVersion).toBe(CURRENT_TERMS_VERSION);
  });
});

describe('Re-consentement de bout en bout', () => {
  it('un compte périmé devient upToDate après PUT, et le GET suivant le confirme', async () => {
    const { app } = await buildApp(
      makePrisma({ [USER_ID]: { termsVersion: '2020-01-01', termsAcceptedAt: new Date('2020-01-01') } })
    );

    const before = JSON.parse((await getTerms(app, USER_ID)).body);
    expect(before.data.upToDate).toBe(false);

    const putRes = await putTerms(app, { version: CURRENT_TERMS_VERSION }, USER_ID);
    expect(putRes.statusCode).toBe(200);

    const after = JSON.parse((await getTerms(app, USER_ID)).body);
    expect(after.data.upToDate).toBe(true);
    expect(after.data.version).toBe(CURRENT_TERMS_VERSION);
  });
});
