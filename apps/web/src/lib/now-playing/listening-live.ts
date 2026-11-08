import { createStore, type StoreApi } from 'zustand/vanilla';

import { NOW_PLAYING_TTL_SECONDS, type NowPlayingCategory } from '@meeshy/shared/types/now-playing-constants';
import type { NowPlayingChangedEventData } from '@meeshy/shared/types/now-playing';
import { NOW_PLAYING_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/now-playing-event-names';

import type { ApiResult } from '@/lib/api/http';
import { decodeNowPlayingChanged, decodeNowPlayingCleared } from '@/lib/api/now-playing';
import type { SocketClient } from '@/lib/net/socket';

/**
 * **CE QU'ÉCOUTENT MES PROCHES ET MES SANGS, SUR CET ONGLET** (#16729, sous-lot
 * `proche-sang-ecoute@web` de #13934).
 *
 * - `now-playing:changed` REMPLACE l'état gardé d'une personne, tel que servi : une
 *   montée au Sang fait apparaître le titre sans recharger, une baisse le retire
 *   (le serveur renvoie l'état tronqué). Un état plus ancien que celui gardé
 *   n'écrase rien.
 * - `now-playing:cleared` l'efface (pause, fin, blocage, retrait d'un partage).
 * - Sans nouvel envoi, l'état s'éteint à `expiresAt`, compté à l'horloge de CET
 *   onglet depuis la réception (une horloge d'appareil décalée ne le prolonge
 *   pas), et jamais au-delà du TTL du contrat.
 * - À chaque socket accrochée, `GET /relations/now-playing` rattrape : ce qui s'est
 *   éteint pendant la coupure disparaît, ce qui est arrivé après la demande reste.
 *
 * Le serveur a déjà jugé (niveau, consentements, blocage) : ce client ne rejuge
 * rien et n'invente rien — il ne garde que les champs du contrat.
 */

export type ListeningEntry = {
  readonly category: NowPlayingCategory;
  readonly title?: string;
  readonly source?: string;
  readonly updatedAt: string;
  /** Horloge locale (ms epoch) où l'état s'éteint sans nouvel envoi. */
  readonly deadline: number;
};

export type ListeningState = {
  readonly byUser: Readonly<Record<string, ListeningEntry>>;
  receive(data: NowPlayingChangedEventData): void;
  clear(userId: string): void;
  /** Le repère d'une demande de rattrapage : ce qui arrive APRÈS lui n'est pas effacé par la réponse. */
  mark(): number;
  /** Le rattrapage : `mark` départage ce qui est arrivé pendant la demande. */
  reconcile(items: readonly NowPlayingChangedEventData[], mark: number): void;
  /** Retire ce qui a passé son échéance ; rend les personnes retirées. */
  expire(): readonly string[];
  msUntilExpiry(): number | null;
};

export type ListeningStoreApi = StoreApi<ListeningState>;

const TTL_MS = NOW_PLAYING_TTL_SECONDS * 1_000;

const lifetimeOf = (data: NowPlayingChangedEventData): number => {
  const served = Date.parse(data.expiresAt) - Date.parse(data.updatedAt);
  return Math.min(TTL_MS, Math.max(0, served));
};

export function createListeningStore({ now = Date.now }: { readonly now?: () => number } = {}): ListeningStoreApi {
  let arrivals = 0;
  const arrivedAt = new Map<string, number>();
  const entryOf = (data: NowPlayingChangedEventData): ListeningEntry => ({
    category: data.category,
    ...(data.title === undefined ? {} : { title: data.title }),
    ...(data.title === undefined || data.source === undefined ? {} : { source: data.source }),
    updatedAt: data.updatedAt,
    deadline: now() + lifetimeOf(data),
  });
  const newer = (data: NowPlayingChangedEventData, kept: ListeningEntry | undefined): boolean =>
    kept === undefined || Date.parse(data.updatedAt) >= Date.parse(kept.updatedAt);
  const without = (byUser: ListeningState['byUser'], userIds: readonly string[]): ListeningState['byUser'] =>
    Object.fromEntries(Object.entries(byUser).filter(([userId]) => !userIds.includes(userId)));

  return createStore<ListeningState>((set, get) => ({
    byUser: {},
    receive: (data) =>
      set((state) => {
        if (!newer(data, state.byUser[data.userId])) return state;
        arrivals += 1;
        arrivedAt.set(data.userId, arrivals);
        return { byUser: { ...state.byUser, [data.userId]: entryOf(data) } };
      }),
    clear: (userId) =>
      set((state) => {
        arrivedAt.delete(userId);
        return userId in state.byUser ? { byUser: without(state.byUser, [userId]) } : state;
      }),
    mark: () => arrivals,
    reconcile: (items, mark) => {
      const served = new Set(items.map((item) => item.userId));
      const stale = Object.keys(get().byUser).filter((userId) => !served.has(userId) && (arrivedAt.get(userId) ?? 0) <= mark);
      stale.forEach((userId) => get().clear(userId));
      items.forEach((item) => get().receive(item));
    },
    expire: () => {
      const gone = Object.entries(get().byUser)
        .filter(([, entry]) => entry.deadline <= now())
        .map(([userId]) => userId);
      gone.forEach((userId) => get().clear(userId));
      return gone;
    },
    msUntilExpiry: () => {
      const deadlines = Object.values(get().byUser).map((entry) => entry.deadline);
      return deadlines.length === 0 ? null : Math.max(0, Math.min(...deadlines) - now());
    },
  }));
}

export const listeningStore: ListeningStoreApi = createListeningStore();

export function bindListeningLive({
  socket,
  store,
  viewerId,
  snapshot,
}: {
  readonly socket: SocketClient;
  readonly store: ListeningStoreApi;
  /** Le compte de cet onglet : sa propre écoute (un autre de ses appareils) ne s'affiche pas ici. */
  readonly viewerId: () => string | null;
  readonly snapshot: () => Promise<ApiResult<readonly NowPlayingChangedEventData[]>>;
}): () => void {
  let live = true;
  const notMine = (userId: string): boolean => userId !== viewerId();
  const onChanged = (payload: unknown): void => {
    const data = decodeNowPlayingChanged(payload);
    if (data !== null && notMine(data.userId)) store.getState().receive(data);
  };
  const onCleared = (payload: unknown): void => {
    const data = decodeNowPlayingCleared(payload);
    if (data !== null) store.getState().clear(data.userId);
  };
  socket.on(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, onChanged);
  socket.on(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CLEARED, onCleared);
  const mark = store.getState().mark();
  snapshot().then(
    (result) => {
      if (live && result.ok) store.getState().reconcile(result.data.filter((item) => notMine(item.userId)), mark);
    },
    () => undefined,
  );
  return () => {
    live = false;
    socket.off(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, onChanged);
    socket.off(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CLEARED, onCleared);
  };
}
