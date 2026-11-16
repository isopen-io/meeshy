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

  function wired(clock: { now: Date }, call: { live: boolean } = { live: false }) {
    const callQueries: unknown[] = [];
    const readAt = new Date(T0.getTime() + 30_000);
    const prisma = {
      conversation: { findUnique: async () => null },
      participant: { findFirst: async () => ({ id: 'p-1', displayName: 'Lecteur', nickname: null }) },
      callParticipant: {
        findFirst: async (query: unknown) => {
          callQueries.push(query);
          return call.live ? { id: 'cp-1' } : null;
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

  it('viewing:stop sans retour : la flamme lue pendant le regard est consommée après la grâce courte', async () => {
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
    const { tracker, callQueries } = wired(clock, { live: true });

    await tracker.viewStart('s-1', CONV);
    await tracker.viewStop('s-1', CONV);
    jest.advanceTimersByTime(AFTER_READ_VIEW_STOP_GRACE_MS * 10);
    await settle();

    expect(mockConsume).not.toHaveBeenCalled();
    expect(JSON.stringify(callQueries[0])).toContain('p-1');
    expect(JSON.stringify(callQueries[0])).toContain(CONV);
    expect(JSON.stringify(callQueries[0])).toContain('reconnecting');
  });
});
