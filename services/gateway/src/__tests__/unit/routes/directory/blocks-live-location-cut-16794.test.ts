/**
 * #16794 — la route de blocage coupe le partage de position EN COURS entre les
 * deux comptes, comme elle coupe déjà le talkie et le Bring. Ce que la coupure
 * fait dans le registre des partages a son témoin dans
 * `LocationHandler.blockCut.test.ts` ; ce témoin garde l'APPEL, sur la route
 * canonique comme sur l'alias historique, et seulement sur un blocage.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

const mockCutLiveLocations = jest.fn<(params: { blockerId: string; blockedId: string }) => Promise<void>>(async () => undefined);

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

jest.mock('../../../../services/liveLocation/liveLocationCut', () => ({
  cutLiveLocationsOnBlock: (params: { blockerId: string; blockedId: string }) => mockCutLiveLocations(params),
}));

import { directoryBlocksRoutes } from '../../../../routes/directory/blocks';
import { blockUser, unblockUser } from '../../../../routes/users/blocking';

const MOI = '507f1f77bcf86cd799439099';
const CIBLE = '507f1f77bcf86cd799439011';

async function monter(bloques: readonly string[] = []) {
  const etat = { bloques: [...bloques] };
  const io = { to: () => ({ emit: () => undefined }) };
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
  return app;
}

describe('#16794 — bloquer coupe la position en direct entre les deux', () => {
  it('PUT /directory/blocks/:id coupe le partage de la paire', async () => {
    mockCutLiveLocations.mockClear();
    const app = await monter();
    const res = await app.inject({ method: 'PUT', url: `/api/v1/directory/blocks/${CIBLE}` });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(mockCutLiveLocations).toHaveBeenCalledWith({ blockerId: MOI, blockedId: CIBLE });
  });

  it('l’alias historique POST /users/:id/block coupe de même', async () => {
    mockCutLiveLocations.mockClear();
    const app = await monter();
    await app.inject({ method: 'POST', url: `/api/v1/users/${CIBLE}/block` });
    await app.close();

    expect(mockCutLiveLocations).toHaveBeenCalledWith({ blockerId: MOI, blockedId: CIBLE });
  });

  it('une coupure qui échoue ne fait pas échouer le blocage écrit', async () => {
    mockCutLiveLocations.mockClear();
    mockCutLiveLocations.mockImplementationOnce(async () => { throw new Error('fetchSockets timeout'); });
    const app = await monter();
    const res = await app.inject({ method: 'PUT', url: `/api/v1/directory/blocks/${CIBLE}` });
    await app.close();

    expect(res.statusCode).toBe(200);
  });

  it('débloquer ne coupe rien', async () => {
    mockCutLiveLocations.mockClear();
    const app = await monter([CIBLE]);
    await app.inject({ method: 'DELETE', url: `/api/v1/directory/blocks/${CIBLE}` });
    await app.close();

    expect(mockCutLiveLocations).not.toHaveBeenCalled();
  });
});
