import type { QueryClient } from '@tanstack/react-query';

import type { FallState } from '@meeshy/shared/types/fall-detection';
import { FALL_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/fall-event-names';

import { decodeFallCleared, decodeFallDetected } from '@/lib/api/fall';
import type { ApiResult } from '@/lib/api/http';
import { HORS_DISQUE_PREFIXE } from '@/lib/api/souverain';
import type { SocketClient } from '@/lib/net/socket';

/**
 * **LA CHUTE DÉTECTÉE DE MES SANGS, SUR CET ONGLET** (#18748, SAN-01) — même forme que l'alerte d'inactivité
 * (`inactivity-live.ts`, #18738).
 *
 * UNE source : le cache de requêtes, sous {@link FALL_STATES_QUERY_KEY}, HORS DISQUE (#16984) : l'état porte la
 * dernière POSITION d'un Sang, il vit en mémoire seulement et le rattrapage de la connexion le reconstitue. Un état
 * dont `expiresAt` est passé ne s'affiche plus : l'expiration est silencieuse côté serveur, c'est le client qui la
 * respecte. Chaque lecture filtre, chaque écriture élague.
 *
 * - `fall:detected` REMPLACE l'état gardé d'une personne ; une chute plus ANCIENNE que celle gardée n'écrase rien ;
 * - `fall:cleared` l'efface (la personne a répondu, l'épisode a expiré, ou il ne m'est plus servi) ;
 * - à chaque socket accrochée, `GET /relations/falls` rattrape : ce qui s'est clos pendant la coupure disparaît, ce
 *   qui est arrivé APRÈS la demande reste.
 *
 * L'annonce est remise à `announce` (la pastille) : « détectée » quand la passerelle l'a jointe, « a répondu » à la
 * clôture `responded` — jamais au fil d'une conversation, jamais rangée. Ma propre chute ne s'affiche jamais ici.
 */
export const FALL_STATES_QUERY_KEY = [HORS_DISQUE_PREFIXE, 'relations', 'falls'] as const;

export type FallPillKind = 'detected' | 'responded';

export type FallEntry = FallState & { readonly receivedAt: number };

export type FallStates = Readonly<Record<string, FallEntry>>;

const alive = (state: FallState, now: number): boolean => Date.parse(state.expiresAt) > now;

const keptOf = (client: QueryClient): FallStates => client.getQueryData<FallStates>(FALL_STATES_QUERY_KEY) ?? {};

const aliveOnly = (states: FallStates, now: number): FallStates => Object.fromEntries(Object.entries(states).filter(([, entry]) => alive(entry, now)));

export function fallStatesOf(client: QueryClient, now: number): FallStates {
  return aliveOnly(keptOf(client), now);
}

export function fallStateOf(client: QueryClient, userId: string, now: number): FallEntry | null {
  return servedFallEntry(keptOf(client), userId, now);
}

/** Le même filtre, pour un sélecteur de `useQuery`. */
export const servedFallEntry = (states: FallStates | undefined, userId: string | undefined, now: number): FallEntry | null => {
  const entry = userId === undefined ? undefined : states?.[userId];
  return entry !== undefined && alive(entry, now) ? entry : null;
};

const write = (client: QueryClient, next: FallStates): void => {
  client.setQueryData<FallStates>(FALL_STATES_QUERY_KEY, next);
};

export function receiveFallState(client: QueryClient, state: FallState, now: number): void {
  const kept = aliveOnly(keptOf(client), now);
  const previous = kept[state.userId];
  if (previous !== undefined && Date.parse(state.detectedAt) < Date.parse(previous.detectedAt)) return;
  const others = Object.fromEntries(Object.entries(kept).filter(([id]) => id !== state.userId));
  write(client, alive(state, now) ? { ...others, [state.userId]: { ...state, receivedAt: now } } : others);
}

export function clearFallState(client: QueryClient, userId: string): void {
  const kept = keptOf(client);
  if (!(userId in kept)) return;
  write(client, Object.fromEntries(Object.entries(kept).filter(([id]) => id !== userId)));
}

/** Le rattrapage : `mark` est l'horloge du DÉPART de la demande ; ce qui est arrivé depuis n'est pas effacé. */
export function reconcileFallSnapshot(client: QueryClient, items: readonly FallState[], mark: number, now: number): void {
  const served = new Set(items.map((item) => item.userId));
  Object.entries(keptOf(client))
    .filter(([userId, entry]) => !served.has(userId) && entry.receivedAt < mark)
    .forEach(([userId]) => clearFallState(client, userId));
  items.forEach((item) => receiveFallState(client, item, now));
}

export function bindFallLive({
  socket,
  client,
  viewerId,
  snapshot,
  now = Date.now,
  announce,
}: {
  readonly socket: SocketClient;
  readonly client: QueryClient;
  /** Le compte de cet onglet : sa propre chute ne s'affiche jamais à lui-même. */
  readonly viewerId: () => string | null;
  readonly snapshot: () => Promise<ApiResult<readonly FallState[]>>;
  readonly now?: () => number;
  /** L'annonce pour la pastille ; le nom se résout chez l'hôte. */
  readonly announce: (userId: string, kind: FallPillKind) => void;
}): () => void {
  let live = true;
  const notMine = (userId: string): boolean => userId !== viewerId();
  const onDetected = (payload: unknown): void => {
    const data = decodeFallDetected(payload);
    if (data === null || !notMine(data.userId)) return;
    receiveFallState(client, data.state, now());
    if (data.announcement !== undefined) announce(data.userId, 'detected');
  };
  const onCleared = (payload: unknown): void => {
    const data = decodeFallCleared(payload);
    if (data === null || !notMine(data.userId)) return;
    clearFallState(client, data.userId);
    if (data.reason === 'responded') announce(data.userId, 'responded');
  };
  socket.on(FALL_SERVER_EVENTS.FALL_DETECTED, onDetected);
  socket.on(FALL_SERVER_EVENTS.FALL_CLEARED, onCleared);
  const mark = now();
  snapshot().then(
    (result) => {
      if (live && result.ok) reconcileFallSnapshot(client, result.data.filter((item) => notMine(item.userId)), mark, now());
    },
    () => undefined,
  );
  return () => {
    live = false;
    socket.off(FALL_SERVER_EVENTS.FALL_DETECTED, onDetected);
    socket.off(FALL_SERVER_EVENTS.FALL_CLEARED, onCleared);
  };
}
