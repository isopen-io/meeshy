/**
 * #14924 — audit : un retrait des partages qui échoue ne doit pas empêcher le blocage
 * de couper le Bring et le talkie, ni rendre une erreur sur un blocage déjà écrit.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

const stopBrings = jest.fn();
const cutTalkies = jest.fn(async () => undefined);

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));
jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(async (args: { op: () => unknown }) => args.op()),
}));
jest.mock('../../../../services/CacheStore', () => ({
  ...(jest.requireActual('../../../../services/CacheStore') as object),
  getCacheStore: () => ({ del: jest.fn(async () => undefined) }),
}));
jest.mock('../../../../routes/bring', () => ({ stopBringsAfterUserBlock: (...a: unknown[]) => stopBrings(...a) }));
jest.mock('../../../../services/talkie/talkieCut', () => ({
  cutTalkiesOnBlock: (...a: unknown[]) => cutTalkies(...(a as [])),
  talkieCutDepsOf: () => ({}),
}));

import { directoryBlocksRoutes } from '../../../../routes/directory/blocks';
import { pairInteractionStore } from '../../../helpers/pair-interaction-store';

const MOI = '507f1f77bcf86cd799439011';
const AUTRE = '507f1f77bcf86cd799439022';
const ADULT = new Date('1990-01-01T00:00:00Z');

describe('#14924 audit — un retrait de partages en panne ne retient pas la coupure du blocage', () => {
  it('le Bring et le talkie sont coupés, et le blocage écrit répond 200', async () => {
    const store = pairInteractionStore({
      users: [
        { id: MOI, birthDate: ADULT, blockedUserIds: [] },
        { id: AUTRE, birthDate: ADULT, blockedUserIds: [] },
      ] as never,
      relations: [] as never,
    });
    const enPanne = { findUnique: jest.fn(async () => { throw new Error('mongo down'); }), updateMany: jest.fn(async () => { throw new Error('mongo down'); }) };
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', { ...store.prisma, relationFeatureSetting: enPanne } as never);
    app.decorate('authenticate', async (req: object) => {
      Object.assign(req, { user: { userId: MOI }, authContext: { isAuthenticated: true, type: 'user', userId: MOI, registeredUser: { id: MOI, role: 'USER' } } });
    });
    await app.register(directoryBlocksRoutes, { prefix: '/api/v1/directory' });
    await app.ready();
    const res = await app.inject({ method: 'PUT', url: `/api/v1/directory/blocks/${AUTRE}` });
    await app.close();

    expect(stopBrings).toHaveBeenCalled();
    expect(cutTalkies).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });
});
