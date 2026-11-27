/**
 * UN BLOCAGE COUPE LE PARTAGE DE POSITION EN COURS, À L'INSTANT (#16794).
 *
 * #16745 a fait du blocage un filtre d'annonce, rafraîchi par pas d'une minute.
 * `LOCATION_LIVE_UPDATE` plafonne à 120 points par minute : un blocage tombé
 * juste après un rafraîchissement laissait partir jusqu'à 120 positions
 * successives vers le pair bloqué, puis son épingle se figeait sur la dernière.
 *
 * La route de blocage appelle désormais `cutPair` : l'exclusion est posée sans
 * attendre le pas (ni relire la base), et chacun des deux reçoit le retrait de
 * l'épingle de l'autre — sur ses seules sockets présentes dans le fil.
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
  SOCKET_RATE_LIMITS: { LOCATION_LIVE_START: {}, LOCATION_LIVE_UPDATE: {}, LOCATION_LIVE_STOP: {} },
}));

import { LocationHandler } from '../LocationHandler';
import { cutLiveLocationsOnBlock } from '../../../services/liveLocation/liveLocationCut';
import type { Socket } from 'socket.io';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

const ALICE = '507f1f77bcf86cd7994390a1';
const BOB = '507f1f77bcf86cd7994390b2';
const CAROL = '507f1f77bcf86cd7994390c3';
const CONV_ID = '507f1f77bcf86cd799439011';
const OTHER_CONV_ID = '507f1f77bcf86cd799439022';
const ROOM = ROOMS.conversation(CONV_ID);

const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const LYON = { latitude: 45.764, longitude: 4.8357 };

type Emission = { target: string; except: readonly string[]; event: string; data: unknown };

function makeWorld() {
  const blocks: Record<string, readonly string[]> = {};
  const emissions: Emission[] = [];
  const roomsBySocket = new Map<string, { userId: string; rooms: Set<string> }>();
  let blockReadsBroken = false;
  let pendingRead: Promise<void> | null = null;
  let staleReads = false;
  let clock = new Date('2026-11-08T10:00:00.000Z');

  const record = (target: string, except: readonly string[]): any => ({
    emit: (event: string, data: unknown) => emissions.push({ target, except, event, data }),
    except: (ids: string[]) => record(target, ids),
  });

  const fetchSocketsOf = (room: string) => [...roomsBySocket.entries()]
    .filter(([, s]) => s.rooms.has(room))
    .map(([id, s]) => ({
      id,
      rooms: s.rooms,
      emit: (event: string, data: unknown) => emissions.push({ target: id, except: [], event, data }),
    }));

  const io = {
    to: (target: string) => record(target, []),
    in: (room: string) => ({ fetchSockets: async () => fetchSocketsOf(room) }),
  } as any;

  const findMany = jest.fn<any>().mockImplementation(async ({ where }: any) => {
    const snapshot = Object.keys(blocks)
      .filter(id => (blocks[id] ?? []).includes(where.blockedUserIds.has))
      .map(id => ({ id }));
    if (pendingRead) await pendingRead;
    if (blockReadsBroken) throw new Error('replica set election in progress');
    return staleReads ? snapshot : Object.keys(blocks)
      .filter(id => (blocks[id] ?? []).includes(where.blockedUserIds.has))
      .map(id => ({ id }));
  });
  const findUnique = jest.fn<any>().mockImplementation(async ({ where }: any) => {
    const snapshot = { blockedUserIds: blocks[where.id] ?? [] };
    if (pendingRead) await pendingRead;
    if (blockReadsBroken) throw new Error('replica set election in progress');
    return staleReads ? snapshot : { blockedUserIds: blocks[where.id] ?? [] };
  });

  const prisma = {
    participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'participant-1' }) },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ isActive: true, closedAt: null }) },
    user: { findMany, findUnique },
  };

  const connectedUsers = new Map<string, any>([ALICE, BOB, CAROL].map(id => [id, { id, isAnonymous: false, displayName: id }]));
  const socketToUser = new Map<string, string>();

  const handler = new LocationHandler({
    io,
    prisma: prisma as any,
    connectedUsers,
    socketToUser,
    normalizeConversationId: jest.fn<any>(async (id: string) => id),
    engagement: null,
    now: () => clock,
  });

  const connect = (socketId: string, userId: string, conversations: readonly string[] = [CONV_ID]): Socket => {
    const rooms = new Set([socketId, ROOMS.user(userId), ...conversations.map(ROOMS.conversation)]);
    roomsBySocket.set(socketId, { userId, rooms });
    socketToUser.set(socketId, userId);
    return {
      id: socketId,
      rooms,
      emit: (event: string, data: unknown) => emissions.push({ target: socketId, except: [], event, data }),
      to: (target: string) => record(target, []),
    } as unknown as Socket;
  };

  return {
    handler,
    emissions,
    connect,
    block: (blocker: string, blocked: string) => { blocks[blocker] = [...(blocks[blocker] ?? []), blocked]; },
    breakBlockReads: () => { blockReadsBroken = true; },
    holdBlockReads: () => {
      let release: () => void = () => undefined;
      pendingRead = new Promise<void>(resolve => { release = resolve; });
      return () => { pendingRead = null; release(); };
    },
    advance: (ms: number) => { clock = new Date(clock.getTime() + ms); },
    readsAnswerFromTheirStart: () => { staleReads = true; },
  };
}

const of = (emissions: readonly Emission[], event: string) => emissions.filter(e => e.event === event);
const updated = (e: readonly Emission[]) => of(e, SERVER_EVENTS.LOCATION_LIVE_UPDATED);
const stopped = (e: readonly Emission[]) => of(e, SERVER_EVENTS.LOCATION_LIVE_STOPPED);

const share = (world: ReturnType<typeof makeWorld>, socket: Socket, conversationId = CONV_ID, durationMinutes = 480) =>
  world.handler.handleLiveLocationStart(socket, { ...PARIS, conversationId, durationMinutes }, undefined);
const move = (world: ReturnType<typeof makeWorld>, socket: Socket, conversationId = CONV_ID) =>
  world.handler.handleLiveLocationUpdate(socket, { ...LYON, conversationId });

describe('LocationHandler.cutPair — un blocage coupe le partage en cours, sans attendre le pas', () => {
  beforeEach(() => {
    mockGetConnectedUser.mockImplementation((key: string, users: Map<string, any>) => {
      const user = users.get(key);
      return user ? { user, realUserId: user.id } : null;
    });
  });

  it('le point SUIVANT le blocage exclut déjà le pair bloqué, une seconde après le départ', async () => {
    const world = makeWorld();
    const alice = world.connect('s-alice', ALICE);
    world.connect('s-bob', BOB);
    await share(world, alice);

    world.block(ALICE, BOB);
    await world.handler.cutPair({ userA: ALICE, userB: BOB });
    world.advance(1_000);
    await move(world, alice);

    expect(updated(world.emissions)).toHaveLength(1);
    expect(updated(world.emissions)[0].except).toContain(ROOMS.user(BOB));
    expect(updated(world.emissions)[0].except).not.toContain(ROOMS.user(CAROL));
  });

  it('la coupure tient sans relire la base : une lecture de blocage qui lève ne rouvre rien', async () => {
    const world = makeWorld();
    const alice = world.connect('s-alice', ALICE);
    await share(world, alice);

    await world.handler.cutPair({ userA: BOB, userB: ALICE });
    world.breakBlockReads();
    world.advance(61_000);
    await move(world, alice);

    expect(updated(world.emissions)[0].except).toContain(ROOMS.user(BOB));
  });

  it('une coupure tombée PENDANT le rafraîchissement d\'un point n\'est pas écrasée par l\'ensemble d\'avant', async () => {
    const world = makeWorld();
    const alice = world.connect('s-alice', ALICE);
    await share(world, alice);

    world.advance(61_000);
    const release = world.holdBlockReads();
    world.breakBlockReads();
    const inFlight = move(world, alice);
    await new Promise(resolve => setImmediate(resolve));
    await world.handler.cutPair({ userA: ALICE, userB: BOB });
    release();
    await inFlight;
    await move(world, alice);

    expect(updated(world.emissions).map(e => e.except)).toEqual([[ROOMS.user(BOB)], [ROOMS.user(BOB)]]);
  });

  it('dans les DEUX sens : le partage du bloqué est coupé vers le bloqueur', async () => {
    const world = makeWorld();
    world.connect('s-alice', ALICE);
    const bob = world.connect('s-bob', BOB);
    await share(world, bob);

    await world.handler.cutPair({ userA: ALICE, userB: BOB });
    await move(world, bob);

    expect(updated(world.emissions)[0].except).toContain(ROOMS.user(ALICE));
  });

  it('chacun reçoit le retrait de l\'épingle de l\'autre, et le seul membre tiers ne reçoit rien', async () => {
    const world = makeWorld();
    const alice = world.connect('s-alice', ALICE);
    const bob = world.connect('s-bob', BOB);
    world.connect('s-carol', CAROL);
    await share(world, alice);
    await share(world, bob);

    await world.handler.cutPair({ userA: ALICE, userB: BOB });

    const stops = stopped(world.emissions).map(e => ({ target: e.target, data: e.data as { userId: string; conversationId: string } }));
    expect(stops.map(s => [s.target, s.data.userId, s.data.conversationId]).sort()).toEqual([
      ['s-alice', BOB, CONV_ID],
      ['s-bob', ALICE, CONV_ID],
    ]);
  });

  it('une socket du pair HORS du fil ne reçoit rien — aucun identifiant de conversation ne fuit', async () => {
    const world = makeWorld();
    const alice = world.connect('s-alice', ALICE);
    world.connect('s-bob-ailleurs', BOB, [OTHER_CONV_ID]);
    await share(world, alice);

    await world.handler.cutPair({ userA: ALICE, userB: BOB });

    expect(stopped(world.emissions)).toEqual([]);
  });

  it('un partage DÉJÀ terminé n\'annonce pas une seconde fin', async () => {
    const world = makeWorld();
    const alice = world.connect('s-alice', ALICE);
    world.connect('s-bob', BOB);
    await share(world, alice);
    world.handler.endSessionsForClosedConversation(CONV_ID);
    const before = stopped(world.emissions).length;

    await world.handler.cutPair({ userA: ALICE, userB: BOB });

    expect(stopped(world.emissions)).toHaveLength(before);
  });

  it('une session INCONNUE (après redémarrage) relit son verdict au lieu de garder celui d\'avant le blocage', async () => {
    const world = makeWorld();
    const alice = world.connect('s-alice', ALICE);
    await move(world, alice);
    expect(updated(world.emissions)[0].except).toEqual([]);

    world.block(BOB, ALICE);
    await world.handler.cutPair({ userA: BOB, userB: ALICE });
    world.advance(1_000);
    await move(world, alice);

    expect(updated(world.emissions)[1].except).toContain(ROOMS.user(BOB));
  });

  it('la coupure de la ROUTE atteint le registre de ce processus, et plus rien après son arrêt', async () => {
    const world = makeWorld();
    const alice = world.connect('s-alice', ALICE);
    await share(world, alice);

    await cutLiveLocationsOnBlock({ blockerId: ALICE, blockedId: BOB });
    await move(world, alice);
    expect(updated(world.emissions)[0].except).toContain(ROOMS.user(BOB));

    const cut = jest.spyOn(world.handler, 'cutPair');
    world.handler.dispose();
    await cutLiveLocationsOnBlock({ blockerId: ALICE, blockedId: CAROL });
    expect(cut).not.toHaveBeenCalled();
  });

  it('sans partage de la paire, la coupure ne diffuse rien et ne touche pas les autres partageurs', async () => {
    const world = makeWorld();
    const carol = world.connect('s-carol', CAROL);
    world.connect('s-alice', ALICE);
    world.connect('s-bob', BOB);
    await share(world, carol);

    await world.handler.cutPair({ userA: ALICE, userB: BOB });
    await move(world, carol);

    expect(stopped(world.emissions)).toEqual([]);
    expect(updated(world.emissions)[0].except).toEqual([]);
  });

  it('une lecture de rafraîchissement PARTIE avant le blocage et rendue après la coupure ne rouvre pas le pair', async () => {
    const world = makeWorld();
    const alice = world.connect('s-alice', ALICE);
    await share(world, alice);

    world.advance(61_000);
    world.readsAnswerFromTheirStart();
    const release = world.holdBlockReads();
    const inFlight = move(world, alice);
    await new Promise(resolve => setImmediate(resolve));
    world.block(BOB, ALICE);
    await world.handler.cutPair({ userA: BOB, userB: ALICE });
    release();
    await inFlight;
    world.advance(1_000);
    await move(world, alice);

    expect(updated(world.emissions).map(e => e.except)).toEqual([[ROOMS.user(BOB)], [ROOMS.user(BOB)]]);
  });

  it('un départ dont la lecture de blocage est EN VOL quand la coupure tombe n\'ouvre pas sa session au pair', async () => {
    const world = makeWorld();
    const alice = world.connect('s-alice', ALICE);
    world.readsAnswerFromTheirStart();
    const release = world.holdBlockReads();
    const starting = share(world, alice);
    await new Promise(resolve => setImmediate(resolve));
    world.block(BOB, ALICE);
    await world.handler.cutPair({ userA: BOB, userB: ALICE });
    release();
    await starting;
    world.advance(1_000);
    await move(world, alice);

    expect(updated(world.emissions)[0].except).toContain(ROOMS.user(BOB));
  });

  it('une session INCONNUE dont le verdict est EN VOL quand la coupure tombe ne retient pas le verdict d\'avant', async () => {
    const world = makeWorld();
    const alice = world.connect('s-alice', ALICE);
    world.readsAnswerFromTheirStart();
    const release = world.holdBlockReads();
    const inFlight = move(world, alice);
    await new Promise(resolve => setImmediate(resolve));
    world.block(BOB, ALICE);
    await world.handler.cutPair({ userA: BOB, userB: ALICE });
    release();
    await inFlight;
    world.advance(1_000);
    await move(world, alice);

    const excepts = updated(world.emissions).map(e => e.except);
    expect(excepts[excepts.length - 1]).toContain(ROOMS.user(BOB));
    expect(excepts.every(e => e.includes(ROOMS.user(BOB)))).toBe(true);
  });
});
