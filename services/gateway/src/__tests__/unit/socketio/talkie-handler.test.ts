/**
 * #13935 — le câblage de la porte socket du talkie (contre-audit #14459, F5) : un invité
 * est refusé, un relais par `io`, la coupure fermée quand le cache partagé attendu est
 * injoignable, le limiteur qui suit le client Redis, la présence demandée avec le rôle.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

const cacheState = { available: true, client: 'redis-A' as unknown, cut: null as string | null };
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    get: async () => cacheState.cut,
    isAvailable: () => cacheState.available,
    getNativeClient: () => cacheState.client,
  }),
}));

const limiterClients: unknown[] = [];
jest.mock('../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: (_config: unknown, client: unknown) => {
    limiterClients.push(client);
    return { consume: async () => ({ limit: 30, remaining: 29, reset: 0 }) };
  },
}));

const resolveForTarget = jest.fn(async (_viewer: unknown, _target: unknown) => ({ showOnline: true, showLastSeenTimestamp: true }));
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTarget }),
}));

type GateDeps = { presenceServed: (viewer: { userId: string; role: string }, targetId: string) => Promise<boolean> };
const judgeTalkie = jest.fn(async (deps: GateDeps) => {
  await deps.presenceServed({ userId: FROM, role: 'ADMIN' }, TO);
  return { ok: true } as const;
});
jest.mock('../../../services/talkie/talkieGate', () => ({
  ...(jest.requireActual('../../../services/talkie/talkieGate') as object),
  judgeTalkie: (deps: GateDeps) => judgeTalkie(deps),
}));

import { listenTalkie, talkieHandlerDeps } from '../../../socketio/handlers/TalkieHandler';

const FROM = '507f1f77bcf86cd799439011';
const TO = '507f1f77bcf86cd799439022';

function fakeIo() {
  const emissions: Array<{ room: string; event: string }> = [];
  return {
    emissions,
    io: {
      to: (room: string) => ({ emit: (event: string) => { emissions.push({ room, event }); } }),
      in: () => ({ fetchSockets: async () => [{}] }),
    },
  };
}

function fakeSocket(id: string) {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    id,
    on: (event: string, listener: (...args: unknown[]) => void) => { handlers.set(event, listener); },
    start: (payload: unknown) => new Promise<Record<string, unknown>>((resolve) => handlers.get('talkie:start')!(payload, resolve)),
  };
}

const depsFor = (io: object, users: Record<string, { isAnonymous: boolean }>) =>
  talkieHandlerDeps({
    prisma: {} as never,
    io: io as never,
    socketToUser: new Map(Object.keys(users).map((userId) => [`sock-${userId}`, userId])),
    connectedUsers: new Map(Object.entries(users)),
  });

beforeEach(() => {
  cacheState.available = true;
  cacheState.client = 'redis-A';
  cacheState.cut = null;
  limiterClients.length = 0;
  jest.clearAllMocks();
});
afterEach(() => { delete process.env.REDIS_URL; });

describe('TalkieHandler — le câblage', () => {
  it('un invité (participant anonyme) est refusé : TALKIE_NOT_ALLOWED, la porte n’est même pas jugée', async () => {
    const { io } = fakeIo();
    const deps = depsFor(io, { [FROM]: { isAnonymous: true } });
    const socket = fakeSocket(`sock-${FROM}`);
    listenTalkie(socket, deps);

    expect(await socket.start({ toUserId: TO, codec: 'aac-adts' })).toMatchObject({ success: false, code: 'TALKIE_NOT_ALLOWED' });
    expect(judgeTalkie).not.toHaveBeenCalled();
  });

  it('une socket inconnue est refusée de même', async () => {
    const { io } = fakeIo();
    const socket = fakeSocket('sock-inconnue');
    listenTalkie(socket, depsFor(io, {}));

    expect(await socket.start({ toUserId: TO, codec: 'aac-adts' })).toMatchObject({ success: false, code: 'TALKIE_NOT_ALLOWED' });
  });

  it('un seul relais par io : un second appel rend le même', () => {
    const { io } = fakeIo();
    expect(depsFor(io, {}).relay).toBe(depsFor(io, {}).relay);
  });

  it('REDIS_URL posé et cache partagé injoignable : l’ouverture est refusée (TALKIE_UNAVAILABLE)', async () => {
    process.env.REDIS_URL = 'redis://staging';
    cacheState.available = false;
    const { io, emissions } = fakeIo();
    const socket = fakeSocket(`sock-${FROM}`);
    listenTalkie(socket, depsFor(io, { [FROM]: { isAnonymous: false } }));

    expect(await socket.start({ toUserId: TO, codec: 'aac-adts' })).toMatchObject({ success: false, code: 'TALKIE_UNAVAILABLE' });
    expect(emissions).toEqual([]);
  });

  it('sans REDIS_URL, le repli mémoire n’empêche pas d’ouvrir', async () => {
    cacheState.available = false;
    const { io } = fakeIo();
    const socket = fakeSocket(`sock-${FROM}`);
    listenTalkie(socket, depsFor(io, { [FROM]: { isAnonymous: false } }));

    expect(await socket.start({ toUserId: TO, codec: 'aac-adts' })).toMatchObject({ success: true });
  });

  it('le limiteur suit le client Redis du moment : un client qui change recrée le limiteur', async () => {
    const { io } = fakeIo();
    const deps = depsFor(io, { [FROM]: { isAnonymous: false } });
    const socket = fakeSocket(`sock-${FROM}`);
    listenTalkie(socket, deps);
    await socket.start({ toUserId: TO, codec: 'aac-adts' });
    await socket.start({ toUserId: TO, codec: 'aac-adts' });
    cacheState.client = 'redis-B';
    await socket.start({ toUserId: TO, codec: 'aac-adts' });

    expect(limiterClients).toEqual(['redis-A', 'redis-B']);
    deps.relay.dispose();
  });

  it('la présence est demandée pour l’émetteur, avec le rôle lu par la porte', async () => {
    const { io } = fakeIo();
    const deps = depsFor(io, { [FROM]: { isAnonymous: false } });
    const socket = fakeSocket(`sock-${FROM}`);
    listenTalkie(socket, deps);
    await socket.start({ toUserId: TO, codec: 'aac-adts' });

    expect(resolveForTarget).toHaveBeenCalledWith({ userId: FROM, role: 'ADMIN' }, { id: TO });
    deps.relay.dispose();
  });
});
