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
 * Et la seconde moitié du lot est une SUPPRESSION de lecture : une RÉTRACTION
 * exclut exactement ceux qui avaient été exclus de l'ANNONCE, et le handler
 * retient déjà cet ensemble (`SocketViewing.blockRelated`, écrit par un
 * `start` fail-closed, donc PROUVÉ). Relire la base à la rétractation coûtait
 * deux requêtes et ouvrait la seule porte par laquelle un fail-open pouvait
 * entrer.
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

  it('la rétractation exclut le pair bloqué SANS relire la base', async () => {
    const world = makeWorld();
    const alice = world.connect(ALICE, 'socket-alice');
    world.connect(BOB, 'socket-bob');
    await world.handler.handleStart(alice.socket, { conversationId: CONV });

    const readsAfterStart = world.blockReads.findMany.mock.calls.length;
    await world.handler.handleSocketDisconnecting('socket-alice');

    const stop = stops(world.emissions);
    expect(stop).toHaveLength(1);
    expect(stop[0].except).toContain('socket-bob');
    expect(world.blockReads.findMany.mock.calls.length).toBe(readsAfterStart);
  });

  it('la rétractation exclut encore le pair bloqué quand la base est TOMBÉE entre-temps', async () => {
    const world = makeWorld();
    const alice = world.connect(ALICE, 'socket-alice');
    world.connect(BOB, 'socket-bob');
    await world.handler.handleStart(alice.socket, { conversationId: CONV });

    world.breakBlockReads();
    await world.handler.handleSocketDisconnecting('socket-alice');

    const stop = stops(world.emissions);
    expect(stop).toHaveLength(1);
    expect(stop[0].except).toContain('socket-bob');
  });

  it('la rétractation d\'un membre SORTI exclut le pair bloqué malgré une base tombée', async () => {
    const world = makeWorld();
    const alice = world.connect(ALICE, 'socket-alice');
    world.connect(BOB, 'socket-bob');
    await world.handler.handleStart(alice.socket, { conversationId: CONV });

    world.breakBlockReads();
    await world.handler.retractViewingForDepartedMember(CONV, ALICE);

    const stop = stops(world.emissions);
    expect(stop).toHaveLength(1);
    expect(stop[0].except).toContain('socket-bob');
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
