/**
 * #19366 — bloquer ou débloquer quelqu'un PRÉVIENT MES AUTRES APPAREILS, et
 * jamais l'autre.
 *
 * Le web met en cache la liste des bloqués, iOS la fiche par cercle : sans
 * annonce, un second appareil du même compte gardait un profil non réduit
 * jusqu'à une relecture manuelle. L'annonce part vers la SEULE room de
 * l'acteur — un événement vers le bloqué lui apprendrait le blocage.
 *
 * Les coupures voisines (écoute, batterie, position, talkie, Bring, séance
 * « ensemble ») ont leurs propres témoins : elles sont neutralisées ici pour
 * que la liste des émissions ne contienne que celles de ce lot.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
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
jest.mock('../../../../services/nowPlaying/nowPlayingDeps', () => ({
  captureNowPlayingBefore: async () => new Map(),
  refreshNowPlayingAfter: async () => undefined,
}));
jest.mock('../../../../services/battery/batteryDeps', () => ({
  captureBatteryBefore: async () => new Map(),
  refreshBatteryAfter: async () => undefined,
}));
jest.mock('../../../../services/sharedLocation/sharedLocationDeps', () => ({
  captureSharedLocationBefore: async () => new Map(),
  refreshSharedLocationAfter: async () => undefined,
}));
jest.mock('../../../../services/together/togetherDeps', () => ({ rejudgeTogetherAfter: async () => undefined }));
jest.mock('../../../../services/relations/autoAcquaintance', () => ({ cancelAutoAcquaintanceOnBlock: () => undefined }));
jest.mock('../../../../services/relations/ritualShareWithdrawal', () => ({ withdrawRitualSharesBetween: async () => undefined }));
jest.mock('../../../../routes/bring', () => ({ stopBringsAfterUserBlock: () => undefined }));
jest.mock('../../../../services/talkie/talkieCut', () => ({
  cutTalkiesOnBlock: async () => undefined,
  talkieCutDepsOf: () => ({}),
}));

import { directoryBlocksRoutes } from '../../../../routes/directory/blocks';
import { blockUser, unblockUser } from '../../../../routes/users/blocking';

const MOI = '507f1f77bcf86cd799439099';
const CIBLE = '507f1f77bcf86cd799439011';
const NOW = new Date('2026-11-17T10:00:00.000Z');

type Emission = { room: string; event: string; payload: unknown };

async function monter(bloques: readonly string[] = []) {
  const etat = { bloques: [...bloques] };
  const emissions: Emission[] = [];
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => { emissions.push({ room, event, payload }); } }) };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    user: {
      findUnique: async (args: { where: { id: string } }) =>
        args.where.id === MOI ? { blockedUserIds: etat.bloques } : { id: args.where.id },
      update: async (args: { data: { blockedUserIds: { push?: string; set?: string[] } } }) => {
        const data = args.data.blockedUserIds;
        if (data.push) etat.bloques = [...etat.bloques, data.push];
        if (data.set) etat.bloques = [...data.set];
        return {};
      },
    },
  } as never);
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io }) } as never);
  app.decorate('authenticate', async (req: { authContext?: unknown }) => {
    req.authContext = { isAuthenticated: true, type: 'user', userId: MOI, registeredUser: { id: MOI, role: 'USER' } };
  });
  await app.register(directoryBlocksRoutes, { prefix: '/api/v1/directory' });
  await app.register(async (scope) => { await blockUser(scope); await unblockUser(scope); }, { prefix: '/api/v1' });
  await app.ready();
  return { app, emissions };
}

describe('#19366 — bloquer prévient mes autres appareils, jamais l’autre', () => {
  it('PUT /directory/blocks/:id : `user:blocked-by-me` vers MA seule room, avec l’identifiant de l’autre', async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    const { app, emissions } = await monter();
    const res = await app.inject({ method: 'PUT', url: `/api/v1/directory/blocks/${CIBLE}` });
    await app.close();
    jest.useRealTimers();

    expect(res.statusCode).toBe(200);
    expect(emissions).toEqual([{ room: `user:${MOI}`, event: 'user:blocked-by-me', payload: { userId: CIBLE, at: NOW.toISOString() } }]);
  });

  it('un blocage déjà posé se réannonce à mes appareils (rejeu qui converge), toujours sans l’autre', async () => {
    const { app, emissions } = await monter([CIBLE]);
    await app.inject({ method: 'PUT', url: `/api/v1/directory/blocks/${CIBLE}` });
    await app.close();

    expect(emissions.map((e) => [e.room, e.event])).toEqual([[`user:${MOI}`, 'user:blocked-by-me']]);
  });

  it('l’alias historique POST /users/:id/block annonce de même', async () => {
    const { app, emissions } = await monter();
    await app.inject({ method: 'POST', url: `/api/v1/users/${CIBLE}/block` });
    await app.close();

    expect(emissions.map((e) => [e.room, e.event])).toEqual([[`user:${MOI}`, 'user:blocked-by-me']]);
  });

  it('un refus (se bloquer soi-même) n’annonce rien', async () => {
    const { app, emissions } = await monter();
    await app.inject({ method: 'PUT', url: `/api/v1/directory/blocks/${MOI}` });
    await app.close();

    expect(emissions).toEqual([]);
  });

  it('la charge ne porte que l’identifiant et l’heure : ni nom, ni avatar, ni présence', async () => {
    const { app, emissions } = await monter();
    await app.inject({ method: 'PUT', url: `/api/v1/directory/blocks/${CIBLE}` });
    await app.close();

    expect(emissions.map((e) => Object.keys(e.payload as object).sort())).toEqual([['at', 'userId']]);
  });
});

describe('#19366 — débloquer prévient mes autres appareils, jamais l’autre', () => {
  it('DELETE /directory/blocks/:id : `user:unblocked-by-me` vers MA seule room', async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    const { app, emissions } = await monter([CIBLE]);
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/directory/blocks/${CIBLE}` });
    await app.close();
    jest.useRealTimers();

    expect(res.statusCode).toBe(200);
    expect(emissions).toEqual([{ room: `user:${MOI}`, event: 'user:unblocked-by-me', payload: { userId: CIBLE, at: NOW.toISOString() } }]);
  });

  it('l’alias historique DELETE /users/:id/block annonce de même', async () => {
    const { app, emissions } = await monter([CIBLE]);
    await app.inject({ method: 'DELETE', url: `/api/v1/users/${CIBLE}/block` });
    await app.close();

    expect(emissions.map((e) => [e.room, e.event])).toEqual([[`user:${MOI}`, 'user:unblocked-by-me']]);
  });

  it('débloquer quelqu’un qui ne l’était pas (404) n’annonce rien', async () => {
    const { app, emissions } = await monter();
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/directory/blocks/${CIBLE}` });
    await app.close();

    expect(res.statusCode).toBe(404);
    expect(emissions).toEqual([]);
  });
});
