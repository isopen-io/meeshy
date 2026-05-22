/**
 * Unit tests for the `broadcastToUser` helper.
 * These are GREEN — they prove the helper itself behaves correctly.
 * Route-level emission tests live in `conversation-preferences-broadcast.test.ts`
 * and are intentionally RED until Phase 1 wires the emissions.
 */

import type { FastifyInstance } from 'fastify';
import { broadcastToUser, resolveSocketIO } from '../utils/socket-broadcast';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const makeFakeIO = () => {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { io: { to }, emit, to };
};

const makeFastify = (handler: unknown): FastifyInstance =>
  ({ socketIOHandler: handler } as unknown as FastifyInstance);

describe('broadcastToUser', () => {
  test('emits to the user-scoped room when manager.io is present', () => {
    const fake = makeFakeIO();
    const fastify = makeFastify({ getManager: () => ({ io: fake.io }) });

    const ok = broadcastToUser(fastify, 'user-123', SERVER_EVENTS.USER_PREFERENCES_UPDATED, {
      userId: 'user-123',
      conversationId: 'conv-1',
      version: 1,
      reset: false,
      preferences: null,
    });

    expect(ok).toBe(true);
    expect(fake.to).toHaveBeenCalledWith(ROOMS.user('user-123'));
    expect(fake.emit).toHaveBeenCalledWith(
      SERVER_EVENTS.USER_PREFERENCES_UPDATED,
      expect.objectContaining({ conversationId: 'conv-1', version: 1 }),
    );
  });

  test('falls back to handler.io when getManager is missing', () => {
    const fake = makeFakeIO();
    const fastify = makeFastify({ io: fake.io });

    const ok = broadcastToUser(fastify, 'user-9', SERVER_EVENTS.CATEGORY_CREATED, { foo: 1 });

    expect(ok).toBe(true);
    expect(fake.to).toHaveBeenCalledWith(ROOMS.user('user-9'));
    expect(fake.emit).toHaveBeenCalledWith(SERVER_EVENTS.CATEGORY_CREATED, { foo: 1 });
  });

  test('returns false (no throw) when socket layer is absent', () => {
    const fastify = makeFastify(undefined);
    expect(broadcastToUser(fastify, 'u', SERVER_EVENTS.CATEGORY_DELETED, {})).toBe(false);
  });

  test('swallows emit errors and returns false', () => {
    const fastify = makeFastify({
      getManager: () => ({
        io: {
          to: () => ({
            emit: () => {
              throw new Error('boom');
            },
          }),
        },
      }),
    });
    expect(broadcastToUser(fastify, 'u', 'x', {})).toBe(false);
  });

  test('resolveSocketIO returns null without handler', () => {
    expect(resolveSocketIO(makeFastify(undefined))).toBeNull();
  });
});
