/**
 * LA POSTURE D'UNE LECTURE DE BLOCAGE QUI N'A RIEN PROUVÉ (#16752).
 *
 * `blockRelatedOf` rendait un `Set` VIDE sur une levée — et un ensemble vide se
 * propage en « personne à exclure ». Une bascule de réplique MongoDB de vingt
 * secondes suffisait donc à publier `viewing:snapshot`, la liste NOMINATIVE des
 * gens présents, aux pairs bloqués dans les deux sens.
 *
 * L'asymétrie était dans le MÊME fichier : `viewing:start` appelait la loi
 * partagée SANS catch (une levée remonte et rien ne part), l'instantané et les
 * retraits avec. Une asymétrie interne est le signe d'un oubli, pas d'un
 * arbitrage.
 *
 * Et la seconde moitié du lot est une SUPPRESSION de lecture : `blockRelated`
 * est un FILTRE D'ANNONCE — il gouverne `viewing:start`, l'instantané et
 * `viewing:activity`, et rien d'autre. **Les deux rétractations partent sans
 * exclusion**, parce que « qui porte le point » n'est pas le complément du
 * filtre : cela dépend de l'instant de chaque annonce et du nombre d'appareils
 * du compte, et une erreur dans ce sens-là laisse un point ALLUMÉ chez un pair
 * bloqué pour toute sa session. Une première version de ce lot excluait
 * l'ensemble retenu, et appelait l'UNION des ensembles de plusieurs appareils
 * « la posture la plus fermée » : « n'a RIEN reçu » est l'INTERSECTION, donc
 * l'union laissait le point allumé.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

import { ConversationViewingHandler } from '../ConversationViewingHandler';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const CONV = '507f1f77bcf86cd799439011';
const ALICE = '507f1f77bcf86cd7994390a1';
const BOB = '507f1f77bcf86cd7994390b2';
const CAROL = '507f1f77bcf86cd7994390c3';

type Emission = { room: string; except: readonly string[]; event: string; data: unknown };

/**
 * Le monde : Alice, Bob et Carol dans le même fil, Alice ayant bloqué Bob.
 * `breakBlockReads()` fait LEVER la loi partagée à partir de cet instant —
 * c'est la bascule de réplique, et aucun témoin du dépôt ne l'injectait.
 */
function makeWorld(blocks: Readonly<Record<string, readonly string[]>> = { [ALICE]: [BOB] }) {
  const emissions: Emission[] = [];
  let blockReadsBroken = false;
  let clock = 1_762_000_000_000;

  const io = {
    to: (room: string) => ({
      except: (except: string[]) => ({
        emit: (event: string, data: unknown) => emissions.push({ room, except, event, data }),
      }),
    }),
  };

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
    conversation: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    participant: {
      findFirst: jest.fn<any>().mockImplementation(async ({ where }: any) => ({
        id: `p-${where.userId}`, displayName: where.userId, nickname: null,
      })),
    },
    user: { findMany, findUnique },
  };

  const connectedUsers = new Map<string, any>();
  const socketToUser = new Map<string, string>();
  const userSockets = new Map<string, Set<string>>();

  const handler = new ConversationViewingHandler({
    io: io as any,
    prisma: prisma as any,
    privacyPreferencesService: { shouldShowOnlineStatus: jest.fn<any>().mockResolvedValue(true) } as any,
    connectedUsers,
    socketToUser,
    userSockets,
    now: () => clock,
  });

  const connect = (userId: string, socketId: string, rooms: readonly string[] = [CONV]) => {
    connectedUsers.set(userId, { id: userId, socketId, isAnonymous: false, language: 'fr' });
    socketToUser.set(socketId, userId);
    userSockets.set(userId, new Set([...(userSockets.get(userId) ?? []), socketId]));
    const direct: Array<{ event: string; data: unknown }> = [];
    const socket = {
      id: socketId,
      rooms: new Set([socketId, ...rooms.map(id => `conversation:${id}`)]),
      emit: (event: string, data: unknown) => direct.push({ event, data }),
      leave: async (room: string) => { socket.rooms.delete(room); },
    };
    return { socket: socket as any, direct };
  };

  return {
    handler,
    emissions,
    connect,
    blockReads: { findMany, findUnique },
    breakBlockReads: () => { blockReadsBroken = true; },
    advance: (ms: number) => { clock += ms; },
  };
}

const snapshots = (direct: Array<{ event: string; data: unknown }>) =>
  direct.filter(e => e.event === SERVER_EVENTS.VIEWING_SNAPSHOT);

const stops = (emissions: readonly Emission[]) =>
  emissions.filter(e => e.event === SERVER_EVENTS.VIEWING_STOP);

describe('ConversationViewingHandler — une lecture de blocage qui échoue n\'ouvre rien', () => {
  it('n\'émet AUCUN instantané de spectateurs quand la lecture de blocage lève', async () => {
    const world = makeWorld();
    // Alice est ICI : c'est elle que l'instantané nommerait.
    const alice = world.connect(ALICE, 'socket-alice');
    await world.handler.handleStart(alice.socket, { conversationId: CONV });

    world.breakBlockReads();
    const bob = world.connect(BOB, 'socket-bob');
    await world.handler.emitRoomSnapshots(bob.socket);

    expect(snapshots(bob.direct)).toEqual([]);
  });

  it('n\'émet AUCUN instantané ni annonce sur `viewing:start` quand la lecture lève', async () => {
    const world = makeWorld();
    const alice = world.connect(ALICE, 'socket-alice');
    await world.handler.handleStart(alice.socket, { conversationId: CONV });

    world.breakBlockReads();
    const bob = world.connect(BOB, 'socket-bob');
    await world.handler.handleStart(bob.socket, { conversationId: CONV }).catch(() => undefined);

    expect(snapshots(bob.direct)).toEqual([]);
    expect(world.emissions.filter(e => e.event === SERVER_EVENTS.VIEWING_START && (e.data as any).userId === BOB))
      .toEqual([]);
  });

  /**
   * UNE RÉTRACTATION NE SE FILTRE PAS, et ne lit donc plus la base : c'est le
   * seul chemin qui ÉTEINT le point, et l'exclure d'un pair qui en porte un le
   * laisserait allumé pour toute sa session. Seul le lecteur lui-même est
   * exclu, comme avant ce lot.
   */
  it('la rétractation part au salon sans exclusion de blocage, et SANS relire la base', async () => {
    const world = makeWorld();
    const alice = world.connect(ALICE, 'socket-alice');
    world.connect(BOB, 'socket-bob');
    await world.handler.handleStart(alice.socket, { conversationId: CONV });

    const readsAfterStart = world.blockReads.findMany.mock.calls.length;
    await world.handler.handleSocketDisconnecting('socket-alice');

    const stop = stops(world.emissions);
    expect(stop).toHaveLength(1);
    expect(stop[0].except).not.toContain('socket-bob');
    expect(stop[0].except).toContain('socket-alice');
    expect(world.blockReads.findMany.mock.calls.length).toBe(readsAfterStart);
  });

  it('la rétractation d\'un membre SORTI part sans exclusion, même base tombée', async () => {
    const world = makeWorld();
    const alice = world.connect(ALICE, 'socket-alice');
    world.connect(BOB, 'socket-bob');
    await world.handler.handleStart(alice.socket, { conversationId: CONV });

    world.breakBlockReads();
    await world.handler.retractViewingForDepartedMember(CONV, ALICE);

    const stop = stops(world.emissions);
    expect(stop).toHaveLength(1);
    expect(stop[0].except).not.toContain('socket-bob');
  });

  /**
   * DEUX APPAREILS, et la raison pour laquelle l'UNION était fausse : D1 a
   * annoncé AVANT le blocage (le point de Bob s'est allumé), D2 après (rien).
   * L'ensemble « n'a RIEN reçu » est l'INTERSECTION, donc vide — et l'union
   * aurait exclu Bob du retrait, laissant son point allumé.
   */
  it('deux appareils, dont un a annoncé AVANT le blocage : le retrait atteint quand même le pair', async () => {
    const blocks: Record<string, readonly string[]> = {};
    const world = makeWorld(blocks);
    const d1 = world.connect(ALICE, 'sock-alice-1');
    world.connect(BOB, 'socket-bob');
    await world.handler.handleStart(d1.socket, { conversationId: CONV });

    blocks[ALICE] = [BOB];
    const d2 = world.connect(ALICE, 'sock-alice-2');
    await world.handler.handleStart(d2.socket, { conversationId: CONV });

    await world.handler.handleSocketDisconnecting('sock-alice-1');
    await world.handler.handleSocketDisconnecting('sock-alice-2');

    const stop = stops(world.emissions);
    expect(stop).toHaveLength(1);
    expect(stop[0].except).not.toContain('socket-bob');
  });

  /**
   * LE POULS D'ACTIVITÉ. `viewing:activity` revient toutes les deux secondes
   * pendant que l'écran reste ouvert (#9061) et lisait un filtre écrit UNE fois
   * par `viewing:start`, jamais relu : quelqu'un qui bloquait ce lecteur APRÈS
   * son ouverture continuait de voir son point PULSER, sans aucune borne de
   * temps. Trouvé par l'audit adversarial du lot.
   */
  it('le POULS d\'activité cesse d\'atteindre un pair qui bloque APRÈS l\'ouverture', async () => {
    const blocks: Record<string, readonly string[]> = {};
    const world = makeWorld(blocks);
    const alice = world.connect(ALICE, 'socket-alice');
    world.connect(BOB, 'socket-bob');
    await world.handler.handleStart(alice.socket, { conversationId: CONV });

    await world.handler.handleActivity(alice.socket, { conversationId: CONV });
    const avant = world.emissions.filter(e => e.event === SERVER_EVENTS.VIEWING_ACTIVITY);
    expect(avant).toHaveLength(1);
    expect(avant[0].except).not.toContain('socket-bob');

    blocks[BOB] = [ALICE];
    world.advance(61_000);
    await world.handler.handleActivity(alice.socket, { conversationId: CONV });

    const apres = world.emissions.filter(e => e.event === SERVER_EVENTS.VIEWING_ACTIVITY);
    expect(apres).toHaveLength(2);
    expect(apres[1].except).toContain('socket-bob');
  });

  it('le POULS ne relit la base qu\'une fois par pas, pas à chaque battement', async () => {
    const world = makeWorld();
    const alice = world.connect(ALICE, 'socket-alice');
    await world.handler.handleStart(alice.socket, { conversationId: CONV });

    const apresDepart = world.blockReads.findMany.mock.calls.length;
    for (let i = 0; i < 20; i += 1) {
      world.advance(2_000);
      await world.handler.handleActivity(alice.socket, { conversationId: CONV });
    }

    // 20 battements, 40 s d'horloge : aucun pas de 60 s franchi.
    expect(world.blockReads.findMany.mock.calls.length).toBe(apresDepart);
  });

  it('un pair NON bloqué reste servi — la resserre ne coupe pas le cas nominal', async () => {
    const world = makeWorld();
    const alice = world.connect(ALICE, 'socket-alice');
    await world.handler.handleStart(alice.socket, { conversationId: CONV });

    const carol = world.connect(CAROL, 'socket-carol');
    await world.handler.emitRoomSnapshots(carol.socket);

    expect(snapshots(carol.direct)).toHaveLength(1);
    expect((snapshots(carol.direct)[0].data as any).userIds).toEqual([ALICE]);
  });
});
