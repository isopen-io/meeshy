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
import {
  emitServerEvent,
  type ServerEmitIO,
  type ServerEventName,
  type ServerEventPayload,
} from '../socketio/serverEmit';

type SocketIOLike = ServerEmitIO;

/**
 * Resolve the Socket.IO server from the Fastify instance.
 *
 * Three shapes are accepted, in this order:
 *  1. `socketIOHandler.getManager().getIO()` — the manager's PUBLIC accessor,
 *     and the only one production wiring actually declares;
 *  2. `socketIOHandler.getManager().io` — the same object read straight off
 *     the manager's PRIVATE field;
 *  3. `socketIOHandler.io` — flat handler shape used by some doubles.
 *
 * The public accessor comes first on purpose. `MeeshySocketIOManager.io` is
 * declared `private`, and only the erasure of TypeScript modifiers at runtime
 * ever made shape 2 resolve. Renaming that private field — an internal move
 * with no TypeScript caller to break — would have silently degraded every
 * caller of `broadcastToUser` into a `warn` + no-op, taking the real-time
 * pin/mute/archive sync (`conversationPreferencesSync`) down with it. Shape 2
 * is kept as a fallback for the doubles that model the manager that way.
 *
 * Exposed for unit-testing the resolution path; route code should call
 * `broadcastToUser` instead.
 */
export function resolveSocketIO(fastify: FastifyInstance): SocketIOLike | null {
  const handler = (fastify as unknown as { socketIOHandler?: unknown }).socketIOHandler;
  if (!handler) return null;

  // La résolution est appelée AVANT le `try` de `broadcastToUser` : une
  // exception ici remonterait jusqu'au gestionnaire de route et ferait échouer
  // une écriture REST à cause d'un canal latéral — exactement ce que la
  // promesse de no-op de ce module exclut. Elle traverse deux appels
  // (`getManager()`, `getIO()`) dont on ne contrôle pas les implémentations.
  try {
    const managerGetter = (handler as { getManager?: () => unknown }).getManager;
    const manager = typeof managerGetter === 'function' ? managerGetter.call(handler) : undefined;

    const ioGetter = (manager as { getIO?: () => SocketIOLike | null } | undefined)?.getIO;
    const ioFromAccessor = typeof ioGetter === 'function' ? ioGetter.call(manager) : undefined;
    if (ioFromAccessor) return ioFromAccessor;

    const ioFromManager = (manager as { io?: SocketIOLike } | undefined)?.io;
    if (ioFromManager) return ioFromManager;

    const ioFromHandler = (handler as { io?: SocketIOLike }).io;
    if (ioFromHandler) return ioFromHandler;

    return null;
  } catch {
    return null;
  }
}

/**
 * Emit `event` with `payload` to the user-scoped room (`user:{userId}`).
 * Multi-device delivery is automatic via Socket.IO room fanout.
 *
 * Returns `true` if the broadcast was dispatched, `false` if the
 * Socket.IO layer was unavailable. Both failure modes (no IO, emit
 * throw) are logged at `warn` so a missed broadcast is correlatable
 * with the originating REST request.
 */
export function broadcastToUser<E extends ServerEventName>(
  fastify: FastifyInstance,
  userId: string,
  event: E,
  payload: ServerEventPayload<E>,
): boolean {
  const io = resolveSocketIO(fastify);
  if (!io) {
    fastify.log.warn({ userId, event }, 'broadcastToUser: Socket.IO layer unavailable');
    return false;
  }
  try {
    emitServerEvent(io.to(ROOMS.user(userId)), event, payload);
    return true;
  } catch (error) {
    fastify.log.warn({ userId, event, err: error }, 'broadcastToUser: emit failed');
    return false;
  }
}
