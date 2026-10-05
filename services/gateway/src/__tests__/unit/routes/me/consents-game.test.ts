/**
 * LE CONSENTEMENT À LA LIGUE PUBLIQUE PAR LA PORTE CANONIQUE (#9384, conformité
 * A-1, A-14) — `PUT /me/consents/public-league` écrit la MÊME colonne que
 * `POST /me/game/league/consent`, par le même service ; il est visible dans
 * `GET /me/consents` À CÔTÉ des cinq historiques (jamais dedans : un ancien
 * client décode `purpose` en énumération fermée).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { CONSENT_PURPOSES, CONSENT_POLICY_VERSION, meConsentsRoutes } from '../../../../routes/me/consents';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from '../../../../services/game/__tests__/fakeGameDb';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../services/preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: async (_prisma: unknown, ids: string[]) => new Map(ids.map((id) => [id, {}])),
}));

const ELIGIBLE = { engagementScore: 4000, levelRecord: 20, birthDate: new Date('1990-01-01T00:00:00Z') };

async function buildApp(db: FakeGameDb): Promise<FastifyInstance> {
  const prisma = db.prisma as unknown as Record<string, unknown>;
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', { ...prisma, userPreferences: { findUnique: async () => null } } as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER, isAuthenticated: true };
  });
  await app.register(meConsentsRoutes, { prefix: '/api/v1/me' });
  await app.ready();
  return app;
}

const put = (app: FastifyInstance, granted: boolean, policyVersion = CONSENT_POLICY_VERSION) =>
  app.inject({ method: 'PUT', url: '/api/v1/me/consents/public-league', payload: { granted, policyVersion } });

describe('PUT /me/consents/public-league', () => {
  it('accorde : daté par le serveur, la colonne unique, la version de la notice, data-processing en cascade', async () => {
    const db = fakeGameDb();
    seedUser(db, ELIGIBLE);
    const app = await buildApp(db);

    const res = await put(app, true);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ purpose: 'public-league', granted: true });
    expect(typeof res.json().data.grantedAt).toBe('string');
    expect(db.user.rows[0]).toMatchObject({ publicLeagueConsentVersion: CONSENT_POLICY_VERSION });
    expect(db.user.rows[0]!.publicLeagueConsentAt).toBeInstanceOf(Date);
    expect(db.user.rows[0]!.dataProcessingConsentAt).toBeInstanceOf(Date);
    expect(db.leaguePseudonym.rows).toHaveLength(1);
    await app.close();
  });

  it('409 LEAGUE_LOCKED sous le niveau 10, LEAGUE_MINOR sans majorité vérifiée — rien n’est écrit', async () => {
    const low = fakeGameDb();
    seedUser(low, { ...ELIGIBLE, engagementScore: 0, levelRecord: 1 });
    const lowApp = await buildApp(low);
    const lowRes = await put(lowApp, true);
    expect(lowRes.statusCode).toBe(409);
    expect(lowRes.json().code).toBe('LEAGUE_LOCKED');
    expect(low.user.rows[0]!.publicLeagueConsentAt).toBeUndefined();

    const minor = fakeGameDb();
    seedUser(minor, { ...ELIGIBLE, birthDate: new Date('2012-01-01T00:00:00Z') });
    const minorRes = await put(await buildApp(minor), true);
    expect(minorRes.statusCode).toBe(409);
    expect(minorRes.json().code).toBe('LEAGUE_MINOR');
    await lowApp.close();
  });

  it('retire d’un geste : la colonne repasse à null et le pseudonyme disparaît', async () => {
    const db = fakeGameDb();
    seedUser(db, ELIGIBLE);
    const app = await buildApp(db);
    await put(app, true);

    const res = await put(app, false);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ purpose: 'public-league', granted: false });
    expect(db.user.rows[0]!.publicLeagueConsentAt).toBeNull();
    expect(db.leaguePseudonym.rows).toHaveLength(0);
    await app.close();
  });

  it('exige toujours la politique en vigueur : 409 CONSENT_POLICY_VERSION_MISMATCH', async () => {
    const db = fakeGameDb();
    seedUser(db, ELIGIBLE);
    const res = await put(await buildApp(db), true, '1999-01-01');
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('CONSENT_POLICY_VERSION_MISMATCH');
  });

  it('un purpose inconnu reste refusé en 400, avec les cinq historiques listés', async () => {
    const db = fakeGameDb();
    seedUser(db, ELIGIBLE);
    const app = await buildApp(db);
    const res = await app.inject({ method: 'PUT', url: '/api/v1/me/consents/nope', payload: { granted: true, policyVersion: CONSENT_POLICY_VERSION } });
    expect(res.statusCode).toBe(400);
    expect(res.json().allowedPurposes).toEqual([...CONSENT_PURPOSES]);
  });
});

describe('GET /me/consents — le consentement de jeu à côté, jamais dedans', () => {
  it('sert gameConsents sans toucher à la liste des cinq', async () => {
    const db = fakeGameDb();
    seedUser(db, ELIGIBLE);
    const app = await buildApp(db);

    const before = (await app.inject({ method: 'GET', url: '/api/v1/me/consents' })).json().data;
    expect(before.consents.map((c: { purpose: string }) => c.purpose)).toEqual([...CONSENT_PURPOSES]);
    expect(before.gameConsents).toEqual([expect.objectContaining({ purpose: 'public-league', granted: false })]);

    await put(app, true);
    const after = (await app.inject({ method: 'GET', url: '/api/v1/me/consents' })).json().data;
    expect(after.consents).toHaveLength(5);
    expect(after.gameConsents[0]).toMatchObject({ purpose: 'public-league', granted: true });
    await app.close();
  });
});
