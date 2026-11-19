import type { QueryClient } from '@tanstack/react-query';

import type { PhoneCallAnnouncement, PhoneCallState } from '@meeshy/shared/types/phone-call';
import { PHONE_CALL_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/phone-call-event-names';

import type { ApiResult } from '@/lib/api/http';
import { decodePhoneCallEnded, decodePhoneCallStarted } from '@/lib/api/phone-call';
import type { SocketClient } from '@/lib/net/socket';

/**
 * **« EN APPEL » DE MES SANGS, SUR CET ONGLET** (#18753, ACT-01) — même forme que le téléphone injoignable
 * (`phone-reachability-live.ts`, #18737) et l'alerte d'inactivité (`inactivity-live.ts`, #18738).
 *
 * UNE source : le cache de requêtes, sous {@link PHONE_CALL_STATES_QUERY_KEY}, PERSISTÉ par compte
 * (`query-client.ts`, vidé au changement de compte) : « en appel » n'est pas une position, il peut se peindre au
 * démarrage suivant — MAIS un état dont `expiresAt` est passé ne s'affiche plus, relu d'un cache restauré compris :
 * le téléphone n'a peut-être jamais dit la fin (app suspendue, tuée). Chaque lecture filtre, chaque écriture élague.
 *
 * - `phone-call:started` REMPLACE l'état gardé, annonce ou non (une mise à jour silencieuse : rappel, accès gagné) ;
 * - `phone-call:ended` l'efface (fin de l'appel, ou l'état ne m'est plus servi) ;
 * - à chaque socket accrochée, `GET /relations/phone-calls` rattrape : il fait foi pour ce qui n'a pas bougé depuis
 *   la demande ; ce qui a reçu un événement APRÈS le départ de la demande n'est ni écrasé, ni effacé, ni ressuscité.
 *
 * L'annonce est remise à `announce` (la pastille) : jamais au fil d'une conversation, jamais rangée. Mon propre
 * état ne s'affiche jamais ici. Jamais d'interlocuteur : l'état n'en porte pas.
 */
export const PHONE_CALL_STATES_QUERY_KEY = ['relations', 'phone-calls'] as const;

export type PhoneCallStates = Readonly<Record<string, PhoneCallState>>;

const alive = (state: PhoneCallState, now: number): boolean => Date.parse(state.expiresAt) > now;

const keptOf = (client: QueryClient): PhoneCallStates => client.getQueryData<PhoneCallStates>(PHONE_CALL_STATES_QUERY_KEY) ?? {};

const aliveOnly = (states: PhoneCallStates, now: number): PhoneCallStates => Object.fromEntries(Object.entries(states).filter(([, state]) => alive(state, now)));

export function phoneCallStatesOf(client: QueryClient, now: number): PhoneCallStates {
  return aliveOnly(keptOf(client), now);
}

export function phoneCallStateOf(client: QueryClient, userId: string, now: number): PhoneCallState | null {
  return servedPhoneCallState(keptOf(client), userId, now);
}

/** Le même filtre, pour un sélecteur de `useQuery`. */
export const servedPhoneCallState = (states: PhoneCallStates | undefined, userId: string | undefined, now: number): PhoneCallState | null => {
  const state = userId === undefined ? undefined : states?.[userId];
  return state !== undefined && alive(state, now) ? state : null;
};

const write = (client: QueryClient, next: PhoneCallStates): void => {
  client.setQueryData<PhoneCallStates>(PHONE_CALL_STATES_QUERY_KEY, next);
};

export function receivePhoneCallState(client: QueryClient, state: PhoneCallState, now: number): void {
  const others = Object.fromEntries(Object.entries(aliveOnly(keptOf(client), now)).filter(([id]) => id !== state.userId));
  write(client, alive(state, now) ? { ...others, [state.userId]: state } : others);
}

export function clearPhoneCallState(client: QueryClient, userId: string): void {
  const kept = keptOf(client);
  if (!(userId in kept)) return;
  write(client, Object.fromEntries(Object.entries(kept).filter(([id]) => id !== userId)));
}

/** Le rattrapage : `untouched` dit qui n'a reçu aucun événement depuis le départ de la demande. */
export function reconcilePhoneCallSnapshot(client: QueryClient, items: readonly PhoneCallState[], untouched: (userId: string) => boolean, now: number): void {
  const served = new Set(items.map((item) => item.userId));
  Object.keys(keptOf(client))
    .filter((userId) => !served.has(userId) && untouched(userId))
    .forEach((userId) => clearPhoneCallState(client, userId));
  items.filter((item) => untouched(item.userId)).forEach((item) => receivePhoneCallState(client, item, now));
}

export function bindPhoneCallLive({
  socket,
  client,
  viewerId,
  snapshot,
  now = Date.now,
  announce,
}: {
  readonly socket: SocketClient;
  readonly client: QueryClient;
  /** Le compte de cet onglet : son propre état ne s'affiche jamais à lui-même. */
  readonly viewerId: () => string | null;
  readonly snapshot: () => Promise<ApiResult<readonly PhoneCallState[]>>;
  readonly now?: () => number;
  /** L'annonce servie pour la pastille, avec l'état qui l'accompagne (`null` à la fin) ; le nom se résout chez l'hôte. */
  readonly announce: (userId: string, announcement: PhoneCallAnnouncement, state: PhoneCallState | null) => void;
}): () => void {
  let live = true;
  const touched = new Set<string>();
  const notMine = (userId: string): boolean => userId !== viewerId();
  const onStarted = (payload: unknown): void => {
    const data = decodePhoneCallStarted(payload);
    if (data === null || !notMine(data.userId)) return;
    touched.add(data.userId);
    receivePhoneCallState(client, data.state, now());
    if (data.announcement !== undefined) announce(data.userId, data.announcement, data.state);
  };
  const onEnded = (payload: unknown): void => {
    const data = decodePhoneCallEnded(payload);
    if (data === null || !notMine(data.userId)) return;
    touched.add(data.userId);
    clearPhoneCallState(client, data.userId);
    if (data.announcement !== undefined) announce(data.userId, data.announcement, null);
  };
  socket.on(PHONE_CALL_SERVER_EVENTS.PHONE_CALL_STARTED, onStarted);
  socket.on(PHONE_CALL_SERVER_EVENTS.PHONE_CALL_ENDED, onEnded);
  snapshot().then(
    (result) => {
      if (!live || !result.ok) return;
      reconcilePhoneCallSnapshot(client, result.data.filter((item) => notMine(item.userId)), (userId) => !touched.has(userId), now());
    },
    () => undefined,
  );
  return () => {
    live = false;
    socket.off(PHONE_CALL_SERVER_EVENTS.PHONE_CALL_STARTED, onStarted);
    socket.off(PHONE_CALL_SERVER_EVENTS.PHONE_CALL_ENDED, onEnded);
  };
}
