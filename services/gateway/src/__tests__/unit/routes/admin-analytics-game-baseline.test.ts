/**
 * `GET /admin/analytics/game` sert le point de départ du Jeu (#17363, #20617) : le retour glissant à 1, 7 et
 * 30 jours par semaine d'inscription, les Offrandes et les Meeshes par jour, les Flammes longues vivantes et deux
 * compteurs de garde — des agrégats sans identité, à qui accède à l'administration seulement.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({ get: jest.fn<any>().mockResolvedValue(null), set: jest.fn<any>().mockResolvedValue(undefined) }),
}));
jest.mock('../../../validation/helpers.js', () => ({ validateQuery: () => async () => {} }));
jest.mock('../../../validation/admin-schemas.js', () => ({
  AnalyticsMessageTypesQuerySchema: {},
  AnalyticsLanguageDistQuerySchema: {},
  AnalyticsKpisQuerySchema: {},
}));

import { analyticsRoutes } from '../../../routes/admin/analytics';

const VIEWER_ID = '507f1f77bcf86cd799439011';
const SECRET_ID = '64b7f1f77bcf86cd79943aaa';
const DAY = 24 * 60 * 60 * 1000;

type Fixture = {
  readonly role: string;
  readonly signups?: readonly { createdAt: Date; lastActiveAt: Date | null }[];
  readonly flames?: readonly Record<string, unknown>[];
  readonly offerings?: readonly { chestClaimedAt: Date | null }[];
  readonly ledger?: readonly { reason: string; delta: number; createdAt: Date }[];
  readonly hidden?: number;
  readonly notificationsOff?: readonly unknown[];
  readonly sparksDays?: readonly { day: string; sparks: number; earners: number }[];
};

async function appWith(fixture: Fixture): Promise<{ app: FastifyInstance; prisma: Record<string, Record<string, jest.Mock<any>>> }> {
  const prisma = {
    user: {
      findMany: jest.fn<any>().mockImplementation(async (args: { where: Record<string, unknown> }) =>
        'currentStreakDays' in args.where ? (fixture.flames ?? []) : (fixture.signups ?? []),
      ),
    },
    gameDay: { findMany: jest.fn<any>().mockResolvedValue(fixture.offerings ?? []) },
    meeshLedger: { findMany: jest.fn<any>().mockResolvedValue(fixture.ledger ?? []) },
    gameProfile: { count: jest.fn<any>().mockResolvedValue(fixture.hidden ?? 0) },
    userPreferences: { aggregateRaw: jest.fn<any>().mockResolvedValue(fixture.notificationsOff ?? []) },
    gameSparksDay: { findMany: jest.fn<any>().mockResolvedValue(fixture.sparksDays ?? []) },
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: VIEWER_ID, registeredUser: { id: VIEWER_ID, role: fixture.role } };
  });
  app.decorate('prisma', prisma as any);
  await app.register(analyticsRoutes);
  await app.ready();
  return { app, prisma };
}

describe('GET /game — le point de départ du Jeu (#20617)', () => {
  it('sert le retour glissant, les compteurs du jour, les Flammes longues et les gardes', async () => {
    const now = Date.now();
    const signedUp = new Date(now - 40 * DAY);
    const { app } = await appWith({
      role: 'ADMIN',
      signups: [
        { createdAt: signedUp, lastActiveAt: new Date(signedUp.getTime() + 31 * DAY) },
        { createdAt: signedUp, lastActiveAt: null },
      ],
      flames: [
        { currentStreakDays: 9, lastStreakDate: new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate())), timezone: null, flameFreezes: 0 },
      ],
      offerings: [{ chestClaimedAt: new Date(now) }, { chestClaimedAt: null }],
      ledger: [
        { reason: 'mint', delta: 2, createdAt: new Date(now) },
        { reason: 'spend', delta: -1, createdAt: new Date(now) },
      ],
      hidden: 4,
      notificationsOff: [{ total: 3 }],
    });

    const res = await app.inject({ method: 'GET', url: '/game?days=3' });
    const data = res.json().data;

    expect(res.statusCode).toBe(200);
    expect(data).toMatchObject({
      windowDays: 3,
      cohortWeeks: 13,
      sampled: false,
      longFlames: { minDays: 7, alive: 1 },
      guards: { gameHidden: 4, gameNotificationsOff: 3 },
    });
    expect(data.retention).toEqual([
      expect.objectContaining({
        accounts: 2,
        day1: { eligible: 2, returned: 1, rate: 50 },
        day30: { eligible: 2, returned: 1, rate: 50 },
      }),
    ]);
    expect(data.daily).toHaveLength(3);
    expect(data.daily[2]).toMatchObject({ offeringsOpened: 1, meeshesMinted: 2, meeshesSpent: 1 });
  });

  it('borne chaque lecture et la fenêtre à trente jours', async () => {
    const { app, prisma } = await appWith({ role: 'ADMIN' });

    const data = (await app.inject({ method: 'GET', url: '/game?days=400' })).json().data;

    expect(data.windowDays).toBe(30);
    expect(data.daily).toHaveLength(30);
    for (const call of [prisma.user.findMany, prisma.gameDay.findMany, prisma.meeshLedger.findMany, prisma.gameSparksDay.findMany]) {
      for (const [args] of call.mock.calls) {
        expect((args as { take?: number }).take).toEqual(expect.any(Number));
      }
    }
    expect(prisma.gameProfile.count).toHaveBeenCalledWith({ where: { gameHiddenAt: { not: null } } });
    expect(prisma.userPreferences.aggregateRaw).toHaveBeenCalledWith({
      pipeline: [{ $match: { 'notification.gameEnabled': false } }, { $count: 'total' }],
    });
  });

  it('sert un taux nul sans compte observable, jamais zéro', async () => {
    const { app } = await appWith({ role: 'ADMIN', signups: [{ createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), lastActiveAt: new Date() }] });

    const [cohort] = (await app.inject({ method: 'GET', url: '/game' })).json().data.retention;

    expect(cohort.day1).toEqual({ eligible: 0, returned: 0, rate: null });
  });

  it('ne sert aucun identifiant de compte', async () => {
    const { app } = await appWith({
      role: 'ADMIN',
      signups: [{ id: SECRET_ID, createdAt: new Date(Date.now() - 10 * DAY), lastActiveAt: new Date() } as any],
      flames: [{ id: SECRET_ID, currentStreakDays: 8, lastStreakDate: new Date(), timezone: null }],
    });

    const body = (await app.inject({ method: 'GET', url: '/game' })).body;

    expect(body).not.toContain(SECRET_ID);
  });

  it('sert les étincelles gagnées par jour et les joueurs qui en ont gagné, depuis le seau quotidien (#20619)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { app, prisma } = await appWith({ role: 'ADMIN', sparksDays: [{ day: today, sparks: 120, earners: 3 }] });

    const data = (await app.inject({ method: 'GET', url: '/game?days=2' })).json().data;

    expect(data.daily[1]).toMatchObject({ day: today, sparksEarned: 120, sparkEarners: 3 });
    expect(data.daily[0]).toMatchObject({ sparksEarned: 0, sparkEarners: 0 });
    const [args] = prisma.gameSparksDay.findMany.mock.calls[0] as [{ where: { day: { gte: string } }; take: number; select: Record<string, boolean> }];
    expect(args.where.day.gte).toBe(data.daily[0].day);
    expect(args.take).toEqual(expect.any(Number));
    expect(args.select).toEqual({ day: true, sparks: true, earners: true });
  });

  it('refuse un compte sans accès à l’administration', async () => {
    const { app, prisma } = await appWith({ role: 'USER' });

    const res = await app.inject({ method: 'GET', url: '/game' });

    expect(res.statusCode).toBe(403);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
