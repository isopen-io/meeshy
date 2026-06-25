/**
 * Unit tests for socket-broadcast utilities.
 * Covers: resolveSocketIO (no handler, getManager path, direct io path,
 * getManager returns undefined io), broadcastToUser (no io → false,
 * emit success → true, emit throws → false + warn).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { resolveSocketIO, broadcastToUser } from '../../../utils/socket-broadcast';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEmit() {
  return { emit: jest.fn<any>() };
}

function makeIo(room: string) {
  const target = makeEmit();
  return {
    to: jest.fn<any>().mockReturnValue(target),
    _target: target,
  };
}

function makeFastify(socketIOHandler?: unknown) {
  return {
    socketIOHandler,
    log: {
      warn: jest.fn<any>(),
    },
  } as unknown as any;
}

// ─── resolveSocketIO ──────────────────────────────────────────────────────────

describe('resolveSocketIO', () => {
  it('returns null when fastify has no socketIOHandler', () => {
    const fastify = makeFastify(undefined);
    expect(resolveSocketIO(fastify)).toBeNull();
  });

  it('returns io via getManager().io path', () => {
    const io = makeIo('room');
    const handler = {
      getManager: jest.fn<any>().mockReturnValue({ io }),
    };
    const fastify = makeFastify(handler);

    expect(resolveSocketIO(fastify)).toBe(io);
  });

  it('falls back to handler.io when getManager is absent', () => {
    const io = makeIo('room');
    const handler = { io };
    const fastify = makeFastify(handler);

    expect(resolveSocketIO(fastify)).toBe(io);
  });

  it('falls back to handler.io when getManager returns no io', () => {
    const io = makeIo('room');
    const handler = {
      getManager: jest.fn<any>().mockReturnValue({ io: undefined }),
      io,
    };
    const fastify = makeFastify(handler);

    expect(resolveSocketIO(fastify)).toBe(io);
  });

  it('returns null when handler has neither getManager nor io', () => {
    const fastify = makeFastify({});
    expect(resolveSocketIO(fastify)).toBeNull();
  });
});

// ─── broadcastToUser ─────────────────────────────────────────────────────────

describe('broadcastToUser', () => {
  it('returns false and warns when Socket.IO layer is unavailable', () => {
    const fastify = makeFastify(undefined);

    const result = broadcastToUser(fastify, 'user-1', 'test:event', { foo: 'bar' });

    expect(result).toBe(false);
    expect(fastify.log.warn).toHaveBeenCalled();
  });

  it('returns true and emits when IO is available', () => {
    const target = { emit: jest.fn<any>() };
    const io = { to: jest.fn<any>().mockReturnValue(target) };
    const handler = {
      getManager: jest.fn<any>().mockReturnValue({ io }),
    };
    const fastify = makeFastify(handler);

    const result = broadcastToUser(fastify, 'user-42', 'message:new', { id: 'msg-1' });

    expect(result).toBe(true);
    expect(io.to).toHaveBeenCalledWith(expect.stringContaining('user-42'));
    expect(target.emit).toHaveBeenCalledWith('message:new', { id: 'msg-1' });
  });

  it('returns false and warns when emit throws', () => {
    const target = {
      emit: jest.fn<any>().mockImplementation(() => { throw new Error('socket disconnected'); }),
    };
    const io = { to: jest.fn<any>().mockReturnValue(target) };
    const handler = { getManager: jest.fn<any>().mockReturnValue({ io }) };
    const fastify = makeFastify(handler);

    const result = broadcastToUser(fastify, 'user-5', 'presence:update', {});

    expect(result).toBe(false);
    expect(fastify.log.warn).toHaveBeenCalled();
  });

  it('passes the exact payload to emit', () => {
    const target = { emit: jest.fn<any>() };
    const io = { to: jest.fn<any>().mockReturnValue(target) };
    const fastify = makeFastify({ io });
    const payload = { data: [1, 2, 3], extra: true };

    broadcastToUser(fastify, 'user-99', 'notification:push', payload);

    expect(target.emit).toHaveBeenCalledWith('notification:push', payload);
  });
});
