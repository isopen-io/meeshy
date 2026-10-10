/**
 * LES ÉCRITURES DU JEU (#9376, #9375, #9378) — gel, rallumage, changement de
 * mission, coffre, clés de guide. Route → service → base : seule la base est
 * un faux. Chaque réponse passe le schéma PARTAGÉ du contrat, et l'utilisateur
 * est toujours celui de l'authentification — jamais un id du corps.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import {
  chestClaimResponseSchema,
  flameFreezeResponseSchema,
  flameRelightResponseSchema,
  guideSeenResponseSchema,
  missionRerollResponseSchema,
  GAME_ROUTES,
  gameMissionRerollPath,
} from '@meeshy/shared/types/game';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from '../../../../services/game/__tests__/fakeGameDb';
import { meGameRoutes } from '../../../../routes/me/game';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const creditGamePoints = jest.fn<(userId: string, points: number, axisKey: string) => Promise<void>>().mockResolvedValue(undefined);

async function buildApp(db: FakeGameDb, userId: string | null = USER): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', db.prisma as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).auth = userId ? { userId, isAuthenticated: true } : undefined;
  });
  await app.register(meGameRoutes, { prefix: '/api/v1/me', engagement: { creditGamePoints } });
  await app.ready();
  return app;
}

const post = (app: FastifyInstance, route: string, payload: unknown) =>
  app.inject({ method: 'POST', url: `/api/v1${route}`, payload: payload as object });

const grant = (db: FakeGameDb, balance: number) =>
  db.meeshLedger.rows.push({ id: 'g1', userId: USER, delta: balance, reason: 'grant', requestId: 'octroi-0001' });

const todayKey = () => new Date().toISOString().slice(0, 10);

describe('POST /me/game/flame/freezes', () => {
  it('achète un gel : 200, la forme du contrat, la réserve et le solde à jour', async () => {
    const db = fakeGameDb();
    seedUser(db, {});
    grant(db, 3);
    const app = await buildApp(db);

    const res = await post(app, GAME_ROUTES.flameFreezes, { requestId: 'gel-route-001' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ status: 'bought', freezes: 1, balance: 2 });
    expect(flameFreezeResponseSchema.safeParse(res.json().data).success).toBe(true);
    await app.close();
  });

  it('409 FREEZE_AT_MAXIMUM au maximum de 2', async () => {
    const db = fakeGameDb();
    seedUser(db, { flameFreezes: 2 });
    grant(db, 3);
    const app = await buildApp(db);

    const res = await post(app, GAME_ROUTES.flameFreezes, { requestId: 'gel-route-002' });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, code: 'FREEZE_AT_MAXIMUM' });
    await app.close();
  });

  it('409 INSUFFICIENT_MEESHES sans Meesh', async () => {
    const db = fakeGameDb();
    seedUser(db, {});
    const app = await buildApp(db);

    const res = await post(app, GAME_ROUTES.flameFreezes, { requestId: 'gel-route-003' });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('INSUFFICIENT_MEESHES');
    await app.close();
  });

  it('409 REQUEST_ID_CONFLICT quand le requestId d’un gel est rejoué sur un rallumage, sans rien débiter', async () => {
    const db = fakeGameDb();
    seedUser(db, {});
    grant(db, 5);
    const app = await buildApp(db);
    await post(app, GAME_ROUTES.flameFreezes, { requestId: 'meme-requete-01' });

    const res = await post(app, GAME_ROUTES.flameRelight, { requestId: 'meme-requete-01' });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, code: 'REQUEST_ID_CONFLICT' });
    expect(db.meeshLedger.rows.reduce((s, r) => s + (r.delta as number), 0)).toBe(4);
    await app.close();
  });

  it('401 sans authentification, 400 sur un requestId trop court', async () => {
    const db = fakeGameDb();
    seedUser(db, {});
    const anonymous = await buildApp(db, null);
    const app = await buildApp(db);

    expect((await post(anonymous, GAME_ROUTES.flameFreezes, { requestId: 'gel-route-004' })).statusCode).toBe(401);
    expect((await post(app, GAME_ROUTES.flameFreezes, { requestId: 'court' })).statusCode).toBe(400);
    await anonymous.close();
    await app.close();
  });

  it('un userId glissé dans le corps est ignoré : le geste vaut pour le compte authentifié, jamais pour un autre', async () => {
    const db = fakeGameDb();
    seedUser(db, {});
    seedUser(db, {}, OTHER);
    grant(db, 3);
    const app = await buildApp(db);

    await post(app, GAME_ROUTES.flameFreezes, { requestId: 'gel-route-005', userId: OTHER });

    expect(db.user.rows.find((r) => r.id === USER)?.flameFreezes).toBe(1);
    expect(db.user.rows.find((r) => r.id === OTHER)?.flameFreezes).toBeUndefined();
    await app.close();
  });
});

describe('POST /me/game/flame/relight', () => {
  it('rallume une Flamme éteinte depuis moins de 48 h', async () => {
    const db = fakeGameDb();
    const gap = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    seedUser(db, { currentStreakDays: 9, longestStreakDays: 9, lastStreakDate: new Date(Date.UTC(gap.getUTCFullYear(), gap.getUTCMonth(), gap.getUTCDate())) });
    grant(db, 4);
    const app = await buildApp(db);

    const res = await post(app, GAME_ROUTES.flameRelight, { requestId: 'rallume-route1' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ status: 'relit', streak: 9, balance: 1 });
    expect(flameRelightResponseSchema.safeParse(res.json().data).success).toBe(true);
    await app.close();
  });

  it('409 RELIGHT_NOT_ALLOWED avec le motif quand la Flamme brûle encore', async () => {
    const db = fakeGameDb();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    seedUser(db, { currentStreakDays: 9, lastStreakDate: new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate())) });
    grant(db, 4);
    const app = await buildApp(db);

    const res = await post(app, GAME_ROUTES.flameRelight, { requestId: 'rallume-route2' });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'RELIGHT_NOT_ALLOWED', reason: 'not-extinguished' });
    await app.close();
  });
});

describe('POST /me/game/missions/:missionId/reroll', () => {
  const missions = (db: FakeGameDb) => {
    for (const [slot, difficulty, templateKey, signal] of [
      [0, 'easy', 'send-texts', 'axis:content.text_message'],
      [1, 'medium', 'publish-post', 'axis:content.post'],
      [2, 'hard', 'publish-posts', 'axis:content.post'],
    ] as const) {
      db.dailyMission.rows.push({
        id: `m${slot}`, userId: USER, dayKey: todayKey(), slot, templateKey, difficulty, signal, prism: false,
        target: 3, progress: 1, reward: 40, glory: 0, seen: [], completedAt: null, paidPoints: null, rerolledAt: null,
      });
    }
  };

  it('change une mission : 200, {mission, balance} au contrat, l’adresse du contrat', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 4000, levelRecord: 20 });
    missions(db);
    grant(db, 2);
    const app = await buildApp(db);

    const res = await post(app, gameMissionRerollPath('m0'), { requestId: 'change-route1' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.balance).toBe(1);
    expect(missionRerollResponseSchema.safeParse(res.json().data).success).toBe(true);
    await app.close();
  });

  it('409 MISSION_NOT_FOUND pour une mission inconnue', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 4000, levelRecord: 20 });
    grant(db, 2);
    const app = await buildApp(db);

    const res = await post(app, gameMissionRerollPath('inconnue'), { requestId: 'change-route2' });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('MISSION_NOT_FOUND');
    await app.close();
  });

  it('409 MISSION_REROLL_EXHAUSTED au second changement du jour', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 4000, levelRecord: 20 });
    missions(db);
    grant(db, 3);
    const app = await buildApp(db);
    await post(app, gameMissionRerollPath('m0'), { requestId: 'change-route3' });

    const res = await post(app, gameMissionRerollPath('m1'), { requestId: 'change-route4' });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('MISSION_REROLL_EXHAUSTED');
    await app.close();
  });
});

describe('POST /me/game/chest/claim', () => {
  it('409 CHEST_NOT_READY tant que les trois missions ne sont pas faites', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 4000, levelRecord: 20 });
    const app = await buildApp(db);

    const res = await post(app, GAME_ROUTES.chestClaim, { requestId: 'coffre-route1' });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('CHEST_NOT_READY');
    await app.close();
  });

  it('s’ouvre une fois les trois faites, au contrat, et se rejoue sans second crédit', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 4000, levelRecord: 20 });
    for (const slot of [0, 1, 2]) {
      db.dailyMission.rows.push({
        id: `m${slot}`, userId: USER, dayKey: todayKey(), slot, templateKey: 'send-texts', difficulty: 'easy', signal: 'axis:content.text_message',
        prism: false, target: 1, progress: 1, reward: 40, glory: 0, seen: [], completedAt: new Date(), paidPoints: 40, rerolledAt: null,
      });
    }
    creditGamePoints.mockClear();
    const app = await buildApp(db);

    const first = await post(app, GAME_ROUTES.chestClaim, { requestId: 'coffre-route2' });
    const again = await post(app, GAME_ROUTES.chestClaim, { requestId: 'coffre-route2' });

    expect(first.statusCode).toBe(200);
    expect(first.json().data.status).toBe('claimed');
    expect(chestClaimResponseSchema.safeParse(first.json().data).success).toBe(true);
    expect(again.json().data.status).toBe('already-claimed');
    expect(creditGamePoints).toHaveBeenCalledTimes(1);
    await app.close();
  });
});

describe('POST /me/game/guide/seen', () => {
  it('mémorise les clés vues et rend la liste, au contrat', async () => {
    const db = fakeGameDb();
    seedUser(db, {});
    const app = await buildApp(db);

    const res = await post(app, GAME_ROUTES.guideSeen, { requestId: 'guide-route-1', keys: ['onboarding.welcome', 'first-level'] });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.guideSeen).toEqual(['onboarding.welcome', 'first-level']);
    expect(guideSeenResponseSchema.safeParse(res.json().data).success).toBe(true);
    await app.close();
  });

  it('400 sans clé, ou avec plus de 32 clés', async () => {
    const db = fakeGameDb();
    seedUser(db, {});
    const app = await buildApp(db);

    expect((await post(app, GAME_ROUTES.guideSeen, { requestId: 'guide-route-2', keys: [] })).statusCode).toBe(400);
    expect((await post(app, GAME_ROUTES.guideSeen, { requestId: 'guide-route-3', keys: Array.from({ length: 33 }, (_, i) => `k${i}`) })).statusCode).toBe(400);
    await app.close();
  });
});
