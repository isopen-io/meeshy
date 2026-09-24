/**
 * `GET /links/:linkId/stats` — ce qu'un lien d'invitation a produit, rendu à
 * son auteur et aux modérateurs de la conversation (#7797).
 *
 * La vraie sérialisation est exercée (les schémas partagés ne sont pas
 * mockés) : un chiffre absent du schéma de réponse est retiré en silence.
 * Seule la porte d'identité est doublée, comme dans les autres suites de
 * `routes/links` — la règle d'autorisation, elle, est la vraie
 * (`loadShareLinkForManagement`, partagée avec `PATCH /links/:linkId`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (req: FastifyRequest) => {
    (req as unknown as { authContext: unknown }).authContext = (req as unknown as { _testAuthContext: unknown })._testAuthContext;
  }),
  isRegisteredUser: jest.fn((ctx: { registeredUser?: unknown } | null) => ctx?.registeredUser != null),
}));

import { registerLinkStatsRoutes } from '../../../routes/links/stats';

const CREATOR_ID = '507f1f77bcf86cd799439011';
const MODERATOR_ID = '507f1f77bcf86cd799439012';
const STRANGER_ID = '507f1f77bcf86cd799439013';
const LINK_DB_ID = '507f1f77bcf86cd799439022';
const LINK_ID = 'mshy_abc123';
const CONV_ID = '507f1f77bcf86cd799439033';

type Row = Record<string, unknown>;

const arrivalRow = (overrides: Row = {}): Row => ({
  id: 'p-1', type: 'anonymous', displayName: 'nova', avatar: null, language: 'fr',
  joinedAt: new Date('2026-09-24T10:00:00.000Z'), joinCountry: 'FR', user: null,
  ...overrides,
});

function fakePrisma(options: {
  readonly memberRole?: string;
  readonly caller?: string;
  readonly visitCount?: number | null;
  readonly arrivals?: number;
  readonly anonymousArrivals?: number;
  readonly guestLanguages?: ReadonlyArray<{ language: string; count: number }>;
  readonly accountLanguages?: ReadonlyArray<{ systemLanguage: string; count: number }>;
  readonly countries?: ReadonlyArray<{ joinCountry: string | null; count: number }>;
  readonly recent?: readonly Row[];
} = {}) {
  const participantCount = jest.fn(async (args: { where: Row }) =>
    args.where.type === 'anonymous' ? options.anonymousArrivals ?? 0 : options.arrivals ?? 0);
  const participantGroupBy = jest.fn(async (args: { by: string[] }) =>
    args.by[0] === 'language'
      ? (options.guestLanguages ?? []).map(({ language, count }) => ({ language, _count: { _all: count } }))
      : (options.countries ?? []).map(({ joinCountry, count }) => ({ joinCountry, _count: { _all: count } })));
  const participantFindMany = jest.fn(async (_args: unknown) => options.recent ?? []);
  const userGroupBy = jest.fn(async (_args: unknown) =>
    (options.accountLanguages ?? []).map(({ systemLanguage, count }) => ({ systemLanguage, _count: { _all: count } })));
  const prisma = {
    conversationShareLink: {
      findFirst: jest.fn(async () => ({
        id: LINK_DB_ID, linkId: LINK_ID, createdBy: CREATOR_ID, conversationId: CONV_ID,
        conversation: {
          id: CONV_ID,
          participants: options.memberRole ? [{ userId: options.caller, role: options.memberRole, isActive: true }] : [],
        },
      })),
      findUnique: jest.fn(async () => ({ visitCount: options.visitCount === undefined ? 0 : options.visitCount })),
    },
    participant: { count: participantCount, groupBy: participantGroupBy, findMany: participantFindMany },
    user: { groupBy: userGroupBy },
  };
  return { prisma, participantFindMany, participantGroupBy, userGroupBy };
}

async function buildApp(prisma: unknown, caller: string | null, platformRole = 'USER') {
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (req: FastifyRequest) => {
    (req as unknown as { _testAuthContext: unknown })._testAuthContext = caller
      ? { isAuthenticated: true, isAnonymous: false, userId: caller, registeredUser: { id: caller, role: platformRole } }
      : null;
  });
  await registerLinkStatsRoutes(app);
  await app.ready();
  return app;
}

const getStats = (app: FastifyInstance, linkId = LINK_ID) => app.inject({ method: 'GET', url: `/links/${linkId}/stats` });

describe('statistiques d’un lien — qui peut les lire', () => {
  it('l’auteur du lien les lit', async () => {
    const { prisma } = fakePrisma();
    const app = await buildApp(prisma, CREATOR_ID);

    const res = await getStats(app);

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('un modérateur de la conversation les lit', async () => {
    const { prisma } = fakePrisma({ memberRole: 'moderator', caller: MODERATOR_ID });
    const app = await buildApp(prisma, MODERATOR_ID);

    expect((await getStats(app)).statusCode).toBe(200);
    await app.close();
  });

  it('un simple membre reçoit 403', async () => {
    const { prisma, participantFindMany } = fakePrisma({ memberRole: 'member', caller: STRANGER_ID });
    const app = await buildApp(prisma, STRANGER_ID);

    const res = await getStats(app);

    expect(res.statusCode).toBe(403);
    expect(participantFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('un lien inconnu rend 404', async () => {
    const { prisma } = fakePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null as never);
    const app = await buildApp(prisma, CREATOR_ID);

    expect((await getStats(app)).statusCode).toBe(404);
    await app.close();
  });

  it('sans compte, 403', async () => {
    const { prisma } = fakePrisma();
    const app = await buildApp(prisma, null);

    expect((await getStats(app)).statusCode).toBe(403);
    await app.close();
  });
});

describe('statistiques d’un lien — les chiffres', () => {
  it('rend visites, arrivées et arrivées sans compte', async () => {
    const { prisma } = fakePrisma({ visitCount: 42, arrivals: 7, anonymousArrivals: 5 });
    const app = await buildApp(prisma, CREATOR_ID);

    const data = (await getStats(app)).json().data;

    expect(data).toMatchObject({ visits: 42, arrivals: 7, anonymousArrivals: 5 });
    await app.close();
  });

  it('un lien né avant le compteur de visites rend 0, jamais null', async () => {
    const { prisma } = fakePrisma({ visitCount: null });
    const app = await buildApp(prisma, CREATOR_ID);

    expect((await getStats(app)).json().data.visits).toBe(0);
    await app.close();
  });

  it('fusionne les langues des invités et des comptes, canonicalisées, triées par nombre décroissant', async () => {
    const { prisma } = fakePrisma({
      guestLanguages: [{ language: 'fr', count: 2 }, { language: 'en-US', count: 1 }],
      accountLanguages: [{ systemLanguage: 'en', count: 3 }, { systemLanguage: 'FR', count: 1 }, { systemLanguage: 'es', count: 1 }],
    });
    const app = await buildApp(prisma, CREATOR_ID);

    const data = (await getStats(app)).json().data;

    expect(data.arrivalsByLanguage).toEqual([
      { language: 'en', count: 4 },
      { language: 'fr', count: 3 },
      { language: 'es', count: 1 },
    ]);
    await app.close();
  });

  it('les langues des comptes se lisent sur le compte, des seuls arrivés par CE lien', async () => {
    const { prisma, userGroupBy } = fakePrisma();
    const app = await buildApp(prisma, CREATOR_ID);

    await getStats(app);

    expect(userGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['systemLanguage'],
      where: { participations: { some: { shareLinkId: LINK_DB_ID, type: 'user' } } },
    }));
    await app.close();
  });

  it('répartit par pays, sans le pays inconnu, trié par nombre décroissant', async () => {
    const { prisma } = fakePrisma({ countries: [{ joinCountry: 'SN', count: 1 }, { joinCountry: null, count: 4 }, { joinCountry: 'FR', count: 3 }] });
    const app = await buildApp(prisma, CREATOR_ID);

    const data = (await getStats(app)).json().data;

    expect(data.arrivalsByCountry).toEqual([{ country: 'FR', count: 3 }, { country: 'SN', count: 1 }]);
    await app.close();
  });

  it('rend les vingt arrivées les plus récentes, du lien seul, les plus récentes d’abord', async () => {
    const { prisma, participantFindMany } = fakePrisma();
    const app = await buildApp(prisma, CREATOR_ID);

    await getStats(app);

    expect(participantFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { shareLinkId: LINK_DB_ID },
      orderBy: { joinedAt: 'desc' },
      take: 20,
    }));
    await app.close();
  });

  it('une arrivée récente dit qui, d’où, dans quelle langue, et quand', async () => {
    const { prisma } = fakePrisma({
      recent: [
        arrivalRow(),
        arrivalRow({
          id: 'p-2', type: 'user', displayName: 'Ana', avatar: null, language: 'en', joinCountry: null,
          joinedAt: new Date('2026-09-23T08:00:00.000Z'),
          user: { avatar: '/api/v1/attachments/file/ana.png', systemLanguage: 'pt' },
        }),
      ],
    });
    const app = await buildApp(prisma, CREATOR_ID);

    const data = (await getStats(app)).json().data;

    expect(data.recentArrivals).toEqual([
      { participantId: 'p-1', displayName: 'nova', avatar: null, isAnonymous: true, country: 'FR', language: 'fr', joinedAt: '2026-09-24T10:00:00.000Z' },
      { participantId: 'p-2', displayName: 'Ana', avatar: '/api/v1/attachments/file/ana.png', isAnonymous: false, country: null, language: 'pt', joinedAt: '2026-09-23T08:00:00.000Z' },
    ]);
    await app.close();
  });

  it('ne sert aucune présence ni aucune IP d’un arrivant', async () => {
    const { prisma } = fakePrisma({ recent: [arrivalRow({ isOnline: true, lastActiveAt: new Date(), ipAddress: '203.0.113.7' })] });
    const app = await buildApp(prisma, CREATOR_ID);

    const body = (await getStats(app)).body;

    expect(body).not.toContain('isOnline');
    expect(body).not.toContain('lastActiveAt');
    expect(body).not.toContain('203.0.113.7');
    await app.close();
  });
});
