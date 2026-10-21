/**
 * LES LECTURES QU'UN LIEN DU JEU OUVRE (#9947) — route → service → base, seule
 * la base est un faux. Chaque réponse passe le schéma PARTAGÉ ; l'utilisateur
 * est celui de l'authentification ; un paramètre qui n'est pas une saison ou une
 * semaine est un 400 ; rien d'un autre membre n'est servi.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import {
  GAME_ARCHIVE_ROUTES,
  gameLeagueWeekArchivePath,
  gameLeagueWeekArchiveSchema,
  gameSeasonArchivePath,
  gameSeasonArchiveSchema,
} from '@meeshy/shared/types/game-archive';
import { seasonCalendar } from '@meeshy/shared/utils/game/season';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from '../../../../services/game/__tests__/fakeGameDb';
import { meGameRoutes } from '../../../../routes/me/game';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../services/preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: async (_prisma: unknown, ids: string[]) => new Map(ids.map((id) => [id, {}])),
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

const get = (app: FastifyInstance, route: string) => app.inject({ method: 'GET', url: `/api/v1${route}` });

const seeded = () => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: 4000 });
  seedUser(db, { engagementScore: 4000 }, OTHER);
  return db;
};

describe('GET /me/game/seasons/:number', () => {
  it('401 sans compte', async () => {
    const app = await buildApp(fakeGameDb(), null);
    expect((await get(app, gameSeasonArchivePath(1))).statusCode).toBe(401);
    expect((await get(app, gameLeagueWeekArchivePath(seasonCalendar(1)!.startDay))).statusCode).toBe(401);
    await app.close();
  });

  it('200 : le calendrier et le thème de la saison, sous le schéma du contrat', async () => {
    const app = await buildApp(seeded());
    const res = await get(app, gameSeasonArchivePath(5));

    expect(res.statusCode).toBe(200);
    const season = res.json().data;
    expect(gameSeasonArchiveSchema.safeParse(season).success).toBe(true);
    expect(season).toMatchObject({ number: 5, startDay: seasonCalendar(5)!.startDay, themeKey: seasonCalendar(5)!.themeKey });
    await app.close();
  });

  it('MA progression, jamais celle de l’autre membre', async () => {
    const db = seeded();
    db.gameSeason.rows.push({ id: 'b', userId: OTHER, number: 1, stars: 99, claimedSteps: [1], sealOwnedAt: null, settledAt: null });
    const app = await buildApp(db);

    const season = (await get(app, gameSeasonArchivePath(1))).json().data;

    expect(season.progress).toBeNull();
    expect(JSON.stringify(season)).not.toContain(OTHER);
    await app.close();
  });

  it('400 SEASON_INVALID pour ce qui n’est pas un numéro de saison', async () => {
    const app = await buildApp(seeded());
    for (const raw of ['0', '-1', 'abc', '1.5', '100000']) {
      const res = await get(app, GAME_ARCHIVE_ROUTES.season.replace(':number', raw));
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ success: false, code: 'SEASON_INVALID' });
    }
    await app.close();
  });
});

describe('GET /me/game/league/weeks/:weekKey', () => {
  it('200 : MON résultat gravé, sans rien du reste du groupe', async () => {
    const db = seeded();
    const weekKey = seasonCalendar(1)!.weekKeys[0]!;
    db.leagueMembership.rows.push({ id: 'm1', userId: USER, weekKey, groupId: 'g', league: 'quartz', finalRank: 4, finalPoints: 300, zone: 'promotion', cup: null, settledAt: new Date() });
    db.leagueMembership.rows.push({ id: 'm2', userId: OTHER, weekKey, groupId: 'g', league: 'quartz', finalRank: 1, finalPoints: 900, zone: 'promotion', cup: 'gold', settledAt: new Date() });
    const app = await buildApp(db);

    const res = await get(app, gameLeagueWeekArchivePath(weekKey));

    expect(res.statusCode).toBe(200);
    const week = res.json().data;
    expect(gameLeagueWeekArchiveSchema.safeParse(week).success).toBe(true);
    expect(week.result).toEqual({ league: 'quartz', finalRank: 4, finalPoints: 300, zone: 'promotion', cup: null, settled: true });
    expect(Object.keys(week).sort()).toEqual(['result', 'retention', 'season', 'status', 'weekKey']);
    await app.close();
  });

  it('400 LEAGUE_WEEK_INVALID pour un jour qui n’est pas un lundi, ou pas un jour', async () => {
    const app = await buildApp(seeded());
    for (const raw of ['2026-10-13', '2026-02-30', 'semaine', '20261012']) {
      const res = await get(app, GAME_ARCHIVE_ROUTES.leagueWeek.replace(':weekKey', raw));
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ success: false, code: 'LEAGUE_WEEK_INVALID' });
    }
    await app.close();
  });
});
