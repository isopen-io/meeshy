/**
 * #17043 (audit) — le câblage de production de la séance « ensemble » : un client Redis mort
 * ferme (jamais « trop de gestes »), et la fin à la déconnexion attend la grâce puis relit la room.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';

const store = new Map<string, string>();
const set = jest.fn(async (..._args: unknown[]) => 'OK');
const evalScript = jest.fn(async (..._args: unknown[]) => 1);
const native: { client: { status: string; set: typeof set; eval: typeof evalScript } | null } = { client: null };
const clientAt = (status: string) => ({ status, set, eval: evalScript });

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => void store.set(key, value),
    del: async (key: string) => void store.delete(key),
    getNativeClient: () => native.client,
  }),
}));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { togetherHandlerDeps } from '../../../../socketio/handlers/TogetherHandler';
import { togetherRelayDepsOf } from '../../../../services/together/togetherDeps';
import { indexTogetherUsers, readTogether, storeTogether, type TogetherSession } from '../../../../services/together/togetherStore';

const HOTE = '6300000000000000000000a1';
const PROCHE = '6300000000000000000000c1';
const ID = '0123456789abcdef0123456789abcdef';

const seance = (): TogetherSession => ({
  sessionId: ID,
  hostId: HOTE,
  guestId: PROCHE,
  conversationId: '6300000000000000000000aa',
  attachmentId: '63000000000000000000a001',
  media: 'video',
  joined: true,
  playback: { playing: false, positionMs: 0, at: Date.now(), rev: 0, byUserId: HOTE },
  createdAt: Date.now(),
  expiresAt: Date.now() + 3_600_000,
});

function monde(wait: () => Promise<void>) {
  const room: object[] = [];
  const fetched: string[] = [];
  const emitted: string[] = [];
  const io = {
    in: (name: string) => ({
      fetchSockets: async () => {
        fetched.push(name);
        return room as never;
      },
    }),
    to: () => ({ emit: (event: string) => void emitted.push(event) }),
  };
  const deps = togetherHandlerDeps({
    prisma: {} as PrismaClient,
    io: io as never,
    socketToUser: new Map(),
    connectedUsers: new Map(),
    wait,
  });
  return { deps, room, fetched, emitted };
}

const poser = async () => {
  const cache = togetherRelayDepsOf({ prisma: {} as PrismaClient, io: undefined }).cache;
  await storeTogether(cache, seance(), 3600);
  await indexTogetherUsers(cache, seance());
  return cache;
};

afterEach(() => {
  store.clear();
  native.client = null;
  set.mockClear();
  evalScript.mockClear();
  delete process.env.RATE_LIMIT_DISABLED;
});

describe('un client Redis mort', () => {
  it('le limiteur ne sait pas juger (null) : la porte rend « indisponible », pas « trop de gestes »', async () => {
    native.client = clientAt('end');
    expect(await monde(async () => undefined).deps.withinRate(HOTE)).toBeNull();
  });

  it.each(['end', 'reconnecting', 'connecting'])('statut %s : prise, prolongation et libération de l\'index échouent, sans toucher le client', async (status) => {
    native.client = clientAt(status);
    const { claimPair, extendPair, releasePair } = togetherRelayDepsOf({ prisma: {} as PrismaClient, io: undefined });
    await expect(claimPair?.('together:pair:x', ID, 120)).rejects.toThrow();
    await expect(extendPair?.('together:pair:x', ID, 120)).rejects.toThrow();
    await expect(releasePair?.('together:pair:x', ID)).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
    expect(evalScript).not.toHaveBeenCalled();
  });

  it('prêt : la prise est un SET EX GET, la prolongation et la libération des scripts gardés', async () => {
    native.client = clientAt('ready');
    const { claimPair, extendPair, releasePair } = togetherRelayDepsOf({ prisma: {} as PrismaClient, io: undefined });
    await claimPair?.('together:pair:x', ID, 120);
    await extendPair?.('together:pair:x', ID, 120);
    await releasePair?.('together:pair:x', ID);
    expect(set).toHaveBeenCalledWith('together:pair:x', ID, 'EX', 120, 'GET');
    expect(evalScript).toHaveBeenCalledTimes(2);
  });
});

describe('la fin à la déconnexion attend la grâce', () => {
  it('un compte sans séance ne coûte qu\'un GET : la room n\'est jamais lue', async () => {
    const m = monde(async () => undefined);
    await m.deps.userGone(HOTE);
    expect(m.fetched).toEqual([]);
  });

  it('reconnexion pendant la grâce : la séance reste intacte', async () => {
    const cache = await poser();
    const m = monde(async () => void m.room.push({}));
    await m.deps.userGone(PROCHE);
    expect(await readTogether(cache, ID, Date.now())).not.toBeNull();
    expect(m.emitted).toEqual([]);
  });

  it('aucune reconnexion : la séance finit chez les deux', async () => {
    const cache = await poser();
    const attentes: number[] = [];
    const m = monde(async () => void attentes.push(1));
    await m.deps.userGone(PROCHE);
    expect(attentes).toHaveLength(1);
    expect(await readTogether(cache, ID, Date.now())).toBeNull();
    expect(m.emitted).toEqual([SERVER_EVENTS.TOGETHER_ENDED, SERVER_EVENTS.TOGETHER_ENDED]);
    expect(m.fetched).toEqual([ROOMS.user(PROCHE), ROOMS.user(PROCHE)]);
  });

  it('un autre appareil encore connecté : aucune attente, aucune fin', async () => {
    const cache = await poser();
    const attentes: number[] = [];
    const m = monde(async () => void attentes.push(1));
    m.room.push({});
    await m.deps.userGone(PROCHE);
    expect(attentes).toEqual([]);
    expect(await readTogether(cache, ID, Date.now())).not.toBeNull();
  });
});
