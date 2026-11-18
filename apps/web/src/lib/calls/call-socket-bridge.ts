import type { QueryClient } from '@tanstack/react-query';

import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { CALL_HISTORY_QUERY_PREFIX } from '@/lib/api/me-keys';
import type { SocketClient } from '@/lib/net/socket';

import { CALL_RECORDING_SERVER_EVENT_NAMES } from './call-recording';
import { callRecording } from './call-recording-live';
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
  /* Aussi lus par `callRecording` : le moteur n'en tire que la note du journal (#16665). */
  SERVER_EVENTS.CALL_RECORDING_STARTED,
  SERVER_EVENTS.CALL_RECORDING_STOPPED,
  SERVER_EVENTS.CALL_FORCE_LEAVE,
  SERVER_EVENTS.CALL_ICE_SERVERS_REFRESHED,
  SERVER_EVENTS.CALL_PARTICIPANT_INVITED,
  /* Le tête-à-tête qui invite vit désormais dans le groupe des présents (#19650). */
  SERVER_EVENTS.CALL_CONVERSATION_CHANGED,
  SERVER_EVENTS.CALL_INVITE_DECLINED,
  SERVER_EVENTS.CALL_INVITE_EXPIRED,
  SERVER_EVENTS.CALL_MUTED_BY_MODERATOR,
  SERVER_EVENTS.CALL_REACTION_RECEIVED,
  SERVER_EVENTS.CALL_PREVIEW_REQUESTED,
  SERVER_EVENTS.CALL_PREVIEW_SIGNAL,
];

type LiveFrameModule = { readonly attachCallLiveFrame: (socket: SocketClient) => () => void };

type BridgeOptions = {
  /** Le chunk du cadre en direct (#16943) ; imposé par les témoins. */
  readonly loadLiveFrame?: () => Promise<LiveFrameModule>;
  /** Le cache dont le journal d'appels se relit quand un appel finit (#18922). */
  readonly queryClient?: QueryClient;
};

/**
 * UN APPEL QUI FINIT ENTRE AU JOURNAL (#18922) — terminé, manqué ou refusé
 * (`call:ended` porte la raison, `call:missed` le complète). La passerelle a
 * écrit la ligne avant de diffuser : le journal que l'écran regarde se relit.
 */
const CALL_HISTORY_EVENTS: ReadonlySet<string> = new Set([SERVER_EVENTS.CALL_ENDED, SERVER_EVENTS.CALL_MISSED]);

const noDetach = (): void => undefined;

export function bridgeCallEvents(socket: SocketClient, { loadLiveFrame = () => import('./call-live-frame-live'), queryClient }: BridgeOptions = {}): () => void {
  if (__SHELL__) void import('./shell-call-runtime').then(({ startShellCall }) => startShellCall());
  void import('./call-wake-lock').then(({ startCallWakeLock }) => startCallWakeLock());
  const binding = bindCallTransport({
    connected: () => socket.connected,
    emit: (event, payload) => socket.emit(event, payload),
    request: (event, payload, timeoutMs) =>
      socket.emitWithAck === undefined
        ? Promise.reject(new Error('ack-unsupported'))
        : socket.emitWithAck(event, payload, timeoutMs),
  });
  const handlers = CALL_SERVER_EVENTS.map((event) => {
    const history = CALL_HISTORY_EVENTS.has(event) ? queryClient : undefined;
    const handler = (payload: unknown): void => {
      binding.dispatch(event, payload);
      if (history !== undefined) void history.invalidateQueries({ queryKey: CALL_HISTORY_QUERY_PREFIX });
    };
    socket.on(event, handler);
    return [event, handler] as const;
  });
  const recordingHandlers = CALL_RECORDING_SERVER_EVENT_NAMES.map((event) => {
    const handler = (payload: unknown): void => callRecording.receive(event, payload);
    socket.on(event, handler);
    return [event, handler] as const;
  });
  /* Le cadre en direct (#16943), chargé par `import()` : il n'écoute qu'un
     appel à deux déjà connecté, donc jamais avant que son chunk soit là. Un
     chunk qui ne se charge pas (réseau, déploiement qui a retiré l'ancien
     hash) ne laisse aucun rejet : il se redemande à la reconnexion. */
  let liveFrame: Promise<() => void> | null = null;
  const attachLiveFrame = (): void => {
    liveFrame ??= loadLiveFrame().then(
      ({ attachCallLiveFrame }) => attachCallLiveFrame(socket),
      () => {
        liveFrame = null;
        return noDetach;
      },
    );
  };
  attachLiveFrame();
  /* `call:check-active` à CHAQUE authentification, la première comprise : la
     passerelle rejoue alors `call:initiated` pour un appel qui sonne encore
     (onglet rouvert, coupure pendant la sonnerie) — miroir iOS au `.connect`. */
  const onAuthenticated = (): void => {
    attachLiveFrame();
    socket.emit(CLIENT_EVENTS.CALL_CHECK_ACTIVE);
    binding.authenticated();
  };
  socket.on(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
  /* Un socket qui s'est authentifié AVANT que le pont se pose (le bouchon de
     fixtures le fait dans `connect()`) ne rejouera pas l'événement : sans ce
     rattrapage, un rappel qui attend la connexion (#8199) attendrait toujours. */
  if (socket.connected) onAuthenticated();
  return () => {
    for (const [event, handler] of [...handlers, ...recordingHandlers]) socket.off(event, handler);
    socket.off(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
    void liveFrame?.then((detach) => detach());
    binding.detach();
  };
}
