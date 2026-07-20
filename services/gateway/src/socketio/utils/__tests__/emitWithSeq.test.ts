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

    await emitWithSeq(io, seq, 'u1', 'notification:new', { title: 'hi' });
    await emitWithSeq(io, seq, 'u1', 'notification:new', { title: 'again' });

    // Registered sockets only ever join `ROOMS.user(id)` (= `user:${id}`), so a
    // user-scoped event MUST target that room. Emitting to the raw `userId`
    // room delivers to nobody — the real-time notification would be lost.
    expect(to).toHaveBeenCalledWith(ROOMS.user('u1'));
    expect(to).not.toHaveBeenCalledWith('u1');
    expect(emit).toHaveBeenNthCalledWith(1, 'notification:new', { title: 'hi', _seq: 1 });
    expect(emit).toHaveBeenNthCalledWith(2, 'notification:new', { title: 'again', _seq: 2 });
  });

  it('preserves the original payload fields alongside _seq', async () => {
    const { io, emit } = makeIO();
    const seq = { nextSeq: jest.fn<() => Promise<number>>().mockResolvedValue(42) } as unknown as SequenceService;

    await emitWithSeq(io, seq, 'u2', 'notification:new', { a: 1, b: 'x', nested: { k: true } });

    expect(emit).toHaveBeenCalledWith('notification:new', { a: 1, b: 'x', nested: { k: true }, _seq: 42 });
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
      emitWithSeq(io, seq, 'u-race', 'notification:new', { n: 'a' }),
      emitWithSeq(io, seq, 'u-race', 'notification:new', { n: 'b' }),
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
      emitWithSeq(io, seq, 'user-a', 'notification:new', { n: 'a' }),
      emitWithSeq(io, seq, 'user-b', 'notification:new', { n: 'b' }),
    ]);

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith('notification:new', { n: 'a', _seq: 1 });
    expect(emit).toHaveBeenCalledWith('notification:new', { n: 'b', _seq: 1 });
  });

  it('emits WITHOUT _seq (never blocks) when sequence allocation fails', async () => {
    const { io, emit } = makeIO();
    const seq = { nextSeq: jest.fn<() => Promise<number>>().mockRejectedValue(new Error('mongo down')) } as unknown as SequenceService;

    await expect(emitWithSeq(io, seq, 'u3', 'notification:new', { title: 'resilient' })).resolves.toBeUndefined();

    expect(emit).toHaveBeenCalledWith('notification:new', { title: 'resilient' });
    expect(emit.mock.calls[0][1]).not.toHaveProperty('_seq');
  });
});
