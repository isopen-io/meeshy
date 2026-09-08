/**
 * `GET /me/engagement` (#5547 § « backend ») — écran de consultation
 * (docs/product/streaks-badges-modele.md § 9) : lit `EngagementCounter` +
 * `EngagementMilestone` + `User.{currentStreakDays, longestStreakDays,
 * engagementScore}` pour l'utilisateur AUTHENTIFIÉ, jamais un autre —
 * lecture seule, aucune écriture (le seul point d'écriture reste
 * `EngagementService.recordActivity`, #5530).
 *
 * Montage AUTONOME (`onRequest: [fastify.authenticate]`), même patron que
 * `me/consents.ts` (#4348) et `me/categories.ts` (#4359).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { meEngagementRoutes } from '../../../../routes/me/engagement';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

const USER_ID = '68a000000000000000000001';
const OTHER_USER_ID = '68a000000000000000000002';

function makePrisma(params: {
  user?: { currentStreakDays?: number; longestStreakDays?: number; engagementScore?: number } | null;
  counters?: Array<{ axisKey: string; count: number }>;
  milestones?: Array<{ milestoneType: string; milestoneKey: string; reachedAt: Date }>;
}) {
  const { user, counters = [], milestones = [] } = params;
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(user === undefined ? null : user),
    },
    engagementCounter: {
      findMany: jest.fn<any>().mockResolvedValue(counters),
    },
    engagementMilestone: {
      findMany: jest.fn<any>().mockResolvedValue(milestones),
    },
  } as any;
}

async function buildApp(prisma: ReturnType<typeof makePrisma>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    const userId = req.headers['x-test-user-id'] as string | undefined;
    (req as any).auth = userId ? { userId, isAuthenticated: true } : undefined;
  });
  await app.register(meEngagementRoutes, { prefix: '/api/v1/me' });
  await app.ready();
  return app;
}

function getEngagement(app: FastifyInstance, userId?: string) {
  return app.inject({
    method: 'GET',
    url: '/api/v1/me/engagement',
    headers: userId ? { 'x-test-user-id': userId } : {},
  });
}

describe('GET /me/engagement', () => {
  it('401 sans authentification', async () => {
    const app = await buildApp(makePrisma({}));
    const res = await getEngagement(app);
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('sert les compteurs, paliers et streak/niveau de L\'UTILISATEUR AUTHENTIFIÉ, rien d\'un autre', async () => {
    const prisma = makePrisma({
      user: { currentStreakDays: 5, longestStreakDays: 12, engagementScore: 42 },
      counters: [
        { axisKey: 'content.text_message', count: 7 },
        { axisKey: 'content.audio_message', count: 1 },
      ],
      milestones: [
        { milestoneType: 'badge', milestoneKey: 'content.text_message:1', reachedAt: new Date('2026-09-01T00:00:00.000Z') },
        { milestoneType: 'streak', milestoneKey: 'streak:3', reachedAt: new Date('2026-09-02T00:00:00.000Z') },
      ],
    });
    const app = await buildApp(prisma);

    const res = await getEngagement(app, USER_ID);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.counters).toEqual([
      { axisKey: 'content.text_message', count: 7 },
      { axisKey: 'content.audio_message', count: 1 },
    ]);
    expect(body.data.milestones).toEqual([
      { milestoneType: 'badge', milestoneKey: 'content.text_message:1', reachedAt: '2026-09-01T00:00:00.000Z' },
      { milestoneType: 'streak', milestoneKey: 'streak:3', reachedAt: '2026-09-02T00:00:00.000Z' },
    ]);
    expect(body.data.streak).toEqual({ currentStreakDays: 5, longestStreakDays: 12 });
    expect(body.data.level).toEqual({ engagementScore: 42 });

    // Chaque requête Prisma cible EXACTEMENT l'appelant — jamais un id
    // fourni par ailleurs (pas de paramètre d'URL ici, mais la garde vaut
    // d'être écrite : elle documente qu'aucun autre id ne peut entrer).
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: USER_ID } }));
    expect(prisma.engagementCounter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } })
    );
    expect(prisma.engagementMilestone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } })
    );

    await app.close();
  });

  it('état vide correct pour un utilisateur sans aucune activité', async () => {
    const app = await buildApp(makePrisma({ user: { currentStreakDays: 0, longestStreakDays: 0, engagementScore: 0 } }));

    const res = await getEngagement(app, USER_ID);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.counters).toEqual([]);
    expect(body.data.milestones).toEqual([]);
    expect(body.data.streak).toEqual({ currentStreakDays: 0, longestStreakDays: 0 });
    expect(body.data.level).toEqual({ engagementScore: 0 });

    await app.close();
  });

  it('replie sur 0 quand les colonnes de streak/score sont ABSENTES (compte pré-existant, cf. EngagementService)', async () => {
    // Même piège que documenté dans EngagementService.updateStreak : les
    // colonnes portent un `@default(0)` qui ne s'applique qu'à la CRÉATION.
    const app = await buildApp(makePrisma({ user: {} }));

    const res = await getEngagement(app, USER_ID);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.streak).toEqual({ currentStreakDays: 0, longestStreakDays: 0 });
    expect(body.data.level).toEqual({ engagementScore: 0 });

    await app.close();
  });

  it('404 si l\'utilisateur authentifié ne résout à aucune ligne', async () => {
    const app = await buildApp(makePrisma({ user: undefined }));
    const res = await getEngagement(app, USER_ID);
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('deux utilisateurs distincts ne voient jamais les compteurs l\'un de l\'autre', async () => {
    const prisma = makePrisma({
      user: { currentStreakDays: 1, longestStreakDays: 1, engagementScore: 3 },
      counters: [{ axisKey: 'content.text_message', count: 1 }],
    });
    const app = await buildApp(prisma);

    await getEngagement(app, OTHER_USER_ID);

    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: OTHER_USER_ID } }));
    expect(prisma.engagementCounter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: OTHER_USER_ID } })
    );

    await app.close();
  });
});
