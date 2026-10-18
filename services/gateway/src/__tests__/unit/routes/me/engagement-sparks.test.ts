/**
 * `GET /me/engagement` — les ÉTINCELLES (#10846, #10847, #10848), ajoutées à côté des champs actuels.
 *
 * Contrat : `level.engagementScore` reste la poche (nombre entier) ; `level.sparks`, `sparksCycle`, `sparksLifetime` et
 * `levelMaxLifetime` s'ajoutent ; `meesh.debitablePoints` est la poche ENTIÈRE (plus de « points à convertir »),
 * `floorPoints` vaut 0, `mintCost` est le prix EFFECTIF et `baseMintCost` / `costFactor` le détaillent. Un BigInt ne part
 * jamais sur le fil : tout est un nombre JSON.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { isEngagementProgressPayload } from '@meeshy/shared/types/engagement';
import { parseGameBlock } from '@meeshy/shared/types/game';
import { meEngagementRoutes } from '../../../../routes/me/engagement';
import { GameBlockService } from '../../../../services/game/GameBlockService';
import { MissionService } from '../../../../services/game/MissionService';
import { fakeGameDb, seedUser, USER } from '../../../../services/game/__tests__/fakeGameDb';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

type GameBuilder = NonNullable<Parameters<typeof meEngagementRoutes>[1]>['gameBlock'];

const ACCOUNT = {
  currentStreakDays: 3,
  longestStreakDays: 5,
  engagementScore: 300,
  // Des BigInt, comme Prisma les rend pour une colonne `BigInt` : ils ne doivent JAMAIS atteindre `JSON.stringify`.
  sparksSincePrestige: 9_000n,
  sparksEarnedLifetime: 5_000_000_000n,
  levelRecord: 9,
  levelMaxLifetime: 52,
};

function makePrisma(user: Record<string, unknown>, mints = 0) {
  return {
    user: { findUnique: jest.fn<any>().mockResolvedValue(user) },
    engagementCounter: { findMany: jest.fn<any>().mockResolvedValue([{ axisKey: 'conversation.private', count: 4, points: 5000, updatedAt: new Date() }]) },
    engagementMilestone: { findMany: jest.fn<any>().mockResolvedValue([]) },
    meeshLedger: {
      aggregate: jest.fn<any>().mockImplementation(async (args: { _sum?: unknown }) =>
        args._sum ? { _sum: { delta: mints } } : { _min: { createdAt: null }, _max: { createdAt: null } },
      ),
      count: jest.fn<any>().mockResolvedValue(mints),
    },
  } as any;
}

async function buildApp(gameBlock: GameBuilder, mints = 0): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma(ACCOUNT, mints));
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER, isAuthenticated: true };
  });
  await app.register(meEngagementRoutes, { prefix: '/api/v1/me', gameBlock });
  await app.ready();
  return app;
}

const get = (app: FastifyInstance) => app.inject({ method: 'GET', url: '/api/v1/me/engagement' });

const realBlock = async () => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: 300, sparksSincePrestige: 9000, sparksEarnedLifetime: 5_000_000_000, levelRecord: 9, levelMaxLifetime: 52 });
  const missions = new MissionService(db.prisma, { creditPoints: async () => undefined });
  const block = await new GameBlockService(db.prisma, { missions }).build({ userId: USER });
  if (block === null) throw new Error('bloc invalide');
  return block;
};

describe('GET /me/engagement — les étincelles', () => {
  it('level : la poche inchangée sous `engagementScore`, les étincelles à côté, en nombres JSON', async () => {
    const app = await buildApp(async () => realBlock());

    const res = await get(app);
    const { data } = res.json();

    expect(res.statusCode).toBe(200);
    expect(data.level).toEqual({
      engagementScore: 300,
      sparks: 300,
      sparksCycle: 9000,
      sparksLifetime: 5_000_000_000,
      sparksDebt: 0,
      levelMaxLifetime: 52,
    });
    await app.close();
  });

  it('meesh : toute la poche est débitable, aucun plancher, le prix est celui du niveau ACTUEL', async () => {
    const game = await realBlock();
    const app = await buildApp(async () => game);

    const { data } = (await get(app)).json();

    expect(data.meesh).toMatchObject({
      debitablePoints: 300,
      floorPoints: 0,
      mintCost: game.mint.price,
      baseMintCost: game.mint.basePrice,
      costFactor: game.mint.costFactor,
      missingPoints: game.mint.price - 300,
    });
    expect(data.meesh.mintCost).toBeLessThan(data.meesh.baseMintCost);
    await app.close();
  });

  it('sert la dette d\'étincelles dans level et meesh, et la frappe y est bloquée', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 90_000, sparksSincePrestige: 90_000, sparksDebt: 70 });
    const missions = new MissionService(db.prisma, { creditPoints: async () => undefined });
    const block = (await new GameBlockService(db.prisma, { missions }).build({ userId: USER }))!;
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', makePrisma({ ...ACCOUNT, engagementScore: 90_000, sparksSincePrestige: 90_000n, sparksDebt: 70n }));
    app.decorate('authenticate', async (req: FastifyRequest) => {
      (req as any).auth = { userId: USER, isAuthenticated: true };
    });
    await app.register(meEngagementRoutes, { prefix: '/api/v1/me', gameBlock: async () => block });
    await app.ready();

    const { data } = (await get(app)).json();

    expect(data.level.sparksDebt).toBe(70);
    expect(data.meesh).toMatchObject({ sparksDebt: 70, blockedBy: 'debt' });
    expect(data.game.mint).toMatchObject({ canMint: false, blockedBy: 'debt', sparksDebt: 70 });
    await app.close();
  });

  it('sans le bloc game (jeu en panne), le prix effectif reste servi', async () => {
    const app = await buildApp(async () => null);

    const { data } = (await get(app)).json();

    expect(data.meesh.mintCost).toBeLessThan(1221);
    expect(data.meesh.baseMintCost).toBe(1221);
    expect(data.meesh.debitablePoints).toBe(300);
    // Le facteur de la LOI (#10894), jamais le rapport de deux prix arrondis : 300 étincelles, niveau 1, 0,505.
    expect(data.meesh.costFactor).toBe(0.505);
    await app.close();
  });

  it('le bloc game sert les mêmes étincelles et les réserves du trésor', async () => {
    const app = await buildApp(async () => realBlock());

    const { data } = (await get(app)).json();
    const game = parseGameBlock(data.game);

    expect(game?.level).toMatchObject({ sparks: 300, sparksCycle: 9000, sparksLifetime: 5_000_000_000, levelMaxLifetime: 52 });
    expect(game?.treasury.access?.find((a) => a.key === 'coffre')).toMatchObject({ locked: true });
    await app.close();
  });

  it('CONTRAT : la charge reste valide à la garde de frontière des clients publiés', async () => {
    const app = await buildApp(async () => realBlock());

    expect(isEngagementProgressPayload((await get(app)).json().data)).toBe(true);
    await app.close();
  });
});
