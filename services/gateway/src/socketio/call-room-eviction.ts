import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { logger } from '../utils/logger';
import type { MeeshyIOServer } from './typed-socket';

export type CallRoomSocket = Awaited<ReturnType<ReturnType<MeeshyIOServer['in']>['fetchSockets']>>[number];

export type StaleSameUserEviction = {
  readonly io: MeeshyIOServer;
  readonly callId: string;
  readonly userId: string;
  readonly socketId: string;
  readonly getUserId: (socketId: string) => string | undefined;
};

/**
 * C8 — a user re-joining from a NEW socket (churn, second tab, post-restart
 * reconnect) leaves stale sockets of the SAME user in the call room: every
 * targeted signal would fan out to N sockets. Last join wins: our own older
 * sockets are evicted. Best-effort — an eviction failure never fails the join.
 *
 * Returns the room as it stands after the eviction, so the caller announces
 * the join without listing the room a second time (#9087) — `null` when the
 * listing or an eviction failed, the caller then lists the room afresh.
 */
export async function evictStaleSameUserSockets(
  input: StaleSameUserEviction,
): Promise<ReadonlyArray<CallRoomSocket> | null> {
  const room = ROOMS.call(input.callId);
  try {
    const roomSockets = await input.io.in(room).fetchSockets();
    const stale = roomSockets.filter((s) => s.id !== input.socketId && input.getUserId(s.id) === input.userId);
    stale.forEach((s) => {
      s.leave(room);
      logger.info('📞 C8 — evicted stale same-user socket from call room', {
        callId: input.callId, userId: input.userId, staleSocketId: s.id, newSocketId: input.socketId
      });
    });
    return roomSockets.filter((s) => !stale.includes(s));
  } catch (evictError) {
    logger.warn('📞 C8 — same-user socket eviction failed (join unaffected)', { callId: input.callId, evictError });
    return null;
  }
}
