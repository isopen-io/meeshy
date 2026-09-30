/**
 * « Est dans la conversation » (#8892) — le pair qui a l'écran de la
 * conversation ouvert et au premier plan porte un point couleur primaire.
 */
import { describe, it, expect, jest } from '@jest/globals';

import { ConversationViewingHandler } from '../ConversationViewingHandler';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const CONV = '507f1f77bcf86cd799439011';
const OTHER_CONV = '507f1f77bcf86cd799439099';
const ALICE = '507f1f77bcf86cd7994390a1';
const BOB = '507f1f77bcf86cd7994390b2';
const CAROL = '507f1f77bcf86cd7994390c3';

type Emission = { room: string; except: readonly string[]; event: string; data: unknown };

type World = {
  participants?: ReadonlyArray<{ userId: string; conversationId: string }>;
  blocks?: Readonly<Record<string, readonly string[]>>;
  hidesOnlineStatus?: readonly string[];
};

function makeWorld({
  participants = [
    { userId: ALICE, conversationId: CONV },
    { userId: BOB, conversationId: CONV },
    { userId: CAROL, conversationId: CONV },
  ],
  blocks = {},
  hidesOnlineStatus = [],
}: World = {}) {
  const emissions: Emission[] = [];
  const io = {
    to: (room: string) => ({
      except: (except: string[]) => ({
        emit: (event: string, data: unknown) => emissions.push({ room, except, event, data }),
      }),
    }),
  };
  const prisma = {
    conversation: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    participant: {
      findFirst: jest.fn<any>().mockImplementation(async ({ where }: any) => {
        const found = participants.find(p => p.userId === where.userId && p.conversationId === where.conversationId);
        return found ? { id: `p-${found.userId}`, displayName: found.userId, nickname: null } : null;
      }),
    },
    user: {
      findMany: jest.fn<any>().mockImplementation(async ({ where }: any) =>
        Object.keys(blocks)
          .filter(id => (blocks[id] ?? []).includes(where.blockedUserIds.has))
          .map(id => ({ id }))
      ),
      findUnique: jest.fn<any>().mockImplementation(async ({ where }: any) => ({
        blockedUserIds: blocks[where.id] ?? [],
      })),
    },
  };
  const privacyPreferencesService = {
    shouldShowOnlineStatus: jest.fn<any>().mockImplementation(async (userId: string) => !hidesOnlineStatus.includes(userId)),
  };
  const connectedUsers = new Map<string, any>();
  const socketToUser = new Map<string, string>();
  const userSockets = new Map<string, Set<string>>();

  const handler = new ConversationViewingHandler({
    io: io as any,
    prisma: prisma as any,
    privacyPreferencesService: privacyPreferencesService as any,
    connectedUsers,
    socketToUser,
    userSockets,
  });

  const connect = (userId: string, socketId: string) => {
    connectedUsers.set(userId, { id: userId, socketId, isAnonymous: false, language: 'fr' });
    socketToUser.set(socketId, userId);
    userSockets.set(userId, new Set([...(userSockets.get(userId) ?? []), socketId]));
    const direct: Array<{ event: string; data: unknown }> = [];
    const socket = { id: socketId, emit: (event: string, data: unknown) => direct.push({ event, data }) };
    return { socket: socket as any, direct };
  };

  return { handler, emissions, connect };
}

const startsFor = (emissions: readonly Emission[]) =>
  emissions.filter(e => e.event === SERVER_EVENTS.VIEWING_START);
const stopsFor = (emissions: readonly Emission[]) =>
  emissions.filter(e => e.event === SERVER_EVENTS.VIEWING_STOP);

describe('ConversationViewingHandler — ouvrir la conversation', () => {
  it('annonce le participant à la room, sans le renvoyer à ses propres appareils', async () => {
    const { handler, emissions, connect } = makeWorld();
    const alice = connect(ALICE, 's-alice');

    await handler.handleStart(alice.socket, { conversationId: CONV });

    expect(startsFor(emissions)).toEqual([
      {
        room: `conversation:${CONV}`,
        except: ['s-alice'],
        event: SERVER_EVENTS.VIEWING_START,
        data: { userId: ALICE, conversationId: CONV },
      },
    ]);
  });

  it('répond à l’arrivant avec les pairs déjà présents, lui exclu', async () => {
    const { handler, connect } = makeWorld();
    const bob = connect(BOB, 's-bob');
    const alice = connect(ALICE, 's-alice');
    await handler.handleStart(bob.socket, { conversationId: CONV });

    await handler.handleStart(alice.socket, { conversationId: CONV });

    expect(alice.direct).toContainEqual({
      event: SERVER_EVENTS.VIEWING_SNAPSHOT,
      data: { conversationId: CONV, userIds: [BOB] },
    });
  });

  it('n’annonce rien pour quelqu’un qui n’est pas participant', async () => {
    const { handler, emissions, connect } = makeWorld({ participants: [{ userId: BOB, conversationId: CONV }] });
    const alice = connect(ALICE, 's-alice');

    await handler.handleStart(alice.socket, { conversationId: CONV });

    expect(emissions).toEqual([]);
    expect(alice.direct).toEqual([]);
  });

  it('n’annonce pas un utilisateur qui masque son statut en ligne, mais lui montre les autres', async () => {
    const { handler, emissions, connect } = makeWorld({ hidesOnlineStatus: [ALICE] });
    const bob = connect(BOB, 's-bob');
    const alice = connect(ALICE, 's-alice');
    await handler.handleStart(bob.socket, { conversationId: CONV });

    await handler.handleStart(alice.socket, { conversationId: CONV });

    expect(startsFor(emissions).map(e => (e.data as any).userId)).toEqual([BOB]);
    expect(alice.direct).toContainEqual({
      event: SERVER_EVENTS.VIEWING_SNAPSHOT,
      data: { conversationId: CONV, userIds: [BOB] },
    });
  });

  it('un second appareil du même utilisateur ne ré-annonce pas', async () => {
    const { handler, emissions, connect } = makeWorld();
    const phone = connect(ALICE, 's-phone');
    const laptop = connect(ALICE, 's-laptop');

    await handler.handleStart(phone.socket, { conversationId: CONV });
    await handler.handleStart(laptop.socket, { conversationId: CONV });

    expect(startsFor(emissions)).toHaveLength(1);
  });
});

describe('ConversationViewingHandler — blocage', () => {
  it('exclut de l’annonce les appareils d’un pair bloqué, dans les deux sens', async () => {
    const { handler, emissions, connect } = makeWorld({ blocks: { [BOB]: [ALICE] } });
    connect(BOB, 's-bob');
    connect(CAROL, 's-carol');
    const alice = connect(ALICE, 's-alice');

    await handler.handleStart(alice.socket, { conversationId: CONV });

    expect(startsFor(emissions)[0].except).toEqual(expect.arrayContaining(['s-alice', 's-bob']));
    expect(startsFor(emissions)[0].except).not.toContain('s-carol');
  });

  it('ne révèle pas à l’arrivant un pair présent qui l’a bloqué', async () => {
    const { handler, connect } = makeWorld({ blocks: { [BOB]: [ALICE] } });
    const bob = connect(BOB, 's-bob');
    const carol = connect(CAROL, 's-carol');
    const alice = connect(ALICE, 's-alice');
    await handler.handleStart(bob.socket, { conversationId: CONV });
    await handler.handleStart(carol.socket, { conversationId: CONV });

    await handler.handleStart(alice.socket, { conversationId: CONV });

    expect(alice.direct).toContainEqual({
      event: SERVER_EVENTS.VIEWING_SNAPSHOT,
      data: { conversationId: CONV, userIds: [CAROL] },
    });
  });
});

describe('ConversationViewingHandler — quitter la conversation', () => {
  it('annonce le départ quand le dernier appareil quitte', async () => {
    const { handler, emissions, connect } = makeWorld();
    const alice = connect(ALICE, 's-alice');
    await handler.handleStart(alice.socket, { conversationId: CONV });

    await handler.handleStop(alice.socket, { conversationId: CONV });

    expect(stopsFor(emissions)).toEqual([
      {
        room: `conversation:${CONV}`,
        except: ['s-alice'],
        event: SERVER_EVENTS.VIEWING_STOP,
        data: { userId: ALICE, conversationId: CONV },
      },
    ]);
  });

  it('se tait tant qu’un autre appareil du même utilisateur reste dans la conversation', async () => {
    const { handler, emissions, connect } = makeWorld();
    const phone = connect(ALICE, 's-phone');
    const laptop = connect(ALICE, 's-laptop');
    await handler.handleStart(phone.socket, { conversationId: CONV });
    await handler.handleStart(laptop.socket, { conversationId: CONV });

    await handler.handleStop(phone.socket, { conversationId: CONV });

    expect(stopsFor(emissions)).toEqual([]);
  });

  it('ne retire rien qui n’a jamais été annoncé', async () => {
    const { handler, emissions, connect } = makeWorld();
    const alice = connect(ALICE, 's-alice');

    await handler.handleStop(alice.socket, { conversationId: CONV });

    expect(emissions).toEqual([]);
  });

  it('passer en arrière-plan retire l’utilisateur de toutes les conversations ouvertes', async () => {
    const { handler, emissions, connect } = makeWorld({
      participants: [
        { userId: ALICE, conversationId: CONV },
        { userId: ALICE, conversationId: OTHER_CONV },
      ],
    });
    const alice = connect(ALICE, 's-alice');
    await handler.handleStart(alice.socket, { conversationId: CONV });
    await handler.handleStart(alice.socket, { conversationId: OTHER_CONV });

    await handler.handleAppState(alice.socket, { foreground: false });

    expect(stopsFor(emissions).map(e => (e.data as any).conversationId).sort()).toEqual([CONV, OTHER_CONV].sort());
  });

  it('revenir au premier plan ne retire rien', async () => {
    const { handler, emissions, connect } = makeWorld();
    const alice = connect(ALICE, 's-alice');
    await handler.handleStart(alice.socket, { conversationId: CONV });

    await handler.handleAppState(alice.socket, { foreground: true });

    expect(stopsFor(emissions)).toEqual([]);
  });

  it('la déconnexion retire l’utilisateur et libère le registre', async () => {
    const { handler, emissions, connect } = makeWorld();
    const alice = connect(ALICE, 's-alice');
    const bob = connect(BOB, 's-bob');
    await handler.handleStart(alice.socket, { conversationId: CONV });

    await handler.handleSocketDisconnecting('s-alice');
    await handler.handleStart(bob.socket, { conversationId: CONV });

    expect(stopsFor(emissions)).toHaveLength(1);
    expect(bob.direct).toContainEqual({
      event: SERVER_EVENTS.VIEWING_SNAPSHOT,
      data: { conversationId: CONV, userIds: [] },
    });
  });
});
