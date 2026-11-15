/**
 * « Est dans la conversation » (#8892) — le pair qui a l'écran de la
 * conversation ouvert et au premier plan porte un point couleur primaire.
 */
import { describe, it, expect, jest } from '@jest/globals';

import { ConversationViewingHandler, MAX_PENDING_OPENINGS } from '../ConversationViewingHandler';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

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
  /**
   * L'APPARTENANCE EST MUTABLE (#16654) — la fixture figée était la raison pour
   * laquelle la fin d'appartenance n'avait jamais de témoin : aucun des 40
   * témoins ne pouvait retirer quelqu'un APRÈS un `viewing:start` réussi, donc
   * la seule chose que `activity()` n'a jamais eu à revérifier.
   */
  const roster = [...participants];
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
        const found = roster.find(p => p.userId === where.userId && p.conversationId === where.conversationId);
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

  const connect = (userId: string, socketId: string, rooms: readonly string[] = []) => {
    connectedUsers.set(userId, { id: userId, socketId, isAnonymous: false, language: 'fr' });
    socketToUser.set(socketId, userId);
    userSockets.set(userId, new Set([...(userSockets.get(userId) ?? []), socketId]));
    const direct: Array<{ event: string; data: unknown }> = [];
    const socket = {
      id: socketId,
      rooms: new Set([socketId, ...rooms.map(id => `conversation:${id}`)]),
      emit: (event: string, data: unknown) => direct.push({ event, data }),
      // `leave` MANQUAIT au double (#16654) : la room est une autorisation mise
      // en cache, et un double qui ne sait pas la quitter ne peut attester
      // aucune expiration. Socket.IO retire de `rooms` — le double aussi.
      leave: async (room: string) => {
        socket.rooms.delete(room);
      },
    };
    return { socket: socket as any, direct };
  };

  /** Un socket ouvert dont l'authentification n'a pas encore abouti (#9047). */
  const arrive = (socketId: string, rooms: readonly string[] = []) => {
    const direct: Array<{ event: string; data: unknown }> = [];
    const socket = {
      id: socketId,
      rooms: new Set([socketId, ...rooms.map(id => `conversation:${id}`)]),
      emit: (event: string, data: unknown) => direct.push({ event, data }),
      leave: async (room: string) => {
        socket.rooms.delete(room);
      },
    };
    const authenticate = (userId: string) => {
      connectedUsers.set(userId, { id: userId, socketId, isAnonymous: false, language: 'fr' });
      socketToUser.set(socketId, userId);
      userSockets.set(userId, new Set([...(userSockets.get(userId) ?? []), socketId]));
    };
    return { socket: socket as any, direct, authenticate };
  };

  /** Ce que fait un retrait, un bannissement ou un départ : la ligne cesse d'être vivante. */
  const retire = (userId: string, conversationId: string): void => {
    const at = roster.findIndex(p => p.userId === userId && p.conversationId === conversationId);
    if (at >= 0) roster.splice(at, 1);
  };

  return { handler, emissions, connect, arrive, retire, prisma };
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

  it('écoute lui-même presence:app-state : un passage en arrière-plan reçu par le socket retire l’utilisateur', async () => {
    const { handler, emissions, connect } = makeWorld();
    const alice = connect(ALICE, 's-alice');
    const listeners = new Map<string, (data: unknown) => void>();
    alice.socket.on = (event: string, listener: (data: unknown) => void) => listeners.set(event, listener);
    handler.listen(alice.socket);
    await handler.handleStart(alice.socket, { conversationId: CONV });

    listeners.get(CLIENT_EVENTS.PRESENCE_APP_STATE)?.({ foreground: false });
    await handler.handleStop(alice.socket, { conversationId: OTHER_CONV });

    expect(stopsFor(emissions).map(e => (e.data as any).conversationId)).toEqual([CONV]);
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

describe('ConversationViewingHandler — se (re)connecter', () => {
  const snapshots = (direct: ReadonlyArray<{ event: string; data: unknown }>) =>
    direct.filter(d => d.event === SERVER_EVENTS.VIEWING_SNAPSHOT).map(d => d.data);

  it('dit à l’arrivant qui est déjà dans chacune de ses conversations', async () => {
    const { handler, connect } = makeWorld();
    const bob = connect(BOB, 's-bob');
    await handler.handleStart(bob.socket, { conversationId: CONV });
    const alice = connect(ALICE, 's-alice', [CONV, OTHER_CONV]);

    await handler.emitRoomSnapshots(alice.socket);

    expect(snapshots(alice.direct)).toEqual([{ conversationId: CONV, userIds: [BOB] }]);
  });

  it('ne dit rien d’une conversation dont l’arrivant n’est pas membre', async () => {
    const { handler, connect } = makeWorld();
    const bob = connect(BOB, 's-bob');
    await handler.handleStart(bob.socket, { conversationId: CONV });
    const alice = connect(ALICE, 's-alice', [OTHER_CONV]);

    await handler.emitRoomSnapshots(alice.socket);

    expect(snapshots(alice.direct)).toEqual([]);
  });

  it('ne compte ni l’arrivant lui-même ni un pair bloqué', async () => {
    const { handler, connect } = makeWorld({ blocks: { [BOB]: [ALICE] } });
    const bob = connect(BOB, 's-bob');
    const phone = connect(ALICE, 's-phone');
    await handler.handleStart(bob.socket, { conversationId: CONV });
    await handler.handleStart(phone.socket, { conversationId: CONV });
    const laptop = connect(ALICE, 's-laptop', [CONV]);

    await handler.emitRoomSnapshots(laptop.socket);

    expect(snapshots(laptop.direct)).toEqual([]);
  });
});

describe('ConversationViewingHandler — ouvrir AVANT la fin de l’authentification (#9047)', () => {
  it('une ouverture reçue avant l’authentification est annoncée dès qu’elle aboutit', async () => {
    const { handler, emissions, arrive } = makeWorld();
    const alice = arrive('s-alice', [CONV]);

    await handler.handleStart(alice.socket, { conversationId: CONV });
    expect(startsFor(emissions)).toEqual([]);

    alice.authenticate(ALICE);
    await handler.afterAuthentication(alice.socket);

    expect(startsFor(emissions).map(e => e.data)).toEqual([{ userId: ALICE, conversationId: CONV }]);
  });

  it('une fermeture reçue entre-temps annule l’ouverture en attente', async () => {
    const { handler, emissions, arrive } = makeWorld();
    const alice = arrive('s-alice', [CONV]);

    await handler.handleStart(alice.socket, { conversationId: CONV });
    await handler.handleStop(alice.socket, { conversationId: CONV });
    alice.authenticate(ALICE);
    await handler.afterAuthentication(alice.socket);

    expect(startsFor(emissions)).toEqual([]);
  });

  it('passer en arrière-plan, ou se déconnecter, avant l’authentification oublie l’attente', async () => {
    const { handler, emissions, arrive } = makeWorld();
    const phone = arrive('s-phone', [CONV]);
    await handler.handleStart(phone.socket, { conversationId: CONV });
    await handler.handleAppState(phone.socket, { foreground: false });
    phone.authenticate(ALICE);
    await handler.afterAuthentication(phone.socket);

    const laptop = arrive('s-laptop', [CONV]);
    await handler.handleStart(laptop.socket, { conversationId: CONV });
    await handler.handleSocketDisconnecting('s-laptop');
    laptop.authenticate(BOB);
    await handler.afterAuthentication(laptop.socket);

    expect(startsFor(emissions)).toEqual([]);
  });

  it('après l’authentification, l’arrivant reçoit aussi qui est déjà là', async () => {
    const { handler, connect, arrive } = makeWorld();
    const bob = connect(BOB, 's-bob');
    await handler.handleStart(bob.socket, { conversationId: CONV });
    const alice = arrive('s-alice', [CONV]);
    alice.authenticate(ALICE);

    await handler.afterAuthentication(alice.socket);

    expect(alice.direct.filter(d => d.event === SERVER_EVENTS.VIEWING_SNAPSHOT).map(d => d.data)).toEqual([
      { conversationId: CONV, userIds: [BOB] },
    ]);
  });

  it('un socket non authentifié ne retient que ses dernières ouvertures — la mémoire reste bornée', async () => {
    const conversations = Array.from({ length: 50 }, (_, index) => `507f1f77bcf86cd7994${String(index).padStart(5, '0')}`);
    const { handler, emissions, arrive } = makeWorld({
      participants: conversations.map(conversationId => ({ userId: ALICE, conversationId })),
    });
    const alice = arrive('s-alice', conversations);

    for (const conversationId of conversations) await handler.handleStart(alice.socket, { conversationId });
    alice.authenticate(ALICE);
    await handler.afterAuthentication(alice.socket);

    expect(startsFor(emissions).map(e => (e.data as { conversationId: string }).conversationId)).toEqual(
      conversations.slice(-MAX_PENDING_OPENINGS),
    );
  });
});

describe('ConversationViewingHandler — l’ordre des gestes est celui du client (#9052)', () => {
  const snapshotOf = (direct: ReadonlyArray<{ event: string; data: unknown }>) =>
    direct.filter(d => d.event === SERVER_EVENTS.VIEWING_SNAPSHOT).map(d => d.data);

  it('un viewing:stop reçu pendant que le viewing:start se résout laisse le lecteur parti', async () => {
    const { handler, emissions, connect } = makeWorld();
    const alice = connect(ALICE, 's-alice');
    const bob = connect(BOB, 's-bob');

    const opening = handler.handleStart(alice.socket, { conversationId: CONV });
    const leaving = handler.handleStop(alice.socket, { conversationId: CONV });
    await Promise.all([opening, leaving]);
    await handler.handleStart(bob.socket, { conversationId: CONV });

    expect(snapshotOf(bob.direct)).toEqual([{ conversationId: CONV, userIds: [] }]);
    expect(startsFor(emissions).filter(e => (e.data as { userId: string }).userId === ALICE)).toHaveLength(
      stopsFor(emissions).filter(e => (e.data as { userId: string }).userId === ALICE).length,
    );
  });

  it('une déconnexion pendant que le viewing:start se résout ne laisse aucun fantôme', async () => {
    const { handler, connect } = makeWorld();
    const alice = connect(ALICE, 's-alice');
    const bob = connect(BOB, 's-bob');

    const opening = handler.handleStart(alice.socket, { conversationId: CONV });
    const gone = handler.handleSocketDisconnecting('s-alice');
    await Promise.all([opening, gone]);
    await handler.handleStart(bob.socket, { conversationId: CONV });

    expect(snapshotOf(bob.direct)).toEqual([{ conversationId: CONV, userIds: [] }]);
  });

  it('fermer puis rouvrir aussitôt l’image rend la présence', async () => {
    const { handler, connect } = makeWorld();
    const alice = connect(ALICE, 's-alice');
    const bob = connect(BOB, 's-bob');
    await handler.handleStart(alice.socket, { conversationId: CONV });

    const covered = handler.handleStop(alice.socket, { conversationId: CONV });
    const back = handler.handleStart(alice.socket, { conversationId: CONV });
    await Promise.all([covered, back]);
    await handler.handleStart(bob.socket, { conversationId: CONV });

    expect(snapshotOf(bob.direct)).toEqual([{ conversationId: CONV, userIds: [ALICE] }]);
  });
});

const activitiesFor = (emissions: readonly Emission[]) =>
  emissions.filter(e => e.event === SERVER_EVENTS.VIEWING_ACTIVITY);

describe('ConversationViewingHandler — regarder, écouter, agir (#9061)', () => {
  it('relaie l’activité d’un lecteur ICI à la room, sans la renvoyer à ses appareils', async () => {
    const { handler, emissions, connect } = makeWorld();
    const alice = connect(ALICE, 's-alice');
    await handler.handleStart(alice.socket, { conversationId: CONV });

    await handler.handleActivity(alice.socket, { conversationId: CONV });

    expect(activitiesFor(emissions)).toEqual([
      {
        room: `conversation:${CONV}`,
        except: ['s-alice'],
        event: SERVER_EVENTS.VIEWING_ACTIVITY,
        data: { userId: ALICE, conversationId: CONV },
      },
    ]);
  });

  it('ne relaie rien pour un socket qui n’a pas annoncé la conversation', async () => {
    const { handler, emissions, connect } = makeWorld();
    const alice = connect(ALICE, 's-alice');
    await handler.handleStart(alice.socket, { conversationId: OTHER_CONV });

    await handler.handleActivity(alice.socket, { conversationId: CONV });

    expect(activitiesFor(emissions)).toEqual([]);
  });

  it('ne relaie plus rien une fois la conversation quittée', async () => {
    const { handler, emissions, connect } = makeWorld();
    const alice = connect(ALICE, 's-alice');
    await handler.handleStart(alice.socket, { conversationId: CONV });
    await handler.handleStop(alice.socket, { conversationId: CONV });

    await handler.handleActivity(alice.socket, { conversationId: CONV });

    expect(activitiesFor(emissions)).toEqual([]);
  });

  it('ne relaie rien pour qui masque sa présence — il n’est jamais annoncé ICI', async () => {
    const { handler, emissions, connect } = makeWorld({ hidesOnlineStatus: [ALICE] });
    const alice = connect(ALICE, 's-alice');
    await handler.handleStart(alice.socket, { conversationId: CONV });

    await handler.handleActivity(alice.socket, { conversationId: CONV });

    expect(activitiesFor(emissions)).toEqual([]);
  });

  it('n’atteint pas les appareils d’un pair bloqué', async () => {
    const { handler, emissions, connect } = makeWorld({ blocks: { [ALICE]: [BOB] } });
    connect(BOB, 's-bob');
    const alice = connect(ALICE, 's-alice');
    await handler.handleStart(alice.socket, { conversationId: CONV });

    await handler.handleActivity(alice.socket, { conversationId: CONV });

    expect(activitiesFor(emissions).map(e => [...e.except].sort())).toEqual([['s-alice', 's-bob']]);
  });

  it('ignore une charge invalide', async () => {
    const { handler, emissions, connect } = makeWorld();
    const alice = connect(ALICE, 's-alice');
    await handler.handleStart(alice.socket, { conversationId: CONV });

    await handler.handleActivity(alice.socket, { conversationId: '' });

    expect(activitiesFor(emissions)).toEqual([]);
  });
});

describe('ConversationViewingHandler — regarder en plein écran (#9065)', () => {
  it('relaie le plein écran ouvert depuis la conversation, sans dire quel élément', async () => {
    const { handler, emissions, connect } = makeWorld();
    const alice = connect(ALICE, 's-alice');
    await handler.handleStart(alice.socket, { conversationId: CONV });

    await handler.handleActivity(alice.socket, { conversationId: CONV, focus: true, attachmentId: 'a1' });

    expect(activitiesFor(emissions).map(e => e.data)).toEqual([
      { userId: ALICE, conversationId: CONV, focus: true },
    ]);
  });

  it('ignore un drapeau de plein écran qui n’est pas un booléen', async () => {
    const { handler, emissions, connect } = makeWorld();
    const alice = connect(ALICE, 's-alice');
    await handler.handleStart(alice.socket, { conversationId: CONV });

    await handler.handleActivity(alice.socket, { conversationId: CONV, focus: 'oui' });

    expect(activitiesFor(emissions)).toEqual([]);
  });
});

/**
 * FIN D'APPARTENANCE (#16654) — le troisième état vivant qu'un partant tenait
 * dans le fil. `endConversationMembership` éteignait la position partagée et la
 * participation d'appel ; le registre « ici », arrivé après cette convergence,
 * n'y figurait pas, et il n'aurait pas pu : toute la surface publique du
 * registre était clavetée par SOCKET, jamais par `(conversationId, userId)`.
 *
 * Les deux moitiés sont indépendantes, et seule la seconde est de l'état
 * SERVEUR pur — elle n'attend aucune coopération de l'appareil du partant.
 */
describe('ConversationViewingHandler — fin d’appartenance (#16654)', () => {
  it('ne relaie plus l’activité d’un membre retiré du fil', async () => {
    const { handler, emissions, connect, retire } = makeWorld();
    const alice = connect(ALICE, 's-alice', [CONV]);
    await handler.handleStart(alice.socket, { conversationId: CONV });

    retire(ALICE, CONV);
    await handler.handleActivity(alice.socket, { conversationId: CONV });

    expect(activitiesFor(emissions)).toEqual([]);
  });

  /**
   * La room est une autorisation MISE EN CACHE (#5947) : une non-appartenance
   * prouvée l'expire, sinon l'ancien membre reçoit encore le fil. Même geste,
   * même raison que `typing:start` (`StatusHandler.handleTypingStart`).
   */
  it('expire la room du fil quand l’activité prouve la non-appartenance', async () => {
    const { handler, connect, retire } = makeWorld();
    const alice = connect(ALICE, 's-alice', [CONV]);
    await handler.handleStart(alice.socket, { conversationId: CONV });

    retire(ALICE, CONV);
    await handler.handleActivity(alice.socket, { conversationId: CONV });

    expect(alice.socket.rooms.has(`conversation:${CONV}`)).toBe(false);
  });

  it('un pair qui ouvre le fil APRÈS le retrait ne voit pas le retiré ICI', async () => {
    const { handler, connect, retire } = makeWorld();
    const alice = connect(ALICE, 's-alice', [CONV]);
    await handler.handleStart(alice.socket, { conversationId: CONV });

    retire(ALICE, CONV);
    await handler.retractViewingForDepartedMember(CONV, ALICE);

    const carol = connect(CAROL, 's-carol', [CONV]);
    await handler.handleStart(carol.socket, { conversationId: CONV });

    expect(carol.direct).toContainEqual({
      event: SERVER_EVENTS.VIEWING_SNAPSHOT,
      data: { conversationId: CONV, userIds: [] },
    });
  });

  it('les pairs présents au retrait reçoivent le `viewing:stop` du partant', async () => {
    const { handler, emissions, connect, retire } = makeWorld();
    const alice = connect(ALICE, 's-alice', [CONV]);
    await handler.handleStart(alice.socket, { conversationId: CONV });

    retire(ALICE, CONV);
    await handler.retractViewingForDepartedMember(CONV, ALICE);

    expect(stopsFor(emissions)).toEqual([
      {
        room: `conversation:${CONV}`,
        except: ['s-alice'],
        event: SERVER_EVENTS.VIEWING_STOP,
        data: { userId: ALICE, conversationId: CONV },
      },
    ]);
  });

  /** Le partant tenait DEUX écrans ouverts : le registre les lâche tous. */
  it('rétracte TOUS les appareils du partant, et n’annonce qu’un seul arrêt', async () => {
    const { handler, emissions, connect } = makeWorld();
    const phone = connect(ALICE, 's-alice-1', [CONV]);
    const tablet = connect(ALICE, 's-alice-2', [CONV]);
    await handler.handleStart(phone.socket, { conversationId: CONV });
    await handler.handleStart(tablet.socket, { conversationId: CONV });

    await handler.retractViewingForDepartedMember(CONV, ALICE);

    expect(stopsFor(emissions).map(e => e.data)).toEqual([{ userId: ALICE, conversationId: CONV }]);
    const carol = connect(CAROL, 's-carol', [CONV]);
    await handler.handleStart(carol.socket, { conversationId: CONV });
    expect(carol.direct).toContainEqual({
      event: SERVER_EVENTS.VIEWING_SNAPSHOT,
      data: { conversationId: CONV, userIds: [] },
    });
  });

  /** Ce que le partant regardait AILLEURS ne le quitte pas. */
  it('ne touche pas aux autres conversations que le partant regarde', async () => {
    const { handler, emissions, connect } = makeWorld({
      participants: [
        { userId: ALICE, conversationId: CONV },
        { userId: ALICE, conversationId: OTHER_CONV },
        { userId: BOB, conversationId: CONV },
      ],
    });
    const alice = connect(ALICE, 's-alice', [CONV, OTHER_CONV]);
    await handler.handleStart(alice.socket, { conversationId: CONV });
    await handler.handleStart(alice.socket, { conversationId: OTHER_CONV });

    await handler.retractViewingForDepartedMember(CONV, ALICE);

    expect(stopsFor(emissions).map(e => e.data)).toEqual([{ userId: ALICE, conversationId: CONV }]);
    await handler.handleActivity(alice.socket, { conversationId: OTHER_CONV });
    expect(activitiesFor(emissions).map(e => e.data)).toEqual([{ userId: ALICE, conversationId: OTHER_CONV }]);
  });

  /**
   * LE TROISIÈME ÉTAT DU VERDICT — une ABSENCE DE PREUVE n'éteint rien.
   * `resolveParticipant` n'attrape rien : une panne de base LÈVE au lieu de
   * rendre `null`. Confondre les deux ferait sortir un membre PARFAITEMENT
   * VIVANT de la room de son fil — donc cesser de lui livrer `message:new` —
   * sur un accroc Mongo. Fail-CLOSED sur la preuve, fail-OPEN sur son absence.
   */
  it('une panne de la lecture d’appartenance n’éteint rien et ne sort personne de la room', async () => {
    const { handler, emissions, connect, prisma } = makeWorld();
    const alice = connect(ALICE, 's-alice', [CONV]);
    await handler.handleStart(alice.socket, { conversationId: CONV });
    const before = activitiesFor(emissions).length;

    prisma.participant.findFirst.mockRejectedValueOnce(new Error('replica set unreachable'));
    await expect(handler.handleActivity(alice.socket, { conversationId: CONV })).rejects.toThrow();

    expect(stopsFor(emissions)).toEqual([]);
    expect(alice.socket.rooms.has(`conversation:${CONV}`)).toBe(true);
    expect(activitiesFor(emissions).length).toBe(before);

    // Et le registre tient toujours : le geste suivant, la base répondant de
    // nouveau, relaie normalement.
    await handler.handleActivity(alice.socket, { conversationId: CONV });
    expect(activitiesFor(emissions).length).toBe(before + 1);
  });

  /**
   * CONTRAT : NE REJETTE JAMAIS (`DepartedMemberEphemeralState`). Les six
   * appelants ont déjà commis leur écriture quand cette unité s'exécute ; un
   * rejet ici ferait échouer une route dont le fait est durable.
   */
  it('ne rejette pas quand personne ne regardait', async () => {
    const { handler, emissions } = makeWorld();
    await expect(handler.retractViewingForDepartedMember(CONV, ALICE)).resolves.toBeUndefined();
    expect(stopsFor(emissions)).toEqual([]);
  });
});
