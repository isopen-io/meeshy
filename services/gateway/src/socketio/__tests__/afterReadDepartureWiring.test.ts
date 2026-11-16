/**
 * #18556 — le regard d'un lecteur est publié aux autres nœuds par une room, et
 * un départ ne se déclare que si elle est vide dans toute la grappe.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { AFTER_READ_VIEW_STOP_GRACE_MS } from '../AfterReadDepartureTracker';
import {
  afterReadViewRoom,
  createAfterReadDepartureTracker,
  isAfterReadViewedAnywhere,
  isInLiveCall,
  markAfterReadViewing,
  type AfterReadViewIO,
} from '../afterReadDepartureWiring';

const mockConsume = jest.fn<(params: { messageIds: string[] }) => Promise<{ consumed: string[] }>>();
jest.mock('../../services/messaging/afterReadConsumption', () => ({
  consumeAfterReadAndAnnounce: (params: { messageIds: string[] }) => mockConsume(params),
}));

const READER = { conversationId: '507f1f77bcf86cd799439011', participantId: 'p-1', readerKey: 'u-1' };
const ROOM = 'after-read-view:507f1f77bcf86cd799439011:u-1';

function ioWith(rooms: Record<string, unknown[]> = {}) {
  const socket = { join: jest.fn(), leave: jest.fn() };
  const io: AfterReadViewIO = {
    sockets: { sockets: { get: (socketId: string) => (socketId === 's-1' ? socket : undefined) } },
    in: (room: string) => ({ fetchSockets: async () => rooms[room] ?? [] }),
  };
  return { io, socket };
}

describe('la room du regard (#18556)', () => {
  it('nomme la conversation ET le lecteur : deux lecteurs d’une conversation ne se retiennent pas', () => {
    expect(afterReadViewRoom(READER)).toBe(ROOM);
    expect(afterReadViewRoom({ ...READER, readerKey: 'u-2' })).not.toBe(ROOM);
  });

  it('un regard fait entrer le socket dans la room, sa fin l’en sort', () => {
    const { io, socket } = ioWith();

    markAfterReadViewing(io, 's-1', READER, true, () => undefined);
    markAfterReadViewing(io, 's-1', READER, false, () => undefined);

    expect(socket.join).toHaveBeenCalledWith(ROOM);
    expect(socket.leave).toHaveBeenCalledWith(ROOM);
  });

  it('un socket inconnu de ce nœud est ignoré', () => {
    const { io, socket } = ioWith();

    markAfterReadViewing(io, 's-absent', READER, true, () => undefined);

    expect(socket.join).not.toHaveBeenCalled();
  });

  it('une entrée en room qui rejette est remise au journal, jamais levée', async () => {
    const { io, socket } = ioWith();
    const errors: unknown[] = [];
    socket.join.mockImplementation(() => Promise.reject(new Error('adapter down')));

    markAfterReadViewing(io, 's-1', READER, true, (error) => errors.push(error));
    await new Promise((resolve) => setImmediate(resolve));

    expect(errors).toHaveLength(1);
  });

  it('la conversation est regardée ailleurs dès qu’un socket de la grappe tient la room', async () => {
    expect(await isAfterReadViewedAnywhere(ioWith({ [ROOM]: [{}] }).io, READER)).toBe(true);
    expect(await isAfterReadViewedAnywhere(ioWith().io, READER)).toBe(false);
  });

  it('sans serveur joignable, la question lève : l’appelant ne consomme rien', async () => {
    await expect(isAfterReadViewedAnywhere(null, READER)).rejects.toThrow('unreachable');
  });
});

describe('le départ d’un lecteur resté connecté, câblé sur la gateway (#18556)', () => {
  const CONV = '507f1f77bcf86cd799439011';
  const FLAME = '507f1f77bcf86cd799439099';
  const T0 = new Date('2026-11-16T10:00:00.000Z');

  afterEach(() => {
    jest.useRealTimers();
    mockConsume.mockReset();
  });

  function wired(
    clock: { now: Date },
    call: { liveFor: readonly string[]; status?: string; answered?: boolean } = { liveFor: [] },
  ) {
    const callQueries: unknown[] = [];
    const readAt = new Date(T0.getTime() + 30_000);
    const prisma = {
      conversation: { findUnique: async () => null },
      participant: {
        findFirst: async () => ({ id: 'p-1', displayName: 'Lecteur', nickname: null }),
        findMany: async () => [{ id: 'p-1' }, { id: 'p-y' }],
      },
      callParticipant: {
        findMany: async (query: { where: { participantId: { in: string[] } } }) => {
          callQueries.push(query);
          return query.where.participantId.in
            .filter((id) => call.liveFor.includes(id))
            .map((id) => ({
              participantId: id,
              answeredAt: call.answered === false ? null : T0,
              callSession: { status: call.status ?? 'active' },
            }));
        },
      },
      messageStatusEntry: { findMany: async () => [{ messageId: FLAME, exactReadAt: readAt }] },
      message: {
        findMany: async () => [
          {
            id: FLAME,
            effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ,
            expiresAt: new Date(T0.getTime() + 7 * 24 * 3600_000),
          },
        ],
      },
    };
    mockConsume.mockResolvedValue({ consumed: [FLAME] });
    const tracker = createAfterReadDepartureTracker({
      prisma: prisma as never,
      connectedUsers: new Map([['u-1', { id: 'u-1', userId: 'u-1', isAnonymous: false } as never]]),
      socketToUser: new Map([['s-1', 'u-1']]),
      manager: () => null,
      io: () => ioWith().io,
      onError: () => undefined,
      now: () => clock.now,
    });
    return { tracker, callQueries };
  }

  const settle = async () => {
    for (let i = 0; i < 100; i += 1) await Promise.resolve();
  };

  it('viewing:stop sans retour : la flamme lue pendant le regard est consommée après sa grâce', async () => {
    jest.useFakeTimers();
    const clock = { now: T0 };
    const { tracker } = wired(clock);

    await tracker.viewStart('s-1', CONV);
    clock.now = new Date(T0.getTime() + 60_000);
    await tracker.viewStop('s-1', CONV);
    await settle();
    expect(mockConsume).not.toHaveBeenCalled();

    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS);
    await settle();
    expect(mockConsume).toHaveBeenCalledTimes(1);
    expect(mockConsume.mock.calls[0][0]).toMatchObject({ conversationId: CONV, participantId: 'p-1', messageIds: [FLAME] });
  });

  it('viewing:stop puis viewing:start dans la grâce : rien ne brûle', async () => {
    jest.useFakeTimers();
    const clock = { now: T0 };
    const { tracker } = wired(clock);

    await tracker.viewStart('s-1', CONV);
    await tracker.viewStop('s-1', CONV);
    await tracker.viewStart('s-1', CONV);
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS * 10);
    await settle();

    expect(mockConsume).not.toHaveBeenCalled();
  });

  it('un appel VIVANT de la conversation retient le départ : la flamme ne brûle pas pendant l’appel', async () => {
    jest.useFakeTimers();
    const clock = { now: T0 };
    const { tracker, callQueries } = wired(clock, { liveFor: ['p-1'] });

    await tracker.viewStart('s-1', CONV);
    clock.now = new Date(T0.getTime() + 60_000);
    await tracker.viewStop('s-1', CONV);
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS * 10);
    await settle();

    expect(mockConsume).not.toHaveBeenCalled();
    expect(JSON.stringify(callQueries[0])).toContain('p-1');
  });

  it('AUDIT D1 — un appel dans une AUTRE conversation retient aussi le départ : l’écran d’appel couvre tout', async () => {
    jest.useFakeTimers();
    const clock = { now: T0 };
    const { tracker } = wired(clock, { liveFor: ['p-y'] });

    await tracker.viewStart('s-1', CONV);
    clock.now = new Date(T0.getTime() + 60_000);
    await tracker.viewStop('s-1', CONV);
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS * 10);
    await settle();

    expect(mockConsume).not.toHaveBeenCalled();
  });

  it('un appel qui SONNE seulement ne retient rien : les flammes brûlent après la grâce', async () => {
    jest.useFakeTimers();
    const clock = { now: T0 };
    const { tracker } = wired(clock, { liveFor: ['p-1'], status: 'ringing', answered: false });

    await tracker.viewStart('s-1', CONV);
    clock.now = new Date(T0.getTime() + 60_000);
    await tracker.viewStop('s-1', CONV);
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS);
    await settle();

    expect(mockConsume).toHaveBeenCalledTimes(1);
  });

  it('un appel CLOS ne retient rien', async () => {
    jest.useFakeTimers();
    const clock = { now: T0 };
    const { tracker } = wired(clock, { liveFor: [] });

    await tracker.viewStart('s-1', CONV);
    clock.now = new Date(T0.getTime() + 60_000);
    await tracker.viewStop('s-1', CONV);
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS);
    await settle();

    expect(mockConsume).toHaveBeenCalledTimes(1);
  });
});

const ANSWERED = new Date('2026-11-16T09:59:00.000Z');

type CallRow = {
  readonly participantId: string;
  readonly leftAt?: Date | null;
  readonly answeredAt?: Date | null;
  readonly status: string;
};
type CallWhere = {
  readonly OR?: ReadonlyArray<{ readonly leftAt: null | { readonly isSet: boolean } }>;
  readonly participantId: { readonly in: readonly string[] };
};

function prismaHolding(rows: readonly CallRow[], accounts: Record<string, readonly string[]> = {}) {
  const participantLookups: string[] = [];
  const isLive = (row: CallRow, where: CallWhere) =>
    (where.OR ?? [{ leftAt: null }, { leftAt: { isSet: false } }, { leftAt: { isSet: true } }]).some((clause) =>
      clause.leftAt === null
        ? row.leftAt === null
        : clause.leftAt.isSet === (row.leftAt !== undefined) && (clause.leftAt.isSet ? row.leftAt !== null : true),
    );
  const prisma = {
    participant: {
      findMany: async ({ where }: { where: { userId: string } }) => {
        participantLookups.push(where.userId);
        return (accounts[where.userId] ?? []).map((id) => ({ id }));
      },
    },
    callParticipant: {
      findMany: async ({ where }: { where: CallWhere }) =>
        rows
          .filter((row) => where.participantId.in.includes(row.participantId) && isLive(row, where))
          .map((row) => ({ answeredAt: row.answeredAt, callSession: { status: row.status } })),
    },
  };
  return { prisma: prisma as unknown as Parameters<typeof isInLiveCall>[0], participantLookups };
}

describe('isInLiveCall — ce qui retient un départ (#18556, audit A6)', () => {
  const ACCOUNT = { participantId: 'p-1', readerKey: 'u-1' };

  it('un appel ACTIF sur une autre conversation du compte retient', async () => {
    const { prisma } = prismaHolding([{ participantId: 'p-y', leftAt: null, answeredAt: ANSWERED, status: 'active' }], { 'u-1': ['p-1', 'p-y'] });
    await expect(isInLiveCall(prisma, ACCOUNT)).resolves.toBe(true);
  });

  it.each(['ended', 'missed', 'rejected'])('un appel au statut terminal « %s » ne retient rien', async (status) => {
    const { prisma } = prismaHolding([{ participantId: 'p-1', leftAt: null, status }], { 'u-1': ['p-1'] });
    await expect(isInLiveCall(prisma, ACCOUNT)).resolves.toBe(false);
  });

  it('un appel QUITTÉ (leftAt posé) ne retient rien, même si la session vit encore', async () => {
    const { prisma } = prismaHolding([{ participantId: 'p-1', leftAt: new Date(), answeredAt: ANSWERED, status: 'active' }], { 'u-1': ['p-1'] });
    await expect(isInLiveCall(prisma, ACCOUNT)).resolves.toBe(false);
  });

  it('une participation sans leftAt du tout (champ absent) compte comme vivante', async () => {
    const { prisma } = prismaHolding([{ participantId: 'p-1', answeredAt: ANSWERED, status: 'active' }], { 'u-1': ['p-1'] });
    await expect(isInLiveCall(prisma, ACCOUNT)).resolves.toBe(true);
  });

  it('l’appel d’un AUTRE compte ne retient rien', async () => {
    const { prisma } = prismaHolding([{ participantId: 'p-other', leftAt: null, answeredAt: ANSWERED, status: 'active' }], {
      'u-1': ['p-1'],
      'u-2': ['p-other'],
    });
    await expect(isInLiveCall(prisma, ACCOUNT)).resolves.toBe(false);
  });

  it('un INVITÉ n’est cherché que par son propre Participant, sans lecture de compte', async () => {
    const guest = { participantId: 'p-guest', readerKey: 'p-guest' };
    const { prisma, participantLookups } = prismaHolding([{ participantId: 'p-guest', leftAt: null, answeredAt: ANSWERED, status: 'active' }]);

    await expect(isInLiveCall(prisma, guest)).resolves.toBe(true);
    expect(participantLookups).toEqual([]);
  });

  it('un invité ne voit pas l’appel d’un autre Participant', async () => {
    const guest = { participantId: 'p-guest', readerKey: 'p-guest' };
    const { prisma } = prismaHolding([{ participantId: 'p-1', leftAt: null, answeredAt: ANSWERED, status: 'active' }]);
    await expect(isInLiveCall(prisma, guest)).resolves.toBe(false);
  });

  it.each(['initiated', 'ringing', 'connecting'])('un appel « %s » ne retient rien, même décroché', async (status) => {
    const { prisma } = prismaHolding([{ participantId: 'p-1', leftAt: null, answeredAt: ANSWERED, status }], { 'u-1': ['p-1'] });
    await expect(isInLiveCall(prisma, ACCOUNT)).resolves.toBe(false);
  });

  it('un appel actif que le lecteur n’a pas décroché (il sonne seulement) ne retient rien', async () => {
    const { prisma } = prismaHolding([{ participantId: 'p-1', leftAt: null, answeredAt: null, status: 'active' }], {
      'u-1': ['p-1'],
    });
    await expect(isInLiveCall(prisma, ACCOUNT)).resolves.toBe(false);
  });

  it('une participation écrite avant le suivi du décroché (answeredAt absent) ne retient rien', async () => {
    const { prisma } = prismaHolding([{ participantId: 'p-1', leftAt: null, status: 'active' }], { 'u-1': ['p-1'] });
    await expect(isInLiveCall(prisma, ACCOUNT)).resolves.toBe(false);
  });

  it('un appel en reconnexion, décroché, retient encore', async () => {
    const { prisma } = prismaHolding([{ participantId: 'p-1', leftAt: null, answeredAt: ANSWERED, status: 'reconnecting' }], {
      'u-1': ['p-1'],
    });
    await expect(isInLiveCall(prisma, ACCOUNT)).resolves.toBe(true);
  });
});
