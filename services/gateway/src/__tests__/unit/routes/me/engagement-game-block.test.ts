/**
 * `GET /me/engagement` — le bloc `game` À CÔTÉ des champs actuels (#9378).
 *
 * Contrat de rétrocompatibilité (#9223) : un ancien serveur ne sert pas `game`,
 * le nouveau le sert sans toucher une seule clé existante, et la garde de
 * frontière des clients (`isEngagementProgressPayload`) accepte les DEUX formes.
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

function makePrisma(user: Record<string, unknown>, mints = 0) {
  return {
    user: { findUnique: jest.fn<any>().mockResolvedValue(user) },
    engagementCounter: { findMany: jest.fn<any>().mockResolvedValue([{ axisKey: 'content.text_message', count: 40, points: 120, updatedAt: new Date() }]) },
    engagementMilestone: { findMany: jest.fn<any>().mockResolvedValue([]) },
    meeshLedger: {
      aggregate: jest.fn<any>().mockImplementation(async (args: { _sum?: unknown }) =>
        args._sum ? { _sum: { delta: mints } } : { _min: { createdAt: null }, _max: { createdAt: null } },
      ),
      count: jest.fn<any>().mockResolvedValue(mints),
    },
  } as any;
}

async function buildApp(gameBlock?: GameBuilder, mints = 0): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma({ currentStreakDays: 3, longestStreakDays: 5, engagementScore: 120 }, mints));
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER, isAuthenticated: true };
  });
  await app.register(meEngagementRoutes, { prefix: '/api/v1/me', ...(gameBlock ? { gameBlock } : {}) });
  await app.ready();
  return app;
}

const get = (app: FastifyInstance) => app.inject({ method: 'GET', url: '/api/v1/me/engagement', headers: { 'x-test-user-id': USER } });

/** Un bloc RÉEL, assemblé par le service du jeu sur une base de test. */
const realBlock = async () => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: 4000, levelRecord: 20 });
  const missions = new MissionService(db.prisma, { creditPoints: async () => undefined });
  const block = await new GameBlockService(db.prisma, { missions }).build({ userId: USER });
  if (block === null) throw new Error('bloc invalide');
  return block;
};

describe('GET /me/engagement — le bloc game', () => {
  it('sert `game` à côté des champs actuels, qui restent inchangés', async () => {
    const game = await realBlock();
    const app = await buildApp(async () => game);

    const { data } = (await get(app)).json();

    expect(data.streak).toEqual({ currentStreakDays: 3, longestStreakDays: 5 });
    expect(data.level).toEqual({ engagementScore: 120 });
    expect(data.counters).toEqual([{ axisKey: 'content.text_message', count: 40, points: 120 }]);
    expect(parseGameBlock(data.game)).toEqual(game);
    await app.close();
  });

  it('CONTRAT : la charge ancienne (sans game) et la charge nouvelle passent la garde de frontière', async () => {
    const withGame = await buildApp(async () => realBlock());
    const withoutGame = await buildApp(async () => null);

    const nouvelle = (await get(withGame)).json().data;
    const ancienne = (await get(withoutGame)).json().data;

    expect(nouvelle.game).toBeDefined();
    expect('game' in ancienne).toBe(false);
    expect(isEngagementProgressPayload(nouvelle)).toBe(true);
    expect(isEngagementProgressPayload(ancienne)).toBe(true);
    await withGame.close();
    await withoutGame.close();
  });

  it('un bloc qui échoue ne prive pas l’écran du reste : la charge part sans `game`', async () => {
    const app = await buildApp(async () => {
      throw new Error('jeu en panne');
    });

    const res = await get(app);

    expect(res.statusCode).toBe(200);
    expect('game' in res.json().data).toBe(false);
    expect(res.json().data.level).toEqual({ engagementScore: 120 });
    await app.close();
  });

  it('le bloc se construit pour l’utilisateur AUTHENTIFIÉ, avec les compteurs déjà lus', async () => {
    const seen: { userId: string; counters: unknown }[] = [];
    const app = await buildApp(async (params) => {
      seen.push(params);
      return null;
    });

    await get(app);

    expect(seen).toEqual([{ userId: USER, counters: [{ axisKey: 'content.text_message', count: 40, points: 120 }] }]);
    await app.close();
  });

  it('`meesh.mintCost` sert le prix de la PROCHAINE pièce : la 11e coûte 1 294, pour les anciens clients aussi', async () => {
    const app = await buildApp(async () => null, 10);

    const { data } = (await get(app)).json();

    expect(data.meesh.mintCost).toBe(1294);
    await app.close();
  });
});
