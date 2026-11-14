/**
 * #18381 — la porte de MI-SESSION rejoint la room comme la porte
 * d'AUTHENTIFICATION : avec réessais, avec marqueur d'échec, et à travers
 * l'adaptateur.
 *
 * Ce que l'absence des trois coûtait, et pourquoi c'est la forme la plus chère
 * d'une perte de message : un compte ajouté pendant qu'il est connecté dont la
 * jonction échoue reste `connectedUsers.has(key) === true` SANS marqueur. La
 * file hors ligne le SAUTE (elle le croit joignable) pendant que
 * `io.to(ROOMS.conversation(id))` le manque aussi. Rien n'est émis, rien n'est
 * écrit — donc il n'y a rien à rejouer à la reconnexion. C'est exactement le
 * mode de panne que #16687 a fermé sur la jumelle, laissé ouvert ici.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { ROOMS } from '@meeshy/shared/types/socketio-events';

import { admitUserToConversationRoom, type MidSessionAdmissionDeps } from '../../../socketio/midSessionRoomAdmission';
import type { SocketUser } from '../../../socketio/utils/socket-helpers';
import { recordSocketReachability } from '../../../socketio/socketReachability';
import { enqueueForOfflineParticipants } from '../../../socketio/offlineParticipantQueue';
import type { OfflineParticipantQueueDeps, OfflineParticipantQueueParams } from '../../../socketio/offlineParticipantQueue';

const USER = '507f1f77bcf86cd799439011';
const CONV = '507f1f77bcf86cd799439022';
const OTHER_CONV = '507f1f77bcf86cd799439033';

type FakeSocket = { id: string; join: jest.Mock; data?: unknown };

function socketThat(behaviour: 'joins' | 'rejects' | { failsFirst: number }, id = 'sock-1'): FakeSocket {
  let calls = 0;
  const join = jest.fn(() => {
    calls += 1;
    if (behaviour === 'joins') return Promise.resolve();
    if (behaviour === 'rejects') return Promise.reject(new Error('adapter down'));
    return calls <= behaviour.failsFirst ? Promise.reject(new Error('flaky')) : Promise.resolve();
  });
  return { id, join: join as unknown as jest.Mock };
}

function connectedUser(overrides: Partial<SocketUser> = {}): SocketUser {
  return { id: USER, socketId: 'sock-1', isAnonymous: false, ...overrides } as SocketUser;
}

function deps(options: {
  readonly sockets?: ReadonlyArray<FakeSocket>;
  readonly entry?: SocketUser | null;
  readonly socketsJoinThrows?: boolean;
}): { readonly deps: MidSessionAdmissionDeps; readonly connectedUsers: Map<string, SocketUser>; readonly socketsJoin: jest.Mock; readonly rooms: string[] } {
  const sockets = options.sockets ?? [];
  const connectedUsers = new Map<string, SocketUser>();
  if (options.entry !== null) connectedUsers.set(USER, options.entry ?? connectedUser());
  const rooms: string[] = [];
  const socketsJoin = jest.fn((room: unknown) => {
    if (options.socketsJoinThrows) throw new Error('redis adapter unavailable');
    rooms.push(String(room));
    return undefined;
  });
  const io = {
    in: (room: string) => {
      rooms.push(`in:${room}`);
      return { socketsJoin: socketsJoin as unknown as (rooms: string) => unknown };
    },
  };
  const byId = new Map(sockets.map(s => [s.id, s]));
  return {
    deps: {
      io,
      userSockets: new Map([[USER, new Set(sockets.map(s => s.id))]]),
      socketById: (id: string) => byId.get(id) as never,
      connectedUsers,
    },
    connectedUsers,
    socketsJoin: socketsJoin as unknown as jest.Mock,
    rooms,
  };
}

describe('#18381 — la porte de mi-session', () => {
  it('RÉESSAIE une jonction qui tombe, et ne marque rien quand le réessai passe', async () => {
    const socket = socketThat({ failsFirst: 2 });
    const h = deps({ sockets: [socket] });

    await admitUserToConversationRoom(h.deps, USER, CONV);

    expect(socket.join).toHaveBeenCalledTimes(3);
    expect(h.connectedUsers.get(USER)?.unreachableConversations).toBeUndefined();
  });

  it('MARQUE la conversation injoignable quand la jonction échoue définitivement — c est ce qui réarme la file', async () => {
    const socket = socketThat('rejects');
    const h = deps({ sockets: [socket] });

    await admitUserToConversationRoom(h.deps, USER, CONV);

    expect(socket.join).toHaveBeenCalledTimes(3);
    expect(h.connectedUsers.get(USER)?.unreachableConversations?.has(CONV)).toBe(true);
  });

  it('ne marque PAS quand une seule des sockets du compte a rejoint — la room atteint le compte', async () => {
    const sain = socketThat('joins', 'sock-ok');
    const malade = socketThat('rejects', 'sock-ko');
    const h = deps({ sockets: [sain, malade] });

    await admitUserToConversationRoom(h.deps, USER, CONV);

    expect(h.connectedUsers.get(USER)?.unreachableConversations).toBeUndefined();
  });

  it('RETIRE le marqueur de la conversation rejointe, et laisse les autres — le verdict du compte suit la SOCKET', async () => {
    const socket = socketThat('joins');
    recordSocketReachability(socket, { unreachableConversations: new Set([CONV, OTHER_CONV]) });
    const h = deps({
      sockets: [socket],
      entry: connectedUser({ unreachableConversations: new Set([CONV, OTHER_CONV]) }),
    });

    await admitUserToConversationRoom(h.deps, USER, CONV);

    const marks = h.connectedUsers.get(USER)?.unreachableConversations;
    expect(marks?.has(CONV)).toBe(false);
    expect(marks?.has(OTHER_CONV)).toBe(true);
  });

  it('joint la room À TRAVERS L ADAPTATEUR, depuis la room personnelle du compte', async () => {
    const h = deps({ sockets: [socketThat('joins')] });

    await admitUserToConversationRoom(h.deps, USER, CONV);

    expect(h.rooms).toContain(`in:${ROOMS.user(USER)}`);
    expect(h.socketsJoin).toHaveBeenCalledWith(ROOMS.conversation(CONV));
  });

  it('un adaptateur qui LÈVE ne retient pas les jonctions locales', async () => {
    const socket = socketThat('joins');
    const h = deps({ sockets: [socket], socketsJoinThrows: true });

    await admitUserToConversationRoom(h.deps, USER, CONV);

    expect(socket.join).toHaveBeenCalledWith(ROOMS.conversation(CONV));
    expect(h.connectedUsers.get(USER)?.unreachableConversations).toBeUndefined();
  });

  it('sans socket LOCALE, un adaptateur qui lève laisse le compte sans preuve de jonction : il est marqué', async () => {
    const h = deps({ sockets: [], socketsJoinThrows: true });

    await admitUserToConversationRoom(h.deps, USER, CONV);

    expect(h.connectedUsers.get(USER)?.unreachableConversations?.has(CONV)).toBe(true);
  });

  it('un compte absent de connectedUsers ne reçoit aucun marqueur — la file l enfile déjà', async () => {
    const h = deps({ sockets: [], entry: null, socketsJoinThrows: true });

    await admitUserToConversationRoom(h.deps, USER, CONV);

    expect(h.connectedUsers.has(USER)).toBe(false);
  });
});

describe('#18381 — le marqueur RÉARME la file hors ligne, et c est la seule chose qui le fasse', () => {
  const PARTICIPANT = '507f1f77bcf86cd799439099';

  async function enqueueAfter(admission: () => Promise<Map<string, SocketUser>>): Promise<string[]> {
    const connectedUsers = await admission();
    const enqueued: string[] = [];
    await enqueueForOfflineParticipants(
      {
        deliveryQueue: { enqueue: async (key: string) => { enqueued.push(key); } },
        prisma: {
          participant: { findMany: async () => [{ id: PARTICIPANT, userId: USER }] },
          message: { findUnique: async () => null },
        } as unknown as OfflineParticipantQueueDeps['prisma'],
        connectedUsers,
      },
      {
        conversationId: CONV,
        messageId: '507f1f77bcf86cd799439055',
        eventType: 'new',
        payload: { id: '507f1f77bcf86cd799439055' },
      } as OfflineParticipantQueueParams,
    );
    return enqueued;
  }

  it('une jonction ÉCHOUÉE fait enfiler pour ce compte — sans le marqueur, le message ne va nulle part', async () => {
    const enqueued = await enqueueAfter(async () => {
      const h = deps({ sockets: [socketThat('rejects')] });
      await admitUserToConversationRoom(h.deps, USER, CONV);
      return h.connectedUsers;
    });

    expect(enqueued).toEqual([USER]);
  });

  it('une jonction RÉUSSIE ne fait rien enfiler — la room suffit, et doubler remettrait deux fois', async () => {
    const enqueued = await enqueueAfter(async () => {
      const h = deps({ sockets: [socketThat('joins')] });
      await admitUserToConversationRoom(h.deps, USER, CONV);
      return h.connectedUsers;
    });

    expect(enqueued).toEqual([]);
  });
});
