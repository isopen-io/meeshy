/**
 * #17043 (audit) — le câblage de production de la séance « ensemble » : un client Redis mort
 * ferme (jamais « trop de gestes »), et la fin à la déconnexion attend la grâce puis relit la room.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';

const store = new Map<string, string>();
const native: { client: { status: string } | null } = { client: null };

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
  await indexTogetherUsers(cache, seance(), 3600);
  return cache;
};

afterEach(() => {
  store.clear();
  native.client = null;
  delete process.env.RATE_LIMIT_DISABLED;
});

describe('un client Redis mort', () => {
  it('le limiteur ne sait pas juger (null) : la porte rend « indisponible », pas « trop de gestes »', async () => {
    native.client = { status: 'end' };
    expect(await monde(async () => undefined).deps.withinRate(HOTE)).toBeNull();
  });

  it('la prise de l\'index de paire échoue au lieu de basculer en mémoire locale', async () => {
    native.client = { status: 'reconnecting' };
    const { claimPair } = togetherRelayDepsOf({ prisma: {} as PrismaClient, io: undefined });
    await expect(claimPair?.('together:pair:x', ID, 120)).rejects.toThrow();
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
