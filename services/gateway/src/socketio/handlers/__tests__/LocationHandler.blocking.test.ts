/**
 * LE BLOCAGE ET LA POSITION EN DIRECT (#16745).
 *
 * Deux signaux du MÊME salon filtrent le blocage bidirectionnel et le disent :
 * la frappe (`StatusHandler._getBlockedSocketIdsInRoom` — « typing is a more
 * sensitive, moment-to-moment signal than presence ») et le regard
 * (`ConversationViewingHandler`, « exclut les pairs bloqués dans les deux
 * sens »). `LocationHandler` n'avait AUCUNE occurrence de `block` : ses quatre
 * diffusions partaient au salon entier, et `replayLiveLocationsTo` rejouait
 * spontanément la dernière position connue à tout socket qui entre.
 *
 * Alice et Bob sont dans « Rando ». Alice bloque Bob — un blocage ne retire
 * personne d'une conversation. Alice partage sa position pour huit heures
 * (`durationMinutes ≤ 480`) : Bob la suivait en temps réel, et s'il ouvrait le
 * fil APRÈS le départ, le rattrapage la lui servait sans qu'il demande rien.
 *
 * ─── Le principe que ce lot pose, et qu'il partage avec #16752 ──────────────
 *
 * `session.blockRelated` est l'ensemble des pairs **SANS ÉPINGLE**. Il est tenu
 * par deux gestes : l'exclusion au départ, et une retraction CIBLÉE envoyée à
 * qui le rejoint en cours de route. D'où la posture de chaque événement :
 *
 * - `started` / `updated` RÉVÈLENT une position ⇒ ils excluent cet ensemble ;
 * - `stopped` est une RÉTRACTATION ⇒ il exclut exactement ceux qui n'ont rien
 *   reçu, et personne de plus : l'exclure plus largement figerait une épingle
 *   sur une position réelle, c'est-à-dire l'inverse de ce qu'on protège.
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
const CAROL_SOCKET = 'socket-carol';
const CAROL = '507f1f77bcf86cd7994390c3';

const CONV_ID = '507f1f77bcf86cd799439011';
const ROOM = ROOMS.conversation(CONV_ID);

const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const LYON = { latitude: 45.764, longitude: 4.8357 };

type Emission = { target: string; except: readonly string[]; event: string; data: unknown };

/**
 * Le monde : Alice, Bob et Carol connectés dans le même fil. `blocks` est la
 * colonne `User.blockedUserIds`, et `breakBlockReads()` fait LEVER la loi
 * partagée — la bascule de réplique.
 */
function makeWorld({
  blocks = {} as Readonly<Record<string, readonly string[]>>,
}: { blocks?: Readonly<Record<string, readonly string[]>> } = {}) {
  const emissions: Emission[] = [];
  let blockReadsBroken = false;
  let clock = new Date('2026-11-08T10:00:00.000Z');

  const record = (target: string, except: readonly string[]) => ({
    emit: (event: string, data: unknown) => emissions.push({ target, except, event, data }),
    except: (ids: string[]) => record(target, ids),
  });

  const io = { to: (target: string) => record(target, []) } as any;

  const findMany = jest.fn<any>().mockImplementation(async ({ where }: any) => {
    if (blockReadsBroken) throw new Error('replica set election in progress');
    return Object.keys(blocks)
      .filter(id => (blocks[id] ?? []).includes(where.blockedUserIds.has))
      .map(id => ({ id }));
  });
  const findUnique = jest.fn<any>().mockImplementation(async ({ where }: any) => {
    if (blockReadsBroken) throw new Error('replica set election in progress');
    return { blockedUserIds: blocks[where.id] ?? [] };
  });

  const prisma = {
    participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'participant-1' }) },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ isActive: true, closedAt: null }) },
    user: { findMany, findUnique },
  };

  const connectedUsers = new Map<string, any>([
    [ALICE, { id: ALICE, isAnonymous: false, displayName: 'Alice' }],
    [BOB, { id: BOB, isAnonymous: false, displayName: 'Bob' }],
    [CAROL, { id: CAROL, isAnonymous: false, displayName: 'Carol' }],
  ]);
  const socketToUser = new Map<string, string>([
    [ALICE_SOCKET, ALICE],
    [BOB_SOCKET, BOB],
    [CAROL_SOCKET, CAROL],
  ]);
  const userSockets = new Map<string, Set<string>>([
    [ALICE, new Set([ALICE_SOCKET])],
    [BOB, new Set([BOB_SOCKET])],
    [CAROL, new Set([CAROL_SOCKET])],
  ]);

  const handler = new LocationHandler({
    io,
    prisma: prisma as any,
    connectedUsers,
    socketToUser,
    userSockets,
    normalizeConversationId: jest.fn<any>(async (id: string) => id),
    engagement: null,
    now: () => clock,
  });

  const makeSocket = (id: string): Socket => ({
    id,
    emit: (event: string, data: unknown) => emissions.push({ target: id, except: [], event, data }),
    to: (target: string) => record(target, []),
  } as unknown as Socket);

  return {
    handler,
    emissions,
    makeSocket,
    blockReads: { findMany, findUnique },
    breakBlockReads: () => { blockReadsBroken = true; },
    advance: (ms: number) => { clock = new Date(clock.getTime() + ms); },
  };
}

const of = (emissions: readonly Emission[], event: string) => emissions.filter(e => e.event === event);
const started = (e: readonly Emission[]) => of(e, SERVER_EVENTS.LOCATION_LIVE_STARTED);
const updated = (e: readonly Emission[]) => of(e, SERVER_EVENTS.LOCATION_LIVE_UPDATED);
const stopped = (e: readonly Emission[]) => of(e, SERVER_EVENTS.LOCATION_LIVE_STOPPED);

const share = (world: ReturnType<typeof makeWorld>, socket: Socket, durationMinutes = 480) =>
  world.handler.handleLiveLocationStart(socket, { ...PARIS, conversationId: CONV_ID, durationMinutes }, undefined);

describe('LocationHandler — un pair bloqué ne suit pas une position en direct', () => {
  beforeEach(() => {
    mockGetConnectedUser.mockImplementation((key: string, users: Map<string, any>) => {
      const user = users.get(key);
      return user ? { user, realUserId: user.id } : null;
    });
  });

  it('le DÉPART exclut les sockets du pair bloqué', async () => {
    const world = makeWorld({ blocks: { [ALICE]: [BOB] } });
    await share(world, world.makeSocket(ALICE_SOCKET));

    expect(started(world.emissions)).toHaveLength(1);
    expect(started(world.emissions)[0].target).toBe(ROOM);
    expect(started(world.emissions)[0].except).toContain(BOB_SOCKET);
    expect(started(world.emissions)[0].except).not.toContain(CAROL_SOCKET);
  });

  it('le blocage est BIDIRECTIONNEL — c\'est Bob qui a bloqué Alice, et il est exclu de même', async () => {
    const world = makeWorld({ blocks: { [BOB]: [ALICE] } });
    await share(world, world.makeSocket(ALICE_SOCKET));

    expect(started(world.emissions)[0].except).toContain(BOB_SOCKET);
  });

  it('chaque MISE À JOUR exclut les sockets du pair bloqué', async () => {
    const world = makeWorld({ blocks: { [ALICE]: [BOB] } });
    const alice = world.makeSocket(ALICE_SOCKET);
    await share(world, alice);
    await world.handler.handleLiveLocationUpdate(alice, { ...LYON, conversationId: CONV_ID });

    expect(updated(world.emissions)).toHaveLength(1);
    expect(updated(world.emissions)[0].except).toContain(BOB_SOCKET);
  });

  it('le RATTRAPAGE ne sert pas la position d\'un partageur bloqué à l\'arrivant', async () => {
    const world = makeWorld({ blocks: { [ALICE]: [BOB] } });
    await share(world, world.makeSocket(ALICE_SOCKET));

    const bob = world.makeSocket(BOB_SOCKET);
    await world.handler.replayLiveLocationsTo(bob, CONV_ID);

    expect(started(world.emissions).filter(e => e.target === BOB_SOCKET)).toEqual([]);
  });

  it('le RATTRAPAGE sert bien un partageur NON bloqué — la resserre ne coupe pas le nominal', async () => {
    const world = makeWorld({ blocks: { [ALICE]: [BOB] } });
    await share(world, world.makeSocket(ALICE_SOCKET));

    const carol = world.makeSocket(CAROL_SOCKET);
    await world.handler.replayLiveLocationsTo(carol, CONV_ID);

    expect(started(world.emissions).filter(e => e.target === CAROL_SOCKET)).toHaveLength(1);
  });

  it('le DÉPART est REFUSÉ quand la lecture de blocage lève — rien ne part', async () => {
    const world = makeWorld({ blocks: { [ALICE]: [BOB] } });
    world.breakBlockReads();
    const callback = jest.fn();
    await world.handler.handleLiveLocationStart(
      world.makeSocket(ALICE_SOCKET),
      { ...PARIS, conversationId: CONV_ID, durationMinutes: 480 },
      callback as any
    );

    expect(started(world.emissions)).toEqual([]);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('le RATTRAPAGE ne sert RIEN quand la lecture de blocage lève', async () => {
    const world = makeWorld();
    await share(world, world.makeSocket(ALICE_SOCKET));

    world.breakBlockReads();
    const bob = world.makeSocket(BOB_SOCKET);
    await world.handler.replayLiveLocationsTo(bob, CONV_ID);

    expect(started(world.emissions).filter(e => e.target === BOB_SOCKET)).toEqual([]);
  });

  /**
   * UN BLOCAGE POSÉ EN COURS DE PARTAGE. Sans ce volet, un correctif qui ne
   * lirait la base qu'au départ laisserait Bob suivre Alice pendant les huit
   * heures restantes — c'est-à-dire le symptôme de l'issue, à un instant près.
   *
   * Et l'épingle de Bob ne doit pas simplement se FIGER : la retraction ciblée
   * est ce qui la retire. Une position réelle figée est ce que l'en-tête du
   * handler appelle « un défaut de sécurité avant d'être un défaut d'affichage ».
   */
  it('un blocage posé APRÈS le départ coupe les mises à jour et RETIRE l\'épingle', async () => {
    const blocks: Record<string, readonly string[]> = {};
    const world = makeWorld({ blocks });
    const alice = world.makeSocket(ALICE_SOCKET);
    await share(world, alice);
    expect(started(world.emissions)[0].except).not.toContain(BOB_SOCKET);

    blocks[ALICE] = [BOB];
    world.advance(61_000);
    await world.handler.handleLiveLocationUpdate(alice, { ...LYON, conversationId: CONV_ID });

    expect(updated(world.emissions)[0].except).toContain(BOB_SOCKET);
    const targeted = stopped(world.emissions).filter(e => e.target === BOB_SOCKET);
    expect(targeted).toHaveLength(1);
  });

  /**
   * UNE RÉTRACTATION EXCLUT CEUX QUI N'ONT RIEN REÇU, ET PERSONNE DE PLUS.
   * Bob était bloqué au départ : il n'a pas d'épingle, le retrait ne le
   * concerne pas. Carol en a une : il doit lui parvenir.
   */
  it('l\'ARRÊT exclut le pair bloqué au départ et atteint les autres', async () => {
    const world = makeWorld({ blocks: { [ALICE]: [BOB] } });
    const alice = world.makeSocket(ALICE_SOCKET);
    await share(world, alice);
    await world.handler.handleLiveLocationStop(alice, { conversationId: CONV_ID });

    const stop = stopped(world.emissions).filter(e => e.target === ROOM);
    expect(stop).toHaveLength(1);
    expect(stop[0].except).toContain(BOB_SOCKET);
  });

  it('l\'EXPIRATION diffuse le retrait au salon en excluant le pair bloqué', async () => {
    const world = makeWorld({ blocks: { [ALICE]: [BOB] } });
    await share(world, world.makeSocket(ALICE_SOCKET), 30);
    world.handler.endSessionsForClosedConversation(CONV_ID);

    const stop = stopped(world.emissions).filter(e => e.target === ROOM);
    expect(stop).toHaveLength(1);
    expect(stop[0].except).toContain(BOB_SOCKET);
  });

  /**
   * SANS AUCUN BLOCAGE, la forme des quatre diffusions est INCHANGÉE : aucun
   * `.except` n'est posé. C'est ce qui garde le correctif d'être trop large, et
   * c'est ce qui laisse les cinq suites existantes du handler vertes.
   */
  /**
   * LA MINUTERIE D'EXPIRATION RELIT LE REGISTRE, elle ne diffuse pas depuis la
   * session qu'elle a CAPTURÉE au départ (#16745). Huit heures séparent les
   * deux, et `blockRelated` a pu grandir entre-temps : diffuser depuis la
   * capture enverrait le retrait aux pairs que le partage a cessé de servir.
   */
  it('le retrait à l\'expiration exclut un pair bloqué APRÈS le départ', async () => {
    jest.useFakeTimers();
    try {
      const blocks: Record<string, readonly string[]> = {};
      const world = makeWorld({ blocks });
      const alice = world.makeSocket(ALICE_SOCKET);
      // DEUX minutes, et pas une : la mise à jour qui déclenche le
      // rafraîchissement arrive à 61 s, et la borne du terme
      // (`now >= expiresAt`) la refuserait AVANT d'y arriver sur un partage
      // d'une minute — le témoin passerait alors au vert pour la mauvaise
      // raison, sans qu'aucun rafraîchissement ait eu lieu.
      await share(world, alice, 2);

      blocks[ALICE] = [BOB];
      world.advance(61_000);
      await world.handler.handleLiveLocationUpdate(alice, { ...LYON, conversationId: CONV_ID });

      jest.advanceTimersByTime(130_000);
      await Promise.resolve();

      const roomStop = stopped(world.emissions).filter(e => e.target === ROOM);
      expect(roomStop).toHaveLength(1);
      expect(roomStop[0].except).toContain(BOB_SOCKET);
    } finally {
      jest.useRealTimers();
    }
  });

  it('sans blocage, aucune exclusion n\'est posée', async () => {
    const world = makeWorld();
    const alice = world.makeSocket(ALICE_SOCKET);
    await share(world, alice);
    await world.handler.handleLiveLocationUpdate(alice, { ...LYON, conversationId: CONV_ID });
    await world.handler.handleLiveLocationStop(alice, { conversationId: CONV_ID });

    expect(world.emissions.every(e => e.except.length === 0)).toBe(true);
    expect(started(world.emissions)).toHaveLength(1);
    expect(updated(world.emissions)).toHaveLength(1);
    expect(stopped(world.emissions)).toHaveLength(1);
  });
});
