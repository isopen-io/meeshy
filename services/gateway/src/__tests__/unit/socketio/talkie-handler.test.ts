/**
 * #13935 — le câblage de la porte socket du talkie (contre-audit #14459, F5) : un invité
 * est refusé, un relais par `io`, la coupure fermée quand le cache partagé attendu est
 * injoignable, le limiteur qui suit le client Redis, la présence demandée avec le rôle.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockLogger = { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => mockLogger },
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
type GateVerdict = { ok: true } | { ok: false; code: string; message: string; cause: string };
const judgeTalkie = jest.fn(async (deps: GateDeps): Promise<GateVerdict> => {
  await deps.presenceServed({ userId: FROM, role: 'ADMIN' }, TO);
  return { ok: true };
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

describe('#17131 — un refus de la porte laisse une ligne de journal', () => {
  it('le refus est journalisé avec son code, sa cause et la paire ; la cause ne part pas au client', async () => {
    judgeTalkie.mockResolvedValueOnce({ ok: false, code: 'TALKIE_FALLBACK_VOICE', message: 'Envoie un message vocal', cause: 'not-connected' });
    const { io } = fakeIo();
    const socket = fakeSocket(`sock-${FROM}`);
    listenTalkie(socket, depsFor(io, { [FROM]: { isAnonymous: false } }));

    const ack = await socket.start({ toUserId: TO, codec: 'aac-adts' });

    expect(ack).toEqual({ success: false, error: 'Envoie un message vocal', code: 'TALKIE_FALLBACK_VOICE' });
    expect(mockLogger.info).toHaveBeenCalledWith('[TALKIE_REFUSED]', { code: 'TALKIE_FALLBACK_VOICE', cause: 'not-connected', fromUserId: FROM, toUserId: TO });
  });

  it('une porte ouverte ne journalise aucun refus', async () => {
    const { io } = fakeIo();
    const socket = fakeSocket(`sock-${FROM}`);
    listenTalkie(socket, depsFor(io, { [FROM]: { isAnonymous: false } }));

    await socket.start({ toUserId: TO, codec: 'aac-adts' });

    expect(mockLogger.info).not.toHaveBeenCalledWith('[TALKIE_REFUSED]', expect.anything());
  });
});

describe('#17142 — talkie:join et le réveil', () => {
  const joinSocket = (id: string) => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    return {
      id,
      on: (event: string, listener: (...args: unknown[]) => void) => { handlers.set(event, listener); },
      emit: (event: string, payload: unknown) => handlers.get(event)?.(payload),
    };
  };
  const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

  it('la porte reçoit le canal de réveil du destinataire (wakeChannel)', async () => {
    const seen: unknown[] = [];
    judgeTalkie.mockImplementationOnce(async (deps: GateDeps) => { seen.push((deps as GateDeps & { wakeChannel?: unknown }).wakeChannel); return { ok: true }; });
    const { io } = fakeIo();
    const deps = depsFor(io, { [FROM]: { isAnonymous: false } });
    const socket = fakeSocket(`sock-${FROM}`);
    listenTalkie(socket, deps);
    await socket.start({ toUserId: TO, codec: 'aac-adts' });

    expect(typeof seen[0]).toBe('function');
    deps.relay.dispose();
  });

  it('un invité ne rejoint rien ; un inscrit rejoint par le relais', async () => {
    const { io } = fakeIo();
    const deps = depsFor(io, { [TO]: { isAnonymous: false }, [FROM]: { isAnonymous: true } });
    const join = jest.spyOn(deps.relay, 'join');
    const guest = joinSocket(`sock-${FROM}`);
    const member = joinSocket(`sock-${TO}`);
    listenTalkie(guest, deps);
    listenTalkie(member, deps);

    guest.emit('talkie:join', { talkieId: 'a'.repeat(24) });
    member.emit('talkie:join', { talkieId: 'a'.repeat(24) });
    await flush();

    expect(join).toHaveBeenCalledTimes(1);
    expect(join).toHaveBeenCalledWith(`sock-${TO}`, TO, { talkieId: 'a'.repeat(24) });
  });

  it('une voix inconnue ici est relayée aux autres instances avec l’identité AUTHENTIFIÉE ; celles-ci la rejoignent', async () => {
    const relayed: unknown[] = [];
    const listeners = new Map<string, (payload: unknown) => void>();
    const { io } = fakeIo();
    const withAdapter = {
      ...io,
      serverSideEmit: (event: string, payload: unknown) => { relayed.push({ event, payload }); },
      on: (event: string, listener: (payload: unknown) => void) => { listeners.set(event, listener); },
    };
    const deps = depsFor(withAdapter, { [TO]: { isAnonymous: false } });
    const member = joinSocket(`sock-${TO}`);
    listenTalkie(member, deps);

    member.emit('talkie:join', { talkieId: 'a'.repeat(24), userId: FROM });
    await flush();

    expect(relayed).toEqual([{ event: 'talkie:join-relay', payload: { socketId: `sock-${TO}`, userId: TO, talkieId: 'a'.repeat(24) } }]);
    const join = jest.spyOn(deps.relay, 'join');
    listeners.get('talkie:join-relay')?.({ socketId: 'remote-sock', userId: TO, talkieId: 'b'.repeat(24) });
    listeners.get('talkie:join-relay')?.({ socketId: 'remote-sock', userId: 'pas-un-id', talkieId: 'b'.repeat(24) });
    expect(join).toHaveBeenCalledTimes(1);
    expect(join).toHaveBeenCalledWith('remote-sock', TO, { talkieId: 'b'.repeat(24) });
  });
});
