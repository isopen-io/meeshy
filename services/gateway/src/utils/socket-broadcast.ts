/**
 * Socket.IO broadcast helpers.
 *
 * Best-effort emission to a target room: if Socket.IO is not yet
 * bootstrapped (e.g. during early server warmup or in tests without
 * the WS layer), calls become no-ops rather than throwing — REST
 * paths must not fail because of a side-channel.
 */

import type { FastifyInstance } from 'fastify';
import { ROOMS } from '@meeshy/shared/types/socketio-events';

interface SocketIOLike {
  to(room: string): { emit(event: string, payload: unknown): unknown };
}

/**
 * Resolve the Socket.IO server from the Fastify instance, accepting
 * both the `socketIOHandler.getManager().io` shape (production wiring)
 * and the `socketIOHandler.io` shape (compatibility / older tests).
 *
 * Exposed for unit-testing the resolution path; route code should call
 * `broadcastToUser` instead.
 */
export function resolveSocketIO(fastify: FastifyInstance): SocketIOLike | null {
  const handler = (fastify as unknown as { socketIOHandler?: unknown }).socketIOHandler;
  if (!handler) return null;

  const managerGetter = (handler as { getManager?: () => unknown }).getManager;
  const manager = typeof managerGetter === 'function' ? managerGetter.call(handler) : undefined;
  const ioFromManager = (manager as { io?: SocketIOLike } | undefined)?.io;
  if (ioFromManager) return ioFromManager;

  const ioFromHandler = (handler as { io?: SocketIOLike }).io;
  if (ioFromHandler) return ioFromHandler;

  return null;
}

/**
 * Emit `event` with `payload` to the user-scoped room (`user:{userId}`).
 * Multi-device delivery is automatic via Socket.IO room fanout.
 *
 * Returns `true` if the broadcast was dispatched, `false` if the
 * Socket.IO layer was unavailable (call site can stay silent).
 */
export function broadcastToUser(
  fastify: FastifyInstance,
  userId: string,
  event: string,
  payload: unknown,
): boolean {
  const io = resolveSocketIO(fastify);
  if (!io) return false;
  try {
    io.to(ROOMS.user(userId)).emit(event, payload);
    return true;
  } catch {
    return false;
  }
}
