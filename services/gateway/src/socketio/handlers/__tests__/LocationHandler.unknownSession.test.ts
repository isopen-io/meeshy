/**
 * UNE SESSION INCONNUE DU REGISTRE NE RELIT PAS LA BASE À CHAQUE POINT (#16791).
 *
 * Après un redémarrage de la passerelle, chaque partage encore en cours tombe
 * dans le chemin « session inconnue » pour tout son reste de vie — jusqu'à huit
 * heures. Ce chemin payait deux lectures par point : la règle 5
 * (`refusesMinorInConversation`, #9927) et l'ensemble de blocage
 * (`getBlockRelatedUserIds`, #16745). Au plafond de `LOCATION_LIVE_UPDATE`
 * (120 points/minute), cela fait ~240 requêtes par minute et par partageur.
 *
 * Le témoin compte les lectures Prisma sur 120 points d'une même minute
 * d'horloge injectée : au plus une de chaque, puis une relecture la minute
 * suivante. La session n'est PAS reconstruite (l'en-tête du handler l'interdit).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockGetConnectedUser = jest.fn() as jest.Mock<any>;

jest.mock('../../utils/socket-helpers', () => ({
  getConnectedUser: (...args: unknown[]) => mockGetConnectedUser(...args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

jest.mock('../../../utils/socket-rate-limiter.js', () => ({
  getSocketRateLimiter: () => ({ checkLimit: async () => true }),
  SOCKET_RATE_LIMITS: {
    LOCATION_LIVE_START: {},
    LOCATION_LIVE_UPDATE: {},
    LOCATION_LIVE_STOP: {},
  },
}));

import { LocationHandler } from '../LocationHandler';
import type { Socket } from 'socket.io';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

const ALICE_SOCKET = 'socket-alice';
const ALICE = '507f1f77bcf86cd7994390a1';
const BOB_SOCKET = 'socket-bob';
const BOB = '507f1f77bcf86cd7994390b2';
const CONV_ID = '507f1f77bcf86cd799439011';
const OTHER_CONV_ID = '507f1f77bcf86cd799439022';
const LYON = { latitude: 45.764, longitude: 4.8357 };

type Emission = { target: string; except: readonly string[]; event: string };

function makeWorld({
  blocks = {} as Record<string, readonly string[]>,
  conversationType = 'group',
  birthDate = null as Date | null,
}: { blocks?: Record<string, readonly string[]>; conversationType?: string; birthDate?: Date | null } = {}) {
  const emissions: Emission[] = [];
  let blockReadsBroken = false;
  let clock = new Date('2026-11-08T10:00:00.000Z');

  const record = (target: string, except: readonly string[]): any => ({
    emit: (event: string) => emissions.push({ target, except, event }),
    except: (ids: string[]) => record(target, ids),
  });

  const conversationRead = jest.fn<any>().mockImplementation(async () => ({ type: conversationType }));
  const blockersRead = jest.fn<any>().mockImplementation(async ({ where }: any) => {
    if (blockReadsBroken) throw new Error('replica set election in progress');
    return Object.keys(blocks)
      .filter(id => (blocks[id] ?? []).includes(where.blockedUserIds.has))
      .map(id => ({ id }));
  });
  const userRead = jest.fn<any>().mockImplementation(async ({ where, select }: any) => {
    if (select?.birthDate) return { birthDate };
    if (blockReadsBroken) throw new Error('replica set election in progress');
    return { blockedUserIds: blocks[where.id] ?? [] };
  });

  const prisma = {
    participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'participant-1' }) },
    conversation: { findUnique: conversationRead },
    user: { findMany: blockersRead, findUnique: userRead },
  };

  const users = [
    { id: ALICE, isAnonymous: false, displayName: 'Alice' },
    { id: BOB, isAnonymous: false, displayName: 'Bob' },
  ];
  const handler = new LocationHandler({
    io: { to: (target: string) => record(target, []) } as any,
    prisma: prisma as any,
    connectedUsers: new Map(users.map(u => [u.id, u])),
    socketToUser: new Map([[ALICE_SOCKET, ALICE], [BOB_SOCKET, BOB]]),
    normalizeConversationId: jest.fn<any>(async (id: string) => id),
    engagement: null,
    now: () => clock,
  });

  const socket = (id: string): Socket => ({
    id,
    rooms: new Set([id, ROOMS.conversation(CONV_ID), ROOMS.conversation(OTHER_CONV_ID)]),
    emit: jest.fn(),
    to: (target: string) => record(target, []),
  } as unknown as Socket);

  return {
    handler,
    emissions,
    socket,
    reads: {
      conversationRead,
      blockersRead,
      birthDateReads: () => userRead.mock.calls.filter(([args]: any) => args?.select?.birthDate).length,
    },
    breakBlockReads: (broken: boolean) => { blockReadsBroken = broken; },
    advance: (ms: number) => { clock = new Date(clock.getTime() + ms); },
  };
}

const updated = (e: readonly Emission[]) => e.filter(x => x.event === SERVER_EVENTS.LOCATION_LIVE_UPDATED);

const points = async (world: ReturnType<typeof makeWorld>, socket: Socket, count: number, conversationId = CONV_ID) => {
  for (let i = 0; i < count; i += 1) {
    await world.handler.handleLiveLocationUpdate(socket, { ...LYON, conversationId });
    world.advance(400);
  }
};

describe('LocationHandler — une session inconnue amortit ses lectures sur une minute (#16791)', () => {
  beforeEach(() => {
    mockGetConnectedUser.mockImplementation((key: string, users: Map<string, any>) => {
      const user = users.get(key);
      return user ? { user, realUserId: user.id } : null;
    });
  });

  it('120 points dans la même minute ne lisent la règle 5 et le blocage qu\'UNE fois', async () => {
    const world = makeWorld();
    await points(world, world.socket(ALICE_SOCKET), 120);

    expect(updated(world.emissions)).toHaveLength(120);
    expect(world.reads.conversationRead).toHaveBeenCalledTimes(1);
    expect(world.reads.blockersRead).toHaveBeenCalledTimes(1);
  });

  it('la minute suivante relit les deux — un blocage posé entre-temps est pris en compte', async () => {
    const blocks: Record<string, readonly string[]> = {};
    const world = makeWorld({ blocks });
    const alice = world.socket(ALICE_SOCKET);
    await points(world, alice, 1);
    expect(updated(world.emissions)[0].except).toEqual([]);

    blocks[ALICE] = [BOB];
    world.advance(60_000);
    await points(world, alice, 1);

    expect(world.reads.conversationRead).toHaveBeenCalledTimes(2);
    expect(world.reads.blockersRead).toHaveBeenCalledTimes(2);
    expect(updated(world.emissions)[1].except).toContain(ROOMS.user(BOB));
  });

  it('un refus de la règle 5 est retenu lui aussi — un mineur dans Global ne relit pas à chaque point', async () => {
    const world = makeWorld({ conversationType: 'global', birthDate: new Date('2015-01-01') });
    await points(world, world.socket(ALICE_SOCKET), 120);

    expect(updated(world.emissions)).toEqual([]);
    expect(world.reads.conversationRead).toHaveBeenCalledTimes(1);
    expect(world.reads.birthDateReads()).toBe(1);
  });

  it('une lecture de blocage qui N\'A RIEN PROUVÉ n\'est pas retenue : rien ne part, le point suivant relit', async () => {
    const world = makeWorld();
    const alice = world.socket(ALICE_SOCKET);
    world.breakBlockReads(true);
    await points(world, alice, 3);
    expect(updated(world.emissions)).toEqual([]);
    expect(world.reads.blockersRead).toHaveBeenCalledTimes(3);

    world.breakBlockReads(false);
    await points(world, alice, 1);
    expect(updated(world.emissions)).toHaveLength(1);
  });

  it('le mémo est par (conversation, partageur) — un autre fil relit pour lui-même', async () => {
    const world = makeWorld();
    const alice = world.socket(ALICE_SOCKET);
    await points(world, alice, 5, CONV_ID);
    await points(world, alice, 5, OTHER_CONV_ID);
    await points(world, world.socket(BOB_SOCKET), 5, CONV_ID);

    expect(world.reads.conversationRead).toHaveBeenCalledTimes(3);
    expect(world.reads.blockersRead).toHaveBeenCalledTimes(3);
  });
});
