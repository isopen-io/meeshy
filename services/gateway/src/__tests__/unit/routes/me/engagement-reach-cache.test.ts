/**
 * **La carte d'atteignabilité se mesure une fois par heure, pas une fois par
 * requête** (#7909).
 *
 * `AchievementReachService` tient un cache d'une heure — sur son INSTANCE.
 * La route en construisait une neuve à chaque `GET /me/engagement` : le cache
 * ne servait jamais, et chaque ouverture de l'écran (et chaque récapitulatif
 * d'onboarding) rejouait trois `groupBy` sur des collections ENTIÈRES, dont un
 * `participant.groupBy` filtré par relation (`conversation.type`) — un
 * `$lookup` par Participant de la base.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { meEngagementRoutes } from '../../../../routes/me/engagement';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

const USER_ID = '68a000000000000000000001';

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(async () => ({ currentStreakDays: 0, longestStreakDays: 0, engagementScore: 0 })),
      aggregate: jest.fn(async () => ({ _max: { longestStreakDays: 3, meeshMintedLifetime: 0 } })),
    },
    participant: { groupBy: jest.fn(async () => [{ _count: { _all: 4 } }]), findMany: jest.fn(async () => []) },
    communityMember: { groupBy: jest.fn(async () => []) },
    callParticipant: { groupBy: jest.fn(async () => []) },
    engagementCounter: { findMany: jest.fn(async () => []) },
    engagementMilestone: { findMany: jest.fn(async () => []) },
    meeshLedger: {
      aggregate: jest.fn(async (args: { _sum?: unknown }) =>
        args._sum ? { _sum: { delta: null } } : { _min: { createdAt: null }, _max: { createdAt: null } },
      ),
      count: jest.fn(async () => 0),
    },
  };
}

async function buildApp(prisma: ReturnType<typeof makePrisma>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    Object.assign(req, { auth: { userId: USER_ID, isAuthenticated: true } });
  });
  await app.register(meEngagementRoutes, { prefix: '/api/v1/me' });
  await app.ready();
  return app;
}

describe('GET /me/engagement — carte d’atteignabilité', () => {
  it('deux lectures successives ne la mesurent qu’UNE fois', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const first = await app.inject({ method: 'GET', url: '/api/v1/me/engagement' });
    const second = await app.inject({ method: 'GET', url: '/api/v1/me/engagement' });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(prisma.participant.groupBy).toHaveBeenCalledTimes(1);
    expect(second.json().data.achievementReach['conversation.join.size']).toBe(4);
    await app.close();
  });
});
