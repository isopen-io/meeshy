/**
 * UN BLOCAGE ANNULE LA CONNAISSANCE NÉE TOUTE SEULE (#13932, REL-02) — au moment
 * où il est posé, pas seulement quand le rattrapage repasse sur la paire : une
 * paire qui n'a plus échangé depuis la semaine glissante n'est jamais relue par
 * lui, et la Connaissance renaîtrait au déblocage.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import { pairInteractionStore } from '../../../helpers/pair-interaction-store';

jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ del: jest.fn(async () => undefined) }),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(async (args: { op: () => Promise<unknown> }) => args.op()),
}));

import { directoryBlocksRoutes } from '../../../../routes/directory/blocks';

const LOW = '5f0000000000000000000001';
const HIGH = '5f0000000000000000000002';
const ADULT = new Date('1990-01-01T00:00:00Z');

const settle = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const relation = (over: Record<string, unknown>) => ({
  id: 'aa0000000000000000000099', userLowId: LOW, userHighId: HIGH,
  levelSince: new Date('2026-08-01T00:00:00Z'), transitions: [], ...over,
});

async function block(relations: unknown[]) {
  const store = pairInteractionStore({
    users: [
      { id: LOW, birthDate: ADULT, blockedUserIds: [] },
      { id: HIGH, birthDate: ADULT, blockedUserIds: [] },
    ] as never,
    relations: relations as never,
  });
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', store.prisma as never);
  app.decorate('authenticate', async (req: unknown) => {
    (req as { authContext: unknown }).authContext = {
      isAuthenticated: true, type: 'user', userId: LOW, registeredUser: { id: LOW, role: 'USER' },
    };
  });
  await app.register(directoryBlocksRoutes, { prefix: '/api/v1/directory' });
  await app.ready();
  const response = await app.inject({ method: 'PUT', url: `/api/v1/directory/blocks/${HIGH}` });
  await settle();
  await app.close();
  return { status: response.statusCode, relations: store.relations() };
}

describe('PUT /directory/blocks/:userId — la Connaissance automatique ne survit pas au blocage', () => {
  it('défait en silence une Connaissance née toute seule, même sans échange récent', async () => {
    const { status, relations } = await block([
      relation({ grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE', origin: 'auto-acquaintance' }),
    ]);
    expect(status).toBe(200);
    expect(relations[0]).toMatchObject({ grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC' });
  });

  it('ne touche pas un lien monté par une demande acceptée', async () => {
    const { status, relations } = await block([
      relation({ grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND', origin: 'request' }),
    ]);
    expect(status).toBe(200);
    expect(relations[0]).toMatchObject({ grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND' });
  });
});
