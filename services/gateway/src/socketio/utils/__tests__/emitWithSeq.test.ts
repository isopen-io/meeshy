/**
 * Tests — emitWithSeq (SyncEngine A2).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { emitWithSeq } from '../emitWithSeq';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import type { Server } from 'socket.io';
import type { SequenceService } from '../../../services/SequenceService';
import type { NotificationEventData } from '@meeshy/shared/types/socketio-events';

/**
 * La charge RÉELLE de `notification:new`, avec `content` en MARQUEUR d'ordre.
 *
 * Ce fichier passait des esquisses (`{ title: 'hi' }`, `{ n: 'a' }`,
 * `{ a: 1, b: 'x', nested: { k: true } }`), ce que `payload:
 * Record<string, unknown>` acceptait. Depuis que `emitWithSeq` est générique sur
 * le nom de l'événement (cycle 105), la charge est vérifiée contre
 * `ServerToClientEvents`.
 *
 * Le marqueur est déplacé sur un champ du CONTRAT plutôt que sur une clé
 * inventée : ce que ces témoins gardent — l'ordre d'émission, la monotonie du
 * `_seq`, la dégradation SANS `_seq` — est inchangé, et ils l'attestent
 * désormais sur une charge que l'émetteur produirait vraiment.
 */
function notif(marker: string): NotificationEventData {
  return {
    id: `n-${marker}`,
    userId: 'u1',
    type: 'system',
    content: marker,
    state: { isRead: false, readAt: null, createdAt: new Date('2026-08-23T10:00:00.000Z') },
  };
}

function makeIO() {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  return { io: { to } as unknown as Server, to, emit };
}

describe('emitWithSeq', () => {
  it('stamps a monotonically increasing _seq and emits to the user room', async () => {
    const { io, to, emit } = makeIO();
    let counter = 0;
    const seq = { nextSeq: jest.fn<() => Promise<number>>(async () => ++counter) } as unknown as SequenceService;

    await emitWithSeq(io, seq, 'u1', 'notification:new', notif('hi'));
    await emitWithSeq(io, seq, 'u1', 'notification:new', notif('again'));

    // Registered sockets only ever join `ROOMS.user(id)` (= `user:${id}`), so a
    // user-scoped event MUST target that room. Emitting to the raw `userId`
    // room delivers to nobody — the real-time notification would be lost.
    expect(to).toHaveBeenCalledWith(ROOMS.user('u1'));
    expect(to).not.toHaveBeenCalledWith('u1');
    expect(emit).toHaveBeenNthCalledWith(1, 'notification:new', { ...notif('hi'), _seq: 1 });
    expect(emit).toHaveBeenNthCalledWith(2, 'notification:new', { ...notif('again'), _seq: 2 });
  });

  it('preserves the original payload fields alongside _seq', async () => {
    const { io, emit } = makeIO();
    const seq = { nextSeq: jest.fn<() => Promise<number>>().mockResolvedValue(42) } as unknown as SequenceService;

    await emitWithSeq(io, seq, 'u2', 'notification:new', notif('rich'));

    expect(emit).toHaveBeenCalledWith('notification:new', { ...notif('rich'), _seq: 42 });
  });

  it('emits _seq in strictly monotonic order even when nextSeq resolutions race', async () => {
    const { io, emit } = makeIO();
    // Model the real hazard: the DB assigns distinct, gapless seq values in call
    // order, but the awaited promises can RESOLVE out of order (concurrent calls
    // run on different pooled connections). Here the first-allocated seq resolves
    // slower than the second — so a naive implementation emits _seq=2 before _seq=1.
    let counter = 0;
    const seq = {
      nextSeq: jest.fn<() => Promise<number>>(async () => {
        const value = ++counter;
        await new Promise((resolve) => setTimeout(resolve, value === 1 ? 30 : 0));
        return value;
      }),
    } as unknown as SequenceService;

    await Promise.all([
      emitWithSeq(io, seq, 'u-race', 'notification:new', notif('a')),
      emitWithSeq(io, seq, 'u-race', 'notification:new', notif('b')),
    ]);

    const emittedSeqs = emit.mock.calls.map((call) => (call[1] as { _seq: number })._seq);
    // Emission order MUST match allocation order — otherwise the client advances
    // lastSeq to the higher value and drops the lower _seq as a stale duplicate.
    expect(emittedSeqs).toEqual([1, 2]);
  });

  it('serializes per-user without cross-user head-of-line blocking', async () => {
    const { io, emit } = makeIO();
    const seq = {
      nextSeq: jest.fn<(userId: string) => Promise<number>>(async () => 1),
    } as unknown as SequenceService;

    await Promise.all([
      emitWithSeq(io, seq, 'user-a', 'notification:new', notif('a')),
      emitWithSeq(io, seq, 'user-b', 'notification:new', notif('b')),
    ]);

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith('notification:new', { ...notif('a'), _seq: 1 });
    expect(emit).toHaveBeenCalledWith('notification:new', { ...notif('b'), _seq: 1 });
  });

  it('emits WITHOUT _seq (never blocks) when sequence allocation fails', async () => {
    const { io, emit } = makeIO();
    const seq = { nextSeq: jest.fn<() => Promise<number>>().mockRejectedValue(new Error('mongo down')) } as unknown as SequenceService;

    await expect(emitWithSeq(io, seq, 'u3', 'notification:new', notif('resilient'))).resolves.toBeUndefined();

    expect(emit).toHaveBeenCalledWith('notification:new', notif('resilient'));
    expect(emit.mock.calls[0][1]).not.toHaveProperty('_seq');
  });

  it('emits WITHOUT _seq (never blocks) when sequence allocation STALLS past the timeout', async () => {
    const { io, emit } = makeIO();
    // A stalled Mongo op (replica-set election, pool exhaustion) neither resolves
    // nor rejects. Without a bound this awaits forever and head-of-line-blocks
    // every subsequent real-time event for the user — violating the module's
    // "emit never blocks the real-time path" invariant. A tiny timeout keeps the
    // test deterministic on real timers.
    const seq = {
      nextSeq: jest.fn<() => Promise<number>>(() => new Promise<number>(() => {})),
    } as unknown as SequenceService;

    await expect(
      emitWithSeq(io, seq, 'u-stall', 'notification:new', notif('live'), 10),
    ).resolves.toBeUndefined();

    expect(emit).toHaveBeenCalledWith('notification:new', notif('live'));
    expect(emit.mock.calls[0][1]).not.toHaveProperty('_seq');
  });

  it('a stalled allocation does not permanently poison the per-user chain', async () => {
    const { io, emit } = makeIO();
    let call = 0;
    const seq = {
      nextSeq: jest.fn<() => Promise<number>>(() => {
        call += 1;
        // First allocation stalls forever; the sequence source then recovers.
        return call === 1 ? new Promise<number>(() => {}) : Promise.resolve(7);
      }),
    } as unknown as SequenceService;

    await emitWithSeq(io, seq, 'u-recover', 'notification:new', notif('first'), 10);
    await emitWithSeq(io, seq, 'u-recover', 'notification:new', notif('second'), 10);

    expect(emit).toHaveBeenNthCalledWith(1, 'notification:new', notif('first'));
    expect(emit.mock.calls[0][1]).not.toHaveProperty('_seq');
    expect(emit).toHaveBeenNthCalledWith(2, 'notification:new', { ...notif('second'), _seq: 7 });
  });

  // ─── La chaîne de nettoyage détachée ────────────────────────────────────
  //
  // `emitWithSeq` retire sa queue de la Map par `void next.finally(…)`. `.finally`
  // ADOPTE le sort de `next` : quand l'emit lève (adaptateur Redis, encodeur),
  // la promesse DÉRIVÉE rejette — et elle, personne ne la tient, pas même un
  // appelant qui garde consciencieusement le `next` qu'on lui rend. Les deux
  // témoins ci-dessous sont donc disjoints : le premier dit que l'appelant voit
  // bien l'erreur, le second qu'AUCUNE promesse ne reste sans écouteur.

  /**
   * Jumeau du helper de `MeeshySocketIOManager.test.ts` : une promesse détachée
   * ne se prouve pas par le retour de son appelant — seul le verdict du runtime
   * distingue « gardée » d'« abandonnée ».
   */
  async function captureUnhandledRejections(body: () => Promise<void>): Promise<unknown[]> {
    const captured: unknown[] = [];
    const onUnhandled = (reason: unknown) => { captured.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      await body();
      await new Promise<void>(resolve => setImmediate(resolve));
      await new Promise<void>(resolve => setImmediate(resolve));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    return captured;
  }

  function makeFailingIO(error: Error) {
    const emit = jest.fn(() => { throw error; });
    const to = jest.fn().mockReturnValue({ emit });
    return { io: { to } as unknown as Server, emit };
  }

  it('rend l\'échec de l\'emit à son appelant', async () => {
    const adapterDown = new Error('socket.io adapter unavailable');
    const { io } = makeFailingIO(adapterDown);
    const seq = { nextSeq: jest.fn<() => Promise<number>>().mockResolvedValue(1) } as unknown as SequenceService;

    await expect(emitWithSeq(io, seq, 'u-fail', 'notification:new', notif('x'))).rejects.toBe(adapterDown);
  });

  it('ne laisse AUCUN rejet sans écouteur quand l\'emit lève et que l\'appelant garde la promesse', async () => {
    const adapterDown = new Error('socket.io adapter unavailable');
    const { io } = makeFailingIO(adapterDown);
    const seq = { nextSeq: jest.fn<() => Promise<number>>().mockResolvedValue(1) } as unknown as SequenceService;

    const unhandled = await captureUnhandledRejections(async () => {
      await emitWithSeq(io, seq, 'u-detached', 'notification:new', notif('x')).catch(() => {});
    });

    expect(unhandled).toEqual([]);
  });

  it('la queue du user est retirée de la Map même quand l\'emit lève', async () => {
    const adapterDown = new Error('socket.io adapter unavailable');
    const { io, emit } = makeFailingIO(adapterDown);
    const seq = { nextSeq: jest.fn<() => Promise<number>>().mockResolvedValue(1) } as unknown as SequenceService;

    // Un échec ne doit pas poisonner la chaîne : l'appel suivant repart d'une
    // queue propre — c'est le travail que le `.finally` doit encore faire, et
    // que le `.catch` ajouté ne doit pas court-circuiter.
    await emitWithSeq(io, seq, 'u-cleanup', 'notification:new', notif('1')).catch(() => {});
    await emitWithSeq(io, seq, 'u-cleanup', 'notification:new', notif('2')).catch(() => {});

    expect(emit).toHaveBeenCalledTimes(2);
  });
});
