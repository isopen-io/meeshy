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
  it('stamps a monotonically increasing _seq and emits to the canonical user room', async () => {
    const { io, to, emit } = makeIO();
    let counter = 0;
    const seq = { nextSeq: jest.fn<() => Promise<number>>(async () => ++counter) } as unknown as SequenceService;

    await emitWithSeq(io, seq, 'u1', 'notification:new', { title: 'hi' });
    await emitWithSeq(io, seq, 'u1', 'notification:new', { title: 'again' });

    // Registered recipients only ever join `ROOMS.user(id)` (= `user:${id}`);
    // emitting to the bare id targets an empty room and drops the event.
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

  it('emits WITHOUT _seq (never blocks) when sequence allocation fails', async () => {
    const { io, emit } = makeIO();
    const seq = { nextSeq: jest.fn<() => Promise<number>>().mockRejectedValue(new Error('mongo down')) } as unknown as SequenceService;

    await expect(emitWithSeq(io, seq, 'u3', 'notification:new', { title: 'resilient' })).resolves.toBeUndefined();

    expect(emit).toHaveBeenCalledWith('notification:new', { title: 'resilient' });
    expect(emit.mock.calls[0][1]).not.toHaveProperty('_seq');
  });
});
