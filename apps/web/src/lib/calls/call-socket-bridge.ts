import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient } from '@/lib/net/socket';

import { bindCallTransport } from './call-transport';

/**
 * **LE PONT ENTRE LA CONNEXION ET LE PORT D'APPEL** (#6382) — branché par
 * `api/realtime.ts` à chaque connexion, jamais par `api/socket.ts` (déjà hors
 * budget de taille). Il écoute les événements d'appel du socket et les remet
 * au port (`call-transport.ts`), qui les garde en file tant que le moteur
 * n'est pas chargé.
 */
export const CALL_SERVER_EVENTS: readonly string[] = [
  SERVER_EVENTS.CALL_INITIATED,
  SERVER_EVENTS.CALL_PARTICIPANT_JOINED,
  SERVER_EVENTS.CALL_PARTICIPANT_LEFT,
  SERVER_EVENTS.CALL_ENDED,
  SERVER_EVENTS.CALL_SIGNAL,
  SERVER_EVENTS.CALL_MEDIA_TOGGLED,
  SERVER_EVENTS.CALL_ERROR,
  SERVER_EVENTS.CALL_MISSED,
  SERVER_EVENTS.CALL_QUALITY_ALERT,
  SERVER_EVENTS.CALL_TRANSLATED_SEGMENT,
  SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE,
  SERVER_EVENTS.CALL_ALREADY_ANSWERED,
  SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT,
  SERVER_EVENTS.CALL_FORCE_LEAVE,
  SERVER_EVENTS.CALL_ICE_SERVERS_REFRESHED,
];

export function bridgeCallEvents(socket: SocketClient): () => void {
  const binding = bindCallTransport({
    connected: () => socket.connected,
    emit: (event, payload) => socket.emit(event, payload),
    request: (event, payload, timeoutMs) =>
      socket.emitWithAck === undefined
        ? Promise.reject(new Error('ack-unsupported'))
        : socket.emitWithAck(event, payload, timeoutMs),
  });
  const handlers = CALL_SERVER_EVENTS.map((event) => {
    const handler = (payload: unknown): void => binding.dispatch(event, payload);
    socket.on(event, handler);
    return [event, handler] as const;
  });
  /* `call:check-active` à CHAQUE authentification, la première comprise : la
     passerelle rejoue alors `call:initiated` pour un appel qui sonne encore
     (onglet rouvert, coupure pendant la sonnerie) — miroir iOS au `.connect`. */
  const onAuthenticated = (): void => {
    socket.emit(CLIENT_EVENTS.CALL_CHECK_ACTIVE);
    binding.authenticated();
  };
  socket.on(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
  return () => {
    for (const [event, handler] of handlers) socket.off(event, handler);
    socket.off(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
    binding.detach();
  };
}
