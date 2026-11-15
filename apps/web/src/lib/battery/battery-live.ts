import type { QueryClient } from '@tanstack/react-query';

import { BATTERY_CONFIG } from '@meeshy/shared/types/battery-constants';
import type { BatteryAnnouncement, BatteryReaderState } from '@meeshy/shared/types/battery';
import { BATTERY_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/battery-event-names';

import { decodeBatteryChanged, decodeBatteryCleared } from '@/lib/api/battery';
import type { ApiResult } from '@/lib/api/http';
import type { SocketClient } from '@/lib/net/socket';

/**
 * **LA BATTERIE DE MES PROCHES ET DE MES SANGS, SUR CET ONGLET** (#14147).
 *
 * UNE source : le cache de requêtes, sous {@link BATTERY_STATES_QUERY_KEY}. Il est PERSISTÉ par compte
 * (`query-client.ts` : la déshydratation l'écrit, un changement de compte le range et reprend celui de l'autre),
 * donc l'icône d'un épisode en cours se peint au démarrage suivant AVANT tout réseau — cache-first, jamais de
 * spinner. Rien d'autre ne garde l'état.
 *
 * - `battery:changed` REMPLACE l'état gardé d'une personne, tel que servi ; un relevé plus ANCIEN que celui gardé
 *   n'écrase rien (un même instant passe : l'extinction présumée garde le dernier relevé et change la phase) ;
 * - `battery:cleared` l'efface (épisode clos, lien baissé, consentement retiré) — l'icône disparaît ;
 * - un état de plus de 24 h ({@link BATTERY_CONFIG}.stateTtlSeconds) n'est plus servi : le serveur ne garde aucun
 *   historique, ce client non plus ;
 * - à chaque socket accrochée, `GET /relations/battery` rattrape : ce qui s'est clos pendant la coupure disparaît,
 *   ce qui est arrivé APRÈS la demande reste.
 *
 * L'annonce (présente seulement quand le canal du lecteur est la pastille) est remise à `announce` : jamais au
 * fil d'une conversation, jamais rangée.
 */

export const BATTERY_STATES_QUERY_KEY = ['relations', 'battery'] as const;

/** Un état servi, et l'horloge LOCALE de sa réception (le rattrapage départage par elle). */
export type BatteryEntry = BatteryReaderState & { readonly receivedAt: number };

export type BatteryStates = Readonly<Record<string, BatteryEntry>>;

const TTL_MS = BATTERY_CONFIG.stateTtlSeconds * 1_000;

const alive = (entry: BatteryEntry, now: number): boolean => now - Date.parse(entry.measuredAt) <= TTL_MS;

const keptOf = (client: QueryClient): BatteryStates => client.getQueryData<BatteryStates>(BATTERY_STATES_QUERY_KEY) ?? {};

/** Les états SERVIS maintenant — ceux de plus de 24 h ne le sont plus. */
export function batteryStatesOf(client: QueryClient, now: number): BatteryStates {
  return Object.fromEntries(Object.entries(keptOf(client)).filter(([, entry]) => alive(entry, now)));
}

export function batteryStateOf(client: QueryClient, userId: string, now: number): BatteryEntry | null {
  const entry = keptOf(client)[userId];
  return entry !== undefined && alive(entry, now) ? entry : null;
}

/** Le même filtre, pour un sélecteur de `useQuery` : rien à gauche de lui ne lit le cache brut. */
export const servedBatteryEntry = (states: BatteryStates | undefined, userId: string | undefined, now: number): BatteryEntry | null => {
  const entry = userId === undefined ? undefined : states?.[userId];
  return entry !== undefined && alive(entry, now) ? entry : null;
};

const write = (client: QueryClient, next: BatteryStates): void => {
  client.setQueryData<BatteryStates>(BATTERY_STATES_QUERY_KEY, next);
};

export function receiveBatteryState(client: QueryClient, state: BatteryReaderState, now: number): void {
  const kept = keptOf(client)[state.userId];
  if (kept !== undefined && Date.parse(state.measuredAt) < Date.parse(kept.measuredAt)) return;
  write(client, { ...keptOf(client), [state.userId]: { ...state, receivedAt: now } });
}

export function clearBatteryState(client: QueryClient, userId: string): void {
  const kept = keptOf(client);
  if (!(userId in kept)) return;
  write(client, Object.fromEntries(Object.entries(kept).filter(([id]) => id !== userId)));
}

/** Le rattrapage : `mark` est l'horloge du DÉPART de la demande ; ce qui est arrivé depuis n'est pas effacé. */
export function reconcileBatterySnapshot(client: QueryClient, items: readonly BatteryReaderState[], mark: number, now: number): void {
  const served = new Set(items.map((item) => item.userId));
  Object.entries(keptOf(client))
    .filter(([userId, entry]) => !served.has(userId) && entry.receivedAt < mark)
    .forEach(([userId]) => clearBatteryState(client, userId));
  items.forEach((item) => receiveBatteryState(client, item, now));
}

export function bindBatteryLive({
  socket,
  client,
  viewerId,
  snapshot,
  now = Date.now,
  announce,
}: {
  readonly socket: SocketClient;
  readonly client: QueryClient;
  /** Le compte de cet onglet : sa propre batterie (un autre de ses appareils) ne s'affiche pas ici. */
  readonly viewerId: () => string | null;
  readonly snapshot: () => Promise<ApiResult<readonly BatteryReaderState[]>>;
  readonly now?: () => number;
  /** L'annonce servie pour la pastille ; le nom de la personne se résout chez l'hôte. */
  readonly announce: (userId: string, announcement: BatteryAnnouncement) => void;
}): () => void {
  let live = true;
  const notMine = (userId: string): boolean => userId !== viewerId();
  const onChanged = (payload: unknown): void => {
    const data = decodeBatteryChanged(payload);
    if (data === null || !notMine(data.userId)) return;
    receiveBatteryState(client, data.state, now());
    if (data.announcement !== undefined) announce(data.userId, data.announcement);
  };
  const onCleared = (payload: unknown): void => {
    const data = decodeBatteryCleared(payload);
    if (data === null || !notMine(data.userId)) return;
    clearBatteryState(client, data.userId);
    if (data.announcement !== undefined) announce(data.userId, data.announcement);
  };
  socket.on(BATTERY_SERVER_EVENTS.BATTERY_CHANGED, onChanged);
  socket.on(BATTERY_SERVER_EVENTS.BATTERY_CLEARED, onCleared);
  const mark = now();
  snapshot().then(
    (result) => {
      if (live && result.ok) reconcileBatterySnapshot(client, result.data.filter((item) => notMine(item.userId)), mark, now());
    },
    () => undefined,
  );
  return () => {
    live = false;
    socket.off(BATTERY_SERVER_EVENTS.BATTERY_CHANGED, onChanged);
    socket.off(BATTERY_SERVER_EVENTS.BATTERY_CLEARED, onCleared);
  };
}
