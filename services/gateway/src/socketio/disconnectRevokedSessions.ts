import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { AuthSessionRevokedEventData } from '@meeshy/shared/types/socketio-events';
import type { ServerEmitSocket } from './serverEmit';

/**
 * A connected socket, reduced to the two verbs a revocation needs. Kept
 * structural — same convention as `emitMentionCreated` / `participantUserRooms`
 * — so the production `Server`, the manager's nullable `getIO()` and a test
 * double all satisfy it. `fetchSockets()` hands back `RemoteSocket`s, which
 * carry exactly these two.
 */
export interface RevokedSessionSocket extends ServerEmitSocket {
  disconnect(close?: boolean): unknown;
}

export interface RevokedSessionIO {
  in(room: string): { fetchSockets(): Promise<RevokedSessionSocket[]> };
}

const DEFAULT_MESSAGES: Record<AuthSessionRevokedEventData['reason'], string> = {
  password_changed: 'Your password was changed — please sign in again.',
  logout_all_devices: 'All sessions were signed out — please sign in again.',
  admin_revoke: 'Your session was revoked — please sign in again.',
};

export interface DisconnectRevokedSessionsParams {
  io: RevokedSessionIO | null | undefined;
  /** `User.id`. Registered sockets join `ROOMS.user(user.id)` at auth. */
  userId: string;
  reason: AuthSessionRevokedEventData['reason'];
  message?: string;
  onError?: (error: unknown) => void;
}

/**
 * Cut every live Socket.IO channel a user holds, after every one of their
 * sessions has been invalidated in the database.
 *
 * **`auth:session-revoked` had no emitter at all.** The event is declared in
 * `packages/shared/types/socketio-events.ts` with a `reason` enum written for
 * exactly the three call sites below, and the web client has listened for it
 * since it was added (`connection.service.ts` → `onSessionRevoked` → forced
 * logout). Only the server half was never built, so every total-revocation path
 * invalidated rows in `UserSession` and left the revoked device's socket
 * connected: it kept receiving `message:new`, `conversation:updated` and every
 * other broadcast, indefinitely, because a socket authenticates ONCE at
 * connect and is never re-checked afterwards.
 *
 * The two paths that reach this function are the account-recovery ones, and
 * both told the user something that was not true:
 *
 *  - `GET /auth/revoke-all-sessions`, the "this wasn't me" link mailed on a
 *    suspicious login, rendered "All sessions disconnected — N session(s) have
 *    been revoked" while none of them had actually been disconnected.
 *  - `POST /auth/reset-password` invalidates every session in the same
 *    transaction that writes the new password hash. An attacker holding a live
 *    socket kept streaming the victim's conversations after the reset.
 *
 * **Emitting is not the control; disconnecting is.** The emit is a courtesy to
 * a compliant client so it can clear its local session and route to the login
 * screen — a modified client would simply ignore it. `disconnect(true)` closes
 * the underlying connection rather than only the namespace, which is what makes
 * this a revocation. Emit first, close second: the same order `AuthHandler`
 * already uses for `auth:token-expired`.
 *
 * **Whole-user scope is deliberate, not a shortcut.** Both callers invalidate
 * EVERY session of the user with no exception, so "every socket in
 * `ROOMS.user(userId)`" is exactly the revoked set. The sibling paths that
 * spare one session (`DELETE /sessions/:sessionId`, `DELETE /sessions`) are NOT
 * wired here and must not be: a registered socket authenticates with the JWT
 * alone, while `UserSession.sessionToken` stores the hash of a different,
 * long-lived opaque token that no client sends on the handshake — there is no
 * session→socket mapping to spare the right one with. Sending them through this
 * function would sign the caller out of the very device they were pruning from.
 *
 * Best-effort, never throws: the revocation is already committed when this
 * runs, and a dead socket or an unavailable adapter must not turn a completed
 * password reset into a 500. Returns how many sockets were actually closed.
 */
export async function disconnectRevokedSessions(
  params: DisconnectRevokedSessionsParams
): Promise<number> {
  const { io, userId, reason, message, onError } = params;
  if (!io || !userId) return 0;

  const payload: AuthSessionRevokedEventData = {
    code: 'session_revoked',
    message: message ?? DEFAULT_MESSAGES[reason],
    reason,
  };

  let sockets: RevokedSessionSocket[];
  try {
    sockets = await io.in(ROOMS.user(userId)).fetchSockets();
  } catch (error) {
    onError?.(error);
    return 0;
  }

  let closed = 0;
  for (const socket of sockets) {
    // Per-socket isolation: one already-gone device must not spare the others,
    // which are the ones the revocation is actually about.
    try {
      socket.emit(SERVER_EVENTS.AUTH_SESSION_REVOKED, payload);
      socket.disconnect(true);
      closed += 1;
    } catch (error) {
      onError?.(error);
    }
  }

  return closed;
}
