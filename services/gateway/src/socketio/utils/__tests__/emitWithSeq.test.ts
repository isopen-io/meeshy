/**
 * Tests — emitWithSeq (SyncEngine A2).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { emitWithSeq } from '../emitWithSeq';
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

    expect(to).toHaveBeenCalledWith('u1');
    expect(emit).toHaveBeenNthCalledWith(1, 'notification:new', { title: 'hi', _seq: 1 });
    expect(emit).toHaveBeenNthCalledWith(2, 'notification:new', { title: 'again', _seq: 2 });
  });

  it('preserves the original payload fields alongside _seq', async () => {
    const { io, emit } = makeIO();
    const seq = { nextSeq: jest.fn<() => Promise<number>>().mockResolvedValue(42) } as unknown as SequenceService;

    await emitWithSeq(io, seq, 'u2', 'notification:new', { a: 1, b: 'x', nested: { k: true } });

    expect(emit).toHaveBeenCalledWith('notification:new', { a: 1, b: 'x', nested: { k: true }, _seq: 42 });
  });

  it('emits WITHOUT _seq (never blocks) when sequence allocation fails', async () => {
    const { io, emit } = makeIO();
    const seq = { nextSeq: jest.fn<() => Promise<number>>().mockRejectedValue(new Error('mongo down')) } as unknown as SequenceService;

    await expect(emitWithSeq(io, seq, 'u3', 'notification:new', { title: 'resilient' })).resolves.toBeUndefined();

    expect(emit).toHaveBeenCalledWith('notification:new', { title: 'resilient' });
    expect(emit.mock.calls[0][1]).not.toHaveProperty('_seq');
  });

  it('emits in strict allocation order for the same user even when DB round-trips resolve out of order', async () => {
    const { io, emit } = makeIO();
    // Allocation is monotonic (1 then 2), but the FIRST call's round-trip
    // resolves AFTER the second's — the exact interleave that made the old
    // implementation emit _seq=2 before _seq=1.
    let allocation = 0;
    const resolvers: Array<() => void> = [];
    const seq = {
      nextSeq: jest.fn<() => Promise<number>>(() => {
        const value = ++allocation;
        return new Promise<number>((resolve) => {
          resolvers.push(() => resolve(value));
        });
      }),
    } as unknown as SequenceService;

    const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

    const first = emitWithSeq(io, seq, 'u1', 'notification:new', { title: 'first' });
    const second = emitWithSeq(io, seq, 'u1', 'notification:new', { title: 'second' });

    // Serialization means only the first allocation has been requested so far;
    // the second is chained and cannot allocate until the first emit flushes.
    await flush();
    expect(resolvers).toHaveLength(1);
    // Resolve it, let the first emit flush, then the second allocation fires.
    resolvers[0]();
    await first;
    await flush();
    expect(resolvers).toHaveLength(2);
    resolvers[1]();
    await second;

    expect(emit).toHaveBeenNthCalledWith(1, 'notification:new', { title: 'first', _seq: 1 });
    expect(emit).toHaveBeenNthCalledWith(2, 'notification:new', { title: 'second', _seq: 2 });
  });

  it('recovers the per-user chain when one emit throws (does not wedge later emits)', async () => {
    const emit = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('socket write failed');
      })
      .mockImplementation(() => undefined);
    const to = jest.fn().mockReturnValue({ emit });
    const io = { to } as unknown as Server;
    let counter = 0;
    const seq = { nextSeq: jest.fn<() => Promise<number>>(async () => ++counter) } as unknown as SequenceService;

    await expect(emitWithSeq(io, seq, 'u1', 'notification:new', { title: 'boom' })).rejects.toThrow('socket write failed');
    // The failed emit must NOT block the next event for the same user.
    await emitWithSeq(io, seq, 'u1', 'notification:new', { title: 'recovered' });

    expect(emit).toHaveBeenNthCalledWith(2, 'notification:new', { title: 'recovered', _seq: 2 });
  });

  it('serializes per-user but keeps distinct users concurrent', async () => {
    const { io, emit } = makeIO();
    const counters: Record<string, number> = {};
    const seq = {
      nextSeq: jest.fn<(userId: string) => Promise<number>>(async (userId: string) => {
        counters[userId] = (counters[userId] ?? 0) + 1;
        return counters[userId];
      }),
    } as unknown as SequenceService;

    await Promise.all([
      emitWithSeq(io, seq, 'ua', 'notification:new', { u: 'a1' }),
      emitWithSeq(io, seq, 'ub', 'notification:new', { u: 'b1' }),
      emitWithSeq(io, seq, 'ua', 'notification:new', { u: 'a2' }),
      emitWithSeq(io, seq, 'ub', 'notification:new', { u: 'b2' }),
    ]);

    const byUser = (u: string) =>
      emit.mock.calls.filter((c) => (c[1] as { u: string }).u.startsWith(u)).map((c) => (c[1] as { _seq: number })._seq);
    expect(byUser('a')).toEqual([1, 2]);
    expect(byUser('b')).toEqual([1, 2]);
  });
});
