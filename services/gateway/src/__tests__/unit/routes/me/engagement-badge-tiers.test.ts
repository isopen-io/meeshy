/**
 * LES PALIERS 1 000 ET 5 000 DES BADGES (#9392) — additifs et rétrocompatibles :
 * un ancien client ne les reçoit pas, un client de la vague 2 (en-tête
 * `X-Meeshy-Game-Version: 2`) les reçoit ; les autres jalons ne bougent jamais.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyRequest } from 'fastify';
import { meEngagementRoutes } from '../../../../routes/me/engagement';
import { badgeThresholdOfKey, knowsGameWave2, milestonesServedTo } from '../../../../services/game/clientCapabilities';
import { USER } from '../../../../services/game/__tests__/fakeGameDb';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const at = new Date('2026-10-01T00:00:00Z');
const MILESTONES = [
  { milestoneType: 'badge', milestoneKey: 'content.text_message:500', reachedAt: at },
  { milestoneType: 'badge', milestoneKey: 'content.text_message:1000', reachedAt: at },
  { milestoneType: 'badge', milestoneKey: 'tool.reaction:5000', reachedAt: at },
  { milestoneType: 'level', milestoneKey: 'level:1000', reachedAt: at },
  { milestoneType: 'streak', milestoneKey: 'streak:100', reachedAt: at },
];

async function buildApp() {
  const prisma = {
    user: { findUnique: jest.fn<any>().mockResolvedValue({ currentStreakDays: 1, longestStreakDays: 1, engagementScore: 10 }) },
    engagementCounter: { findMany: jest.fn<any>().mockResolvedValue([]) },
    engagementMilestone: { findMany: jest.fn<any>().mockResolvedValue(MILESTONES) },
    meeshLedger: {
      aggregate: jest.fn<any>().mockImplementation(async (args: { _sum?: unknown }) => (args._sum ? { _sum: { delta: 0 } } : { _min: { createdAt: null }, _max: { createdAt: null } })),
      count: jest.fn<any>().mockResolvedValue(0),
    },
  } as any;
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER, isAuthenticated: true };
  });
  await app.register(meEngagementRoutes, { prefix: '/api/v1/me', gameBlock: async () => null });
  await app.ready();
  return app;
}

const keysOf = async (headers: Record<string, string>) => {
  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/api/v1/me/engagement', headers });
  await app.close();
  return (res.json().data.milestones as { milestoneKey: string }[]).map((m) => m.milestoneKey);
};

describe('GET /me/engagement — les paliers étendus des badges', () => {
  it('un client sans en-tête (ancien) ne reçoit pas 1 000 ni 5 000, mais garde tout le reste', async () => {
    expect(await keysOf({})).toEqual(['content.text_message:500', 'level:1000', 'streak:100']);
  });

  it('un client de la vague 2 les reçoit', async () => {
    expect(await keysOf({ 'x-meeshy-game-version': '2' })).toEqual([
      'content.text_message:500',
      'content.text_message:1000',
      'tool.reaction:5000',
      'level:1000',
      'streak:100',
    ]);
  });

  it('une version illisible ou inférieure retombe sur l’ancien comportement', async () => {
    expect(await keysOf({ 'x-meeshy-game-version': 'beaucoup' })).toHaveLength(3);
    expect(await keysOf({ 'x-meeshy-game-version': '1' })).toHaveLength(3);
  });
});

describe('clientCapabilities', () => {
  it('knowsGameWave2 lit un entier de 2 ou plus, et rien d’autre', () => {
    expect(knowsGameWave2({ 'x-meeshy-game-version': '2' })).toBe(true);
    expect(knowsGameWave2({ 'x-meeshy-game-version': '3' })).toBe(true);
    expect(knowsGameWave2({ 'x-meeshy-game-version': ['2'] })).toBe(true);
    expect(knowsGameWave2({ 'x-meeshy-game-version': '' })).toBe(false);
    expect(knowsGameWave2({})).toBe(false);
  });

  it('un jalon dont la clé ne porte pas un palier de badge n’est jamais filtré', () => {
    expect(badgeThresholdOfKey('content.text_message:1000')).toBe(1000);
    expect(badgeThresholdOfKey('streak:7')).toBeNull();
    expect(milestonesServedTo([{ milestoneType: 'badge', milestoneKey: 'x:weird' }], { knowsExtendedTiers: false })).toHaveLength(1);
  });
});
