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

/**
 * La charge RÉELLE de `category:created`, copiée clé par clé.
 *
 * Ce témoin passait `{ foo: 1 }` — ce que `payload: unknown` acceptait. Depuis
 * que `broadcastToUser` est générique sur le nom de l'événement (cycle 104), la
 * charge est vérifiée contre `ServerToClientEvents` aux DOUZE sites d'appel de
 * la production comme ici. Ce que ce témoin garde — la RÉSOLUTION de la couche
 * Socket.IO à travers ses trois formes — est inchangé.
 */
const CATEGORY_CREATED_PAYLOAD = {
  userId: 'user-9',
  category: {
    id: 'cat-1',
    userId: 'user-9',
    name: 'Travail',
    color: null,
    icon: null,
    order: 0,
    isExpanded: true,
    createdAt: '2026-08-23T10:00:00.000Z',
    updatedAt: '2026-08-23T10:00:00.000Z',
  },
} as const;

const makeFastify = (handler: unknown): FastifyInstance =>
  ({
    socketIOHandler: handler,
    log: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
  } as unknown as FastifyInstance);

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

    const ok = broadcastToUser(fastify, 'user-9', SERVER_EVENTS.CATEGORY_CREATED, CATEGORY_CREATED_PAYLOAD);

    expect(ok).toBe(true);
    expect(fake.to).toHaveBeenCalledWith(ROOMS.user('user-9'));
    expect(fake.emit).toHaveBeenCalledWith(SERVER_EVENTS.CATEGORY_CREATED, CATEGORY_CREATED_PAYLOAD);
  });

  test('returns false (no throw) and logs a warning when socket layer is absent', () => {
    const fastify = makeFastify(undefined);
    expect(broadcastToUser(fastify, 'u', SERVER_EVENTS.CATEGORY_DELETED, {
      userId: 'u',
      categoryId: 'cat-1',
    })).toBe(false);
    expect((fastify.log.warn as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u', event: SERVER_EVENTS.CATEGORY_DELETED }),
      expect.stringContaining('Socket.IO layer unavailable'),
    );
  });

  test('swallows emit errors, returns false, and logs the failure', () => {
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
    expect((fastify.log.warn as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u', event: 'x', err: expect.any(Error) }),
      expect.stringContaining('emit failed'),
    );
  });

  test('resolveSocketIO returns null without handler', () => {
    expect(resolveSocketIO(makeFastify(undefined))).toBeNull();
  });

  test('resolveSocketIO returns null when handler has no io and getManager is not a function', () => {
    const fastify = makeFastify({ getManager: 'not-a-function' });
    expect(resolveSocketIO(fastify)).toBeNull();
  });

  test('resolveSocketIO returns null when handler has getManager returning no io and no direct io', () => {
    const fastify = makeFastify({ getManager: () => ({}) });
    expect(resolveSocketIO(fastify)).toBeNull();
  });
});
