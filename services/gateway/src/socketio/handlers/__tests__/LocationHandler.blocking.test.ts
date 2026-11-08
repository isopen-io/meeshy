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
 * `session.blockRelated` est un **FILTRE D'ANNONCE**, et rien d'autre :
 *
 * - `started` / `updated` RÉVÈLENT une position ⇒ ils EXCLUENT cet ensemble ;
 * - `stopped` est une RÉTRACTATION ⇒ elle part au salon, **sans exclusion**.
 *
 * Deux raisons, et la seconde a été trouvée en cassant la première version de
 * ce lot. (1) Qui porte l'épingle n'est pas le complément du filtre : cela
 * dépend de l'instant de chaque annonce, d'un redémarrage sur un second
 * appareil, d'un rafraîchissement arrivé entre-temps — et une erreur dans ce
 * sens-là LAISSE une position réelle plantée jusqu'à huit heures. (2) L'ensemble
 * rendu par `getBlockRelatedUserIds` est GLOBAL au dépôt, sans notion de
 * conversation : l'inverser en liste de DESTINATAIRES — ce que faisait une
 * rétractation ciblée — adresse des gens qui ne sont pas dans le fil.
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
/** Connecté, mais PAS participant de ce fil — le cas de l'audit adversarial. */
const DAVE_SOCKET = 'socket-dave';
const DAVE = '507f1f77bcf86cd7994390d4';

const CONV_ID = '507f1f77bcf86cd799439011';
const ROOM = ROOMS.conversation(CONV_ID);

const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const LYON = { latitude: 45.764, longitude: 4.8357 };

type Emission = {
  target: string;
  except: readonly string[];
  event: string;
  data: unknown;
  /** Vraie pour une émission passée par `io.to(...)` — pas par `socket.emit`. */
  viaIo: boolean;
};

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

  const record = (target: string, except: readonly string[], viaIo: boolean): any => ({
    emit: (event: string, data: unknown) => emissions.push({ target, except, event, data, viaIo }),
    except: (ids: string[]) => record(target, ids, viaIo),
  });

  const io = { to: (target: string) => record(target, [], true) } as any;

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
    [DAVE, { id: DAVE, isAnonymous: false, displayName: 'Dave' }],
  ]);
  const socketToUser = new Map<string, string>([
    [ALICE_SOCKET, ALICE],
    [BOB_SOCKET, BOB],
    [CAROL_SOCKET, CAROL],
    [DAVE_SOCKET, DAVE],
  ]);
  const userSockets = new Map<string, Set<string>>([
    [ALICE, new Set([ALICE_SOCKET])],
    [BOB, new Set([BOB_SOCKET])],
    [CAROL, new Set([CAROL_SOCKET])],
    [DAVE, new Set([DAVE_SOCKET])],
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

  const makeSocket = (id: string, rooms: readonly string[] = [ROOM]): Socket => ({
    id,
    rooms: new Set([id, ...rooms]),
    emit: (event: string, data: unknown) =>
      emissions.push({ target: id, except: [], event, data, viaIo: false }),
    to: (target: string) => record(target, [], false),
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
   * L'épingle de Bob se FIGE alors sur la dernière position reçue, et c'est
   * l'arrêt — non filtré — qui la retire. Ce que ce témoin garde est la coupure
   * du FLUX ; le témoin de l'arrêt garde le retrait.
   */
  it('un blocage posé APRÈS le départ coupe les mises à jour', async () => {
    const blocks: Record<string, readonly string[]> = {};
    const world = makeWorld({ blocks });
    const alice = world.makeSocket(ALICE_SOCKET);
    await share(world, alice);
    expect(started(world.emissions)[0].except).not.toContain(BOB_SOCKET);

    blocks[ALICE] = [BOB];
    world.advance(61_000);
    await world.handler.handleLiveLocationUpdate(alice, { ...LYON, conversationId: CONV_ID });

    expect(updated(world.emissions)[0].except).toContain(BOB_SOCKET);
  });

  /**
   * LA PORTE QU'UNE PREMIÈRE VERSION DE CE LOT AVAIT OUVERTE, et qui était PIRE
   * que le défaut qu'elle fermait (trouvée par l'audit adversarial du lot).
   *
   * `getBlockRelatedUserIds` rend l'ensemble bidirectionnel ENTIER du
   * partageur, à l'échelle du DÉPÔT et sans notion de conversation — son
   * doc-comment le dit : « an id in this set that owns no socket contributes
   * nothing to AN EXCLUSION LIST ». Une rétractation CIBLÉE l'inversait en liste
   * de DESTINATAIRES, adressée par `io.to(socketId)`, donc hors room et hors
   * appartenance : Dave, qui n'est pas dans « Rando » et n'a aucun lien avec
   * Alice, apprenait — par son propre blocage, et à ~1 coup/minute — l'existence
   * d'un identifiant de conversation et d'un partage de position d'Alice.
   */
  it('un bloqueur ÉTRANGER à la conversation ne reçoit RIEN, jamais', async () => {
    const blocks: Record<string, readonly string[]> = {};
    const world = makeWorld({ blocks });
    const alice = world.makeSocket(ALICE_SOCKET);
    await share(world, alice);

    // Dave bloque Alice. Il n'est PAS participant de ce fil.
    blocks[DAVE] = [ALICE];
    world.advance(61_000);
    await world.handler.handleLiveLocationUpdate(alice, { ...LYON, conversationId: CONV_ID });
    await world.handler.handleLiveLocationStop(alice, { conversationId: CONV_ID });
    world.handler.endSessionsForClosedConversation(CONV_ID);

    expect(world.emissions.filter(e => e.target === DAVE_SOCKET)).toEqual([]);
    // Et la propriété STRUCTURELLE qui le garantit : aucune émission de ce
    // handler n'est adressée à un id de SOCKET. Tout part à un salon, ou au
    // socket qui vient de rejoindre (le rattrapage, par `socket.emit`).
    const socketIds = [ALICE_SOCKET, BOB_SOCKET, CAROL_SOCKET, DAVE_SOCKET];
    expect(world.emissions.filter(e => socketIds.includes(e.target) && e.viaIo)).toEqual([]);
  });

  /**
   * UNE RÉTRACTATION NE SE FILTRE PAS. Elle ne porte aucune position
   * (`{conversationId, userId, stoppedAt}`), et c'est le seul chemin qui RETIRE
   * une épingle : l'exclure d'un pair qui en porte une la laisserait plantée
   * sur une position réelle jusqu'à huit heures.
   */
  it('l\'ARRÊT part au salon ENTIER, sans exclusion', async () => {
    const world = makeWorld({ blocks: { [ALICE]: [BOB] } });
    const alice = world.makeSocket(ALICE_SOCKET);
    await share(world, alice);
    await world.handler.handleLiveLocationStop(alice, { conversationId: CONV_ID });

    const stop = stopped(world.emissions).filter(e => e.target === ROOM);
    expect(stop).toHaveLength(1);
    expect(stop[0].except).toEqual([]);
  });

  it('l\'EXPIRATION diffuse le retrait au salon entier, sans exclusion', async () => {
    const world = makeWorld({ blocks: { [ALICE]: [BOB] } });
    await share(world, world.makeSocket(ALICE_SOCKET), 30);
    world.handler.endSessionsForClosedConversation(CONV_ID);

    const stop = stopped(world.emissions).filter(e => e.target === ROOM);
    expect(stop).toHaveLength(1);
    expect(stop[0].except).toEqual([]);
  });

  /**
   * UN `location:live-stop` SANS PARTAGE. Les quatre gardes de ce verbe sont
   * Zod, le contexte, le débit et l'appartenance : rien n'exige qu'un partage
   * ait jamais existé. Une première version de ce lot en tirait une exclusion
   * depuis une session absente — c'est-à-dire aucune, servie comme si c'était
   * une décision. La règle unique rend la question sans objet.
   */
  it('un ARRÊT sans partage en cours diffuse quand même au salon entier', async () => {
    const world = makeWorld({ blocks: { [ALICE]: [BOB] } });
    const alice = world.makeSocket(ALICE_SOCKET);
    await world.handler.handleLiveLocationStop(alice, { conversationId: CONV_ID });

    const stop = stopped(world.emissions).filter(e => e.target === ROOM);
    expect(stop).toHaveLength(1);
    expect(stop[0].except).toEqual([]);
  });

  /**
   * UN RE-DÉPART (second appareil : « la propriété est au DERNIER qui démarre »)
   * n'a plus rien à réconcilier. Sous la règle « la rétractation exclut
   * l'ensemble retenu », le second départ écrasait l'entrée avec un ensemble
   * frais et l'arrêt excluait donc un pair qui portait l'épingle du PREMIER
   * départ. Plus aucun état ne porte le retrait.
   */
  it('un RE-DÉPART ne fait pas perdre le retrait au pair bloqué entre-temps', async () => {
    const blocks: Record<string, readonly string[]> = {};
    const world = makeWorld({ blocks });
    const alice = world.makeSocket(ALICE_SOCKET);
    await share(world, alice);
    blocks[BOB] = [ALICE];
    await share(world, alice);
    await world.handler.handleLiveLocationStop(alice, { conversationId: CONV_ID });

    const stop = stopped(world.emissions).filter(e => e.target === ROOM);
    expect(stop[stop.length - 1].except).toEqual([]);
  });

  /**
   * SANS AUCUN BLOCAGE, la forme des quatre diffusions est INCHANGÉE : aucun
   * `.except` n'est posé. C'est ce qui garde le correctif d'être trop large, et
   * c'est ce qui laisse les cinq suites existantes du handler vertes.
   */
  /**
   * LA MINUTERIE D'EXPIRATION diffuse elle aussi sans exclusion — y compris
   * vers un pair bloqué APRÈS le départ, qui est précisément celui dont
   * l'épingle doit partir.
   */
  it('le retrait à l\'expiration part au salon entier, pair bloqué en cours de route compris', async () => {
    jest.useFakeTimers();
    try {
      const blocks: Record<string, readonly string[]> = {};
      const world = makeWorld({ blocks });
      const alice = world.makeSocket(ALICE_SOCKET);
      // DEUX minutes : la mise à jour qui déclenche le rafraîchissement arrive à
      // 61 s, et la borne du terme la refuserait sur un partage d'une minute —
      // le témoin passerait au vert sans qu'aucun rafraîchissement ait eu lieu.
      await share(world, alice, 2);

      blocks[ALICE] = [BOB];
      world.advance(61_000);
      await world.handler.handleLiveLocationUpdate(alice, { ...LYON, conversationId: CONV_ID });
      expect(updated(world.emissions)[0].except).toContain(BOB_SOCKET);

      jest.advanceTimersByTime(130_000);
      await Promise.resolve();

      const roomStop = stopped(world.emissions).filter(e => e.target === ROOM);
      expect(roomStop).toHaveLength(1);
      expect(roomStop[0].except).toEqual([]);
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
