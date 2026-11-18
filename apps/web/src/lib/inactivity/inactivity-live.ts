import type { QueryClient } from '@tanstack/react-query';

import type { InactivityAlertState, InactivityAnnouncement } from '@meeshy/shared/types/inactivity-check';
import { INACTIVITY_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/inactivity-event-names';

import type { ApiResult } from '@/lib/api/http';
import { decodeInactivityAlert, decodeInactivityCleared } from '@/lib/api/inactivity';
import type { SocketClient } from '@/lib/net/socket';

/**
 * **L'ALERTE D'INACTIVITÉ DE MES SANGS, SUR CET ONGLET** (#18738, TEL-02) — même forme que le téléphone injoignable
 * (`phone-reachability-live.ts`, #18737).
 *
 * UNE source : le cache de requêtes, sous {@link INACTIVITY_STATES_QUERY_KEY}, PERSISTÉ par compte
 * (`query-client.ts`) : « Aucune activité depuis 8:00 » se peint au démarrage suivant AVANT tout réseau.
 *
 * - `inactivity:alert` REMPLACE l'état gardé d'une personne ; une alerte plus ANCIENNE que celle gardée n'écrase rien ;
 * - `inactivity:cleared` l'efface (la personne a répondu, ou l'alerte ne m'est plus servie) ;
 * - une alerte plus vieille que {@link INACTIVITY_STATE_TTL_MS} n'est plus servie : aucun historique ;
 * - à chaque socket accrochée, `GET /relations/inactivity` rattrape : ce qui s'est clos pendant la coupure
 *   disparaît, ce qui est arrivé APRÈS la demande reste.
 *
 * L'annonce est remise à `announce` (la pastille) : jamais au fil d'une conversation, jamais rangée. Ma propre
 * alerte ne s'affiche jamais ici.
 */

export const INACTIVITY_STATES_QUERY_KEY = ['relations', 'inactivity'] as const;

/** `INACTIVITY_CHECK_CONFIG.stateTtlSeconds` (72 h), écrit en littéral : le contrat importe `zod` classique. */
export const INACTIVITY_STATE_TTL_MS = 259_200_000;

export type InactivityEntry = InactivityAlertState & { readonly receivedAt: number };

export type InactivityStates = Readonly<Record<string, InactivityEntry>>;

const alive = (entry: InactivityEntry, now: number): boolean => now - Date.parse(entry.alertedAt) <= INACTIVITY_STATE_TTL_MS;

const keptOf = (client: QueryClient): InactivityStates => client.getQueryData<InactivityStates>(INACTIVITY_STATES_QUERY_KEY) ?? {};

export function inactivityStatesOf(client: QueryClient, now: number): InactivityStates {
  return Object.fromEntries(Object.entries(keptOf(client)).filter(([, entry]) => alive(entry, now)));
}

export function inactivityStateOf(client: QueryClient, userId: string, now: number): InactivityEntry | null {
  const entry = keptOf(client)[userId];
  return entry !== undefined && alive(entry, now) ? entry : null;
}

/** Le même filtre, pour un sélecteur de `useQuery`. */
export const servedInactivityEntry = (states: InactivityStates | undefined, userId: string | undefined, now: number): InactivityEntry | null => {
  const entry = userId === undefined ? undefined : states?.[userId];
  return entry !== undefined && alive(entry, now) ? entry : null;
};

const write = (client: QueryClient, next: InactivityStates): void => {
  client.setQueryData<InactivityStates>(INACTIVITY_STATES_QUERY_KEY, next);
};

export function receiveInactivityState(client: QueryClient, state: InactivityAlertState, now: number): void {
  const kept = keptOf(client)[state.userId];
  if (kept !== undefined && Date.parse(state.alertedAt) < Date.parse(kept.alertedAt)) return;
  write(client, { ...keptOf(client), [state.userId]: { ...state, receivedAt: now } });
}

export function clearInactivityState(client: QueryClient, userId: string): void {
  const kept = keptOf(client);
  if (!(userId in kept)) return;
  write(client, Object.fromEntries(Object.entries(kept).filter(([id]) => id !== userId)));
}

/** Le rattrapage : `mark` est l'horloge du DÉPART de la demande ; ce qui est arrivé depuis n'est pas effacé. */
export function reconcileInactivitySnapshot(client: QueryClient, items: readonly InactivityAlertState[], mark: number, now: number): void {
  const served = new Set(items.map((item) => item.userId));
  Object.entries(keptOf(client))
    .filter(([userId, entry]) => !served.has(userId) && entry.receivedAt < mark)
    .forEach(([userId]) => clearInactivityState(client, userId));
  items.forEach((item) => receiveInactivityState(client, item, now));
}

export function bindInactivityLive({
  socket,
  client,
  viewerId,
  snapshot,
  now = Date.now,
  announce,
}: {
  readonly socket: SocketClient;
  readonly client: QueryClient;
  /** Le compte de cet onglet : sa propre alerte ne s'affiche jamais à lui-même. */
  readonly viewerId: () => string | null;
  readonly snapshot: () => Promise<ApiResult<readonly InactivityAlertState[]>>;
  readonly now?: () => number;
  /** L'annonce servie pour la pastille ; le nom se résout chez l'hôte. */
  readonly announce: (userId: string, announcement: InactivityAnnouncement) => void;
}): () => void {
  let live = true;
  const notMine = (userId: string): boolean => userId !== viewerId();
  const onAlert = (payload: unknown): void => {
    const data = decodeInactivityAlert(payload);
    if (data === null || !notMine(data.userId)) return;
    receiveInactivityState(client, data.state, now());
    if (data.announcement !== undefined) announce(data.userId, data.announcement);
  };
  const onCleared = (payload: unknown): void => {
    const data = decodeInactivityCleared(payload);
    if (data === null || !notMine(data.userId)) return;
    clearInactivityState(client, data.userId);
    if (data.announcement !== undefined) announce(data.userId, data.announcement);
  };
  socket.on(INACTIVITY_SERVER_EVENTS.INACTIVITY_ALERT, onAlert);
  socket.on(INACTIVITY_SERVER_EVENTS.INACTIVITY_CLEARED, onCleared);
  const mark = now();
  snapshot().then(
    (result) => {
      if (live && result.ok) reconcileInactivitySnapshot(client, result.data.filter((item) => notMine(item.userId)), mark, now());
    },
    () => undefined,
  );
  return () => {
    live = false;
    socket.off(INACTIVITY_SERVER_EVENTS.INACTIVITY_ALERT, onAlert);
    socket.off(INACTIVITY_SERVER_EVENTS.INACTIVITY_CLEARED, onCleared);
  };
}
