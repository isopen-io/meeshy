/**
 * « C'est TOI qu'on sort » — la phrase qu'une exclusion d'appel doit à l'exclu.
 *
 * `call:participant-left` s'adresse aux RESTANTS ; l'exclu n'y lit rien qui le
 * concerne et garde à l'écran un appel dont il ne fait plus partie. Même
 * séquence que la sortie d'appel avec l'appartenance (`CallEventsHandler`) :
 * `call:force-leave` sur la room PERSONNELLE, seule que l'éviction ne touche
 * pas, puis ses sockets quittent la room de l'appel.
 */
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

import type { ServerEmitIOWithRooms } from './serverEmit';

export const CALL_REMOVED_REASON = 'removed';

export type CallRemovalNotice = {
  readonly callId: string;
  readonly personalRoomKey: string;
};

export async function noticeRemovedFromCall(io: ServerEmitIOWithRooms, notice: CallRemovalNotice): Promise<void> {
  const personalRoom = ROOMS.user(notice.personalRoomKey);
  io.to(personalRoom).emit(SERVER_EVENTS.CALL_FORCE_LEAVE, { callId: notice.callId, reason: CALL_REMOVED_REASON });
  const sockets = await io.in(personalRoom).fetchSockets();
  await Promise.all(sockets.map((socket) => socket.leave(ROOMS.call(notice.callId))));
}
