import type { QueryClient } from '@tanstack/react-query';

import { PHONE_REACHABILITY_CONFIG } from '@meeshy/shared/types/phone-reachability-constants';
import type { PhoneReachabilityAnnouncement, PhoneReachabilityState } from '@meeshy/shared/types/phone-reachability';
import { PHONE_REACHABILITY_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/phone-reachability-event-names';

import { decodePhoneReachabilityChanged, decodePhoneReachabilityCleared } from '@/lib/api/phone-reachability';
import type { ApiResult } from '@/lib/api/http';
import type { SocketClient } from '@/lib/net/socket';

/**
 * **LE TÉLÉPHONE INJOIGNABLE DE MES PROCHES ET DE MES SANGS, SUR CET ONGLET** (#18737, TEL-01) — même forme que
 * la batterie (`battery-live.ts`, #14147).
 *
 * UNE source : le cache de requêtes, sous {@link PHONE_REACHABILITY_STATES_QUERY_KEY}, PERSISTÉ par compte
 * (`query-client.ts`) : le glyphe d'un téléphone injoignable se peint au démarrage suivant AVANT tout réseau.
 *
 * - `phone:unreachable` REMPLACE l'état gardé d'une personne ; un état plus ANCIEN que celui gardé n'écrase rien ;
 * - `phone:reachable` l'efface (le téléphone répond, ou l'état ne m'est plus servi) — le glyphe disparaît ;
 * - un état plus vieux que {@link PHONE_REACHABILITY_CONFIG}.stateTtlSeconds n'est plus servi : aucun historique ;
 * - à chaque socket accrochée, `GET /relations/phone-reachability` rattrape : ce qui s'est clos pendant la coupure
 *   disparaît, ce qui est arrivé APRÈS la demande reste.
 *
 * L'annonce (présente seulement quand le canal du lecteur est la pastille) est remise à `announce` : jamais au fil
 * d'une conversation, jamais rangée. Mon propre téléphone ne s'affiche jamais ici.
 */

export const PHONE_REACHABILITY_STATES_QUERY_KEY = ['relations', 'phone-reachability'] as const;

export type PhoneReachabilityEntry = PhoneReachabilityState & { readonly receivedAt: number };

export type PhoneReachabilityStates = Readonly<Record<string, PhoneReachabilityEntry>>;

const TTL_MS = PHONE_REACHABILITY_CONFIG.stateTtlSeconds * 1_000;

const alive = (entry: PhoneReachabilityEntry, now: number): boolean => now - Date.parse(entry.unreachableSince) <= TTL_MS;

const keptOf = (client: QueryClient): PhoneReachabilityStates => client.getQueryData<PhoneReachabilityStates>(PHONE_REACHABILITY_STATES_QUERY_KEY) ?? {};

export function phoneReachabilityStatesOf(client: QueryClient, now: number): PhoneReachabilityStates {
  return Object.fromEntries(Object.entries(keptOf(client)).filter(([, entry]) => alive(entry, now)));
}

export function phoneReachabilityStateOf(client: QueryClient, userId: string, now: number): PhoneReachabilityEntry | null {
  const entry = keptOf(client)[userId];
  return entry !== undefined && alive(entry, now) ? entry : null;
}

/** Le même filtre, pour un sélecteur de `useQuery`. */
export const servedPhoneReachabilityEntry = (states: PhoneReachabilityStates | undefined, userId: string | undefined, now: number): PhoneReachabilityEntry | null => {
  const entry = userId === undefined ? undefined : states?.[userId];
  return entry !== undefined && alive(entry, now) ? entry : null;
};

const write = (client: QueryClient, next: PhoneReachabilityStates): void => {
  client.setQueryData<PhoneReachabilityStates>(PHONE_REACHABILITY_STATES_QUERY_KEY, next);
};

export function receivePhoneReachabilityState(client: QueryClient, state: PhoneReachabilityState, now: number): void {
  const kept = keptOf(client)[state.userId];
  if (kept !== undefined && Date.parse(state.unreachableSince) < Date.parse(kept.unreachableSince)) return;
  write(client, { ...keptOf(client), [state.userId]: { ...state, receivedAt: now } });
}

export function clearPhoneReachabilityState(client: QueryClient, userId: string): void {
  const kept = keptOf(client);
  if (!(userId in kept)) return;
  write(client, Object.fromEntries(Object.entries(kept).filter(([id]) => id !== userId)));
}

/** Le rattrapage : `mark` est l'horloge du DÉPART de la demande ; ce qui est arrivé depuis n'est pas effacé. */
export function reconcilePhoneReachabilitySnapshot(client: QueryClient, items: readonly PhoneReachabilityState[], mark: number, now: number): void {
  const served = new Set(items.map((item) => item.userId));
  Object.entries(keptOf(client))
    .filter(([userId, entry]) => !served.has(userId) && entry.receivedAt < mark)
    .forEach(([userId]) => clearPhoneReachabilityState(client, userId));
  items.forEach((item) => receivePhoneReachabilityState(client, item, now));
}

export function bindPhoneReachabilityLive({
  socket,
  client,
  viewerId,
  snapshot,
  now = Date.now,
  announce,
}: {
  readonly socket: SocketClient;
  readonly client: QueryClient;
  /** Le compte de cet onglet : son propre téléphone ne s'affiche jamais à lui-même. */
  readonly viewerId: () => string | null;
  readonly snapshot: () => Promise<ApiResult<readonly PhoneReachabilityState[]>>;
  readonly now?: () => number;
  /** L'annonce servie pour la pastille, avec l'état quand il y en a un ; le nom se résout chez l'hôte. */
  readonly announce: (userId: string, announcement: PhoneReachabilityAnnouncement, state: PhoneReachabilityState | null) => void;
}): () => void {
  let live = true;
  const notMine = (userId: string): boolean => userId !== viewerId();
  const onUnreachable = (payload: unknown): void => {
    const data = decodePhoneReachabilityChanged(payload);
    if (data === null || !notMine(data.userId)) return;
    receivePhoneReachabilityState(client, data.state, now());
    if (data.announcement !== undefined) announce(data.userId, data.announcement, data.state);
  };
  const onReachable = (payload: unknown): void => {
    const data = decodePhoneReachabilityCleared(payload);
    if (data === null || !notMine(data.userId)) return;
    clearPhoneReachabilityState(client, data.userId);
    if (data.announcement !== undefined) announce(data.userId, data.announcement, null);
  };
  socket.on(PHONE_REACHABILITY_SERVER_EVENTS.PHONE_UNREACHABLE, onUnreachable);
  socket.on(PHONE_REACHABILITY_SERVER_EVENTS.PHONE_REACHABLE, onReachable);
  const mark = now();
  snapshot().then(
    (result) => {
      if (live && result.ok) reconcilePhoneReachabilitySnapshot(client, result.data.filter((item) => notMine(item.userId)), mark, now());
    },
    () => undefined,
  );
  return () => {
    live = false;
    socket.off(PHONE_REACHABILITY_SERVER_EVENTS.PHONE_UNREACHABLE, onUnreachable);
    socket.off(PHONE_REACHABILITY_SERVER_EVENTS.PHONE_REACHABLE, onReachable);
  };
}
