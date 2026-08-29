/**
 * Les compteurs PRIVÉS d'un profil ne partent qu'à son propriétaire (#4161).
 *
 * `GET /users/:userId/stats` servait à **tout compte authentifié** les
 * compteurs privés de n'importe qui — `totalMessages`, `totalConversations`,
 * `totalTranslations`, `friendRequestsReceived` — sans filtre d'amitié ni
 * préférence de confidentialité.
 *
 * Mesuré en intégration, avec un viewer tiers :
 *   totalMessages = 69 · totalConversations = 12 · friendRequestsReceived = 0
 *
 * Ce ne sont pas des statistiques d'audience : combien de messages quelqu'un
 * écrit et dans combien de conversations il est présent décrivent son usage
 * intime du produit.
 *
 * ## Le témoin est posé sur un viewer AUTHENTIFIÉ et NON propriétaire
 *
 * C'est le cas exact d'aujourd'hui, et le seul qui distingue les deux
 * versions : un témoin anonyme passerait au vert sans rien prouver, la route
 * exigeant déjà un compte.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createDirectoryRouteRateLimitConfig: () => false,
}));

import { getUserStats } from '../../../../routes/users/preferences';

const PREFIXE = '/api/v1';
const PROPRIETAIRE = '507f1f77bcf86cd799439011';
const TIERS = '507f1f77bcf86cd799439022';

/** Ce qui décrit l'usage INTIME du produit — jamais pour un tiers. */
const PRIVES = ['totalMessages', 'totalConversations', 'totalTranslations', 'friendRequestsReceived'] as const;
/** Ce qui décrit une AUDIENCE — public par nature. */
const PUBLICS = ['postsCount', 'reelsCount', 'storiesCount', 'memberDays', 'achievements'] as const;

function buildApp() {
  const prisma = {
    user: {
      findFirst: jest.fn<any>(async () => ({
        id: PROPRIETAIRE,
        username: 'cible',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })),
    },
    message: {
      count: jest.fn<any>(async () => 69),
      groupBy: jest.fn<any>(async () => []),
      aggregateRaw: jest.fn<any>(async () => [{ n: 0 }]),
    },
    participant: { count: jest.fn<any>(async () => 12) },
    friendRequest: { count: jest.fn<any>(async () => 3) },
    post: { count: jest.fn<any>(async () => 7) },
    // Le handler compte les traductions par une commande brute : sans elle, le
    // double lève et le témoin mesure une panne de harnais, pas la garde.
    $runCommandRaw: jest.fn<any>(async () => ({ n: 0, cursor: { firstBatch: [] } })),
  };
  return prisma;
}

async function monter(prisma: unknown, viewerId: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: viewerId };
    req.authContext = {
      isAuthenticated: true,
      userId: viewerId,
      registeredUser: { id: viewerId, role: 'USER' },
    };
  });
  app.decorate('prisma', prisma as never);
  await app.register(async (i) => { await getUserStats(i); }, { prefix: PREFIXE });
  await app.ready();
  return app;
}

const lire = (app: FastifyInstance) =>
  app.inject({ method: 'GET', url: `${PREFIXE}/users/${PROPRIETAIRE}/stats` });

describe('Un TIERS authentifié ne voit pas les compteurs privés', () => {
  it('ne sert AUCUN des quatre compteurs privés', async () => {
    const app = await monter(buildApp(), TIERS);

    const res = await lire(app);

    expect(res.statusCode).toBe(200);
    const data = res.json().data ?? {};
    const fuites = PRIVES.filter((c) => c in data);
    expect(fuites).toEqual([]);

    await app.close();
  });

  it('sert bien les compteurs PUBLICS — resserrer ne doit pas vider', async () => {
    const app = await monter(buildApp(), TIERS);

    const data = (await lire(app)).json().data ?? {};

    for (const champ of PUBLICS) {
      expect(champ in data).toBe(true);
    }

    await app.close();
  });
});

describe('Le PROPRIÉTAIRE voit tout', () => {
  it('reçoit les quatre compteurs privés', async () => {
    const app = await monter(buildApp(), PROPRIETAIRE);

    const data = (await lire(app)).json().data ?? {};

    for (const champ of PRIVES) {
      expect(champ in data).toBe(true);
    }
    expect(data.totalMessages).toBe(69);

    await app.close();
  });
});
