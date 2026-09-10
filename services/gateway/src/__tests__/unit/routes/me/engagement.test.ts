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
  counters?: Array<{ axisKey: string; count: number; updatedAt?: Date }>;
  milestones?: Array<{ milestoneType: string; milestoneKey: string; reachedAt: Date }>;
  /** Bornes du registre de frappe (#5839) — `null` quand rien n'a été frappé. */
  mintDates?: { first: Date | null; last: Date | null };
}) {
  const { user, counters = [], milestones = [], mintDates } = params;
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
    meeshLedger: {
      aggregate: jest.fn<any>().mockResolvedValue({
        _min: { createdAt: mintDates?.first ?? null },
        _max: { createdAt: mintDates?.last ?? null },
      }),
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

/**
 * `elan.activeFamilies` (#5897) — la LISTE derrière le cardinal.
 *
 * Avant ce lot, la route ne servait que `activeFamilyCount` : un client ne
 * pouvait approximer les chips qu'avec le score CUMULÉ (tous axes jamais
 * touchés), qui reste `> 0` pour une famille abandonnée depuis longtemps. Le
 * témoin ci-dessous prouve que la fenêtre glissante l'exclut correctement —
 * une famille au compteur positif mais HORS FENÊTRE ne doit apparaître ni
 * dans `activeFamilies`, ni dans son cardinal.
 */
describe('GET /me/engagement — elan.activeFamilies, la fenêtre plutôt que le cumul', () => {
  it('exclut une famille au score positif mais HORS de la fenêtre de 7 jours', async () => {
    const ilYA = (jours: number) => new Date(Date.now() - jours * 24 * 60 * 60 * 1000);
    const prisma = makePrisma({
      user: { currentStreakDays: 1, longestStreakDays: 1, engagementScore: 10 },
      counters: [
        // Active récemment — reste dans la fenêtre.
        { axisKey: 'content.text_message', count: 7, updatedAt: ilYA(1) },
        // Compteur POSITIF (le score cumulé la compterait) mais délaissée
        // depuis longtemps — la fenêtre doit l'exclure.
        { axisKey: 'comment.text', count: 3, updatedAt: ilYA(30) },
      ],
    });
    const app = await buildApp(prisma);

    const body = JSON.parse((await getEngagement(app, USER_ID)).body);

    expect(body.data.elan.activeFamilies).toEqual(['content']);
    expect(body.data.elan.activeFamilyCount).toBe(1);
    await app.close();
  });

  it('rend une liste vide, jamais le score cumulé, quand tout est hors fenêtre', async () => {
    const ilYA = (jours: number) => new Date(Date.now() - jours * 24 * 60 * 60 * 1000);
    const prisma = makePrisma({
      user: { currentStreakDays: 0, longestStreakDays: 0, engagementScore: 0 },
      counters: [{ axisKey: 'content.post', count: 4, updatedAt: ilYA(40) }],
    });
    const app = await buildApp(prisma);

    const body = JSON.parse((await getEngagement(app, USER_ID)).body);

    expect(body.data.elan.activeFamilies).toEqual([]);
    expect(body.data.elan.activeFamilyCount).toBe(0);
    await app.close();
  });
});

/**
 * LES DATES DE FRAPPE (#5839) — ce que le sous-menu de l'entrée Meesh raconte.
 *
 * Elles ne se dérivent NI du solde NI du compte à vie : un solde à 1 peut venir
 * d'un don reçu, jamais d'une frappe. Seul `MeeshLedger` filtré sur
 * `reason: 'mint'` distingue frapper de recevoir — et c'est exactement le
 * filtre que ces témoins vérifient, parce qu'un `aggregate` sans lui rendrait
 * la date d'un don avec le même aplomb.
 */
describe('GET /me/engagement — les bornes du registre de frappe', () => {
  it('sert la première et la dernière frappe', async () => {
    const prisma = makePrisma({
      user: { currentStreakDays: 1, longestStreakDays: 1, engagementScore: 10 },
      mintDates: {
        first: new Date('2026-07-01T10:00:00.000Z'),
        last: new Date('2026-09-01T10:00:00.000Z'),
      },
    });
    const app = await buildApp(prisma);
    const res = await getEngagement(app, USER_ID);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data.meesh.firstMintedAt).toBe('2026-07-01T10:00:00.000Z');
    expect(body.data.meesh.lastMintedAt).toBe('2026-09-01T10:00:00.000Z');
    await app.close();
  });

  it("n'interroge QUE les frappes — un don reçu n'est pas une frappe", async () => {
    const prisma = makePrisma({
      user: { currentStreakDays: 1, longestStreakDays: 1, engagementScore: 10 },
    });
    const app = await buildApp(prisma);
    await getEngagement(app, USER_ID);

    expect(prisma.meeshLedger.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID, reason: 'mint' } }),
    );
    await app.close();
  });

  it('rend `null` des deux côtés quand rien n\'a jamais été frappé', async () => {
    const prisma = makePrisma({
      user: { currentStreakDays: 0, longestStreakDays: 0, engagementScore: 0 },
    });
    const app = await buildApp(prisma);
    const body = JSON.parse((await getEngagement(app, USER_ID)).body);

    expect(body.data.meesh.firstMintedAt).toBeNull();
    expect(body.data.meesh.lastMintedAt).toBeNull();
    await app.close();
  });

  it("lit le registre de l'utilisateur AUTHENTIFIÉ, jamais d'un autre", async () => {
    const prisma = makePrisma({
      user: { currentStreakDays: 1, longestStreakDays: 1, engagementScore: 10 },
    });
    const app = await buildApp(prisma);
    await getEngagement(app, OTHER_USER_ID);

    expect(prisma.meeshLedger.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: OTHER_USER_ID }) }),
    );
    await app.close();
  });
});
