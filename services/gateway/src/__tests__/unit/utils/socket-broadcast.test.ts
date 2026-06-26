jest.mock('@meeshy/shared/types/socketio-events', () => ({
  ROOMS: {
    user: (id: string) => `user:${id}`,
  },
}));

import { resolveSocketIO, broadcastToUser } from '../../../utils/socket-broadcast';

function makeEmitSpy() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { to, emit };
}

function makeFastify(shape: 'none' | 'manager' | 'handler-io' | 'no-io' = 'none') {
  const log = { warn: jest.fn() };

  if (shape === 'none') {
    return { log } as any;
  }

  const { to, emit } = makeEmitSpy();
  const io = { to };

  if (shape === 'manager') {
    return {
      log,
      socketIOHandler: {
        getManager: () => ({ io }),
      },
    } as any;
  }

  if (shape === 'handler-io') {
    return {
      log,
      socketIOHandler: { io },
    } as any;
  }

  if (shape === 'no-io') {
    return {
      log,
      socketIOHandler: {},
    } as any;
  }
}

describe('resolveSocketIO', () => {
  it('returns null when socketIOHandler is absent', () => {
    const fastify = makeFastify('none');
    expect(resolveSocketIO(fastify)).toBeNull();
  });

  it('resolves io from handler.getManager().io', () => {
    const fastify = makeFastify('manager');
    const io = resolveSocketIO(fastify);
    expect(io).not.toBeNull();
  });

  it('resolves io from handler.io when getManager is absent', () => {
    const fastify = makeFastify('handler-io');
    const io = resolveSocketIO(fastify);
    expect(io).not.toBeNull();
  });

  it('returns null when handler has no io and no getManager', () => {
    const fastify = makeFastify('no-io');
    expect(resolveSocketIO(fastify)).toBeNull();
  });
});

describe('broadcastToUser', () => {
  it('returns false and logs warn when Socket.IO layer is unavailable', () => {
    const fastify = makeFastify('none');
    const result = broadcastToUser(fastify, 'u1', 'test:event', { data: 1 });
    expect(result).toBe(false);
    expect(fastify.log.warn).toHaveBeenCalled();
  });

  it('emits to the user room and returns true on success', () => {
    const fastify = makeFastify('manager');
    const result = broadcastToUser(fastify, 'user-abc', 'my:event', { key: 'val' });
    expect(result).toBe(true);
    const io = fastify.socketIOHandler.getManager().io;
    expect(io.to).toHaveBeenCalledWith('user:user-abc');
    expect(io.to('user:user-abc').emit).toHaveBeenCalledWith('my:event', { key: 'val' });
  });

  it('returns false and logs warn when emit throws', () => {
    const log = { warn: jest.fn() };
    const fastify = {
      log,
      socketIOHandler: {
        io: {
          to: () => {
            throw new Error('emit exploded');
          },
        },
      },
    } as any;
    const result = broadcastToUser(fastify, 'u1', 'evt', {});
    expect(result).toBe(false);
    expect(log.warn).toHaveBeenCalled();
  });
});
