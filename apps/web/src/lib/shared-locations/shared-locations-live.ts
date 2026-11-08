import { SHARED_LOCATION_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/shared-location-event-names';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { decodeSharedLocation, type SharedLocation } from '@/lib/api/shared-locations';
import type { SocketClient } from '@/lib/net/socket';

/**
 * **LES POSITIONS PARTAGÉES EN VOL, SUR CET ONGLET** (#16984) — le web REÇOIT, il n'émet
 * pas (spec cercles § 1.5 : un navigateur ne suit pas une position en arrière-plan).
 *
 * - `location:share-changed` (room `user:<moi>`) remplace la position d'une personne ;
 *   elle arrive DÉJÀ tronquée à la précision que son émetteur m'a donnée.
 * - `location:share-ended` la retire (arrêt, baisse sous Ami, blocage, retrait).
 * - Le serveur n'émet RIEN au terme : `expire()` retire ce qui a passé `expiresAt`,
 *   appelé par l'horloge de l'hôte.
 * - Le rattrapage (`merge`) rejoue ce que le direct a manqué sans jamais écraser une
 *   position plus récente, ni ressusciter un partage arrêté depuis.
 *
 * Rien n'est fabriqué : une position n'existe ici que si le serveur l'a servie.
 */

export type SharedLocationsState = {
  readonly byUser: Readonly<Record<string, SharedLocation>>;
  receive(location: SharedLocation): void;
  merge(locations: readonly SharedLocation[]): void;
  end(userId: string, at?: string): void;
  expire(): void;
  clear(): void;
  /** L'échéance la plus proche (ms), `null` quand rien n'est en cours : l'hôte arme UN minuteur dessus. */
  nextExpiry(): number | null;
};

export type SharedLocationsStoreApi = StoreApi<SharedLocationsState>;

/** Assez pour qu'une copie en retard d'un partage arrêté ne le ressuscite pas ; borné, rien ne grossit. */
const ENDED_MEMORY = 128;

export function createSharedLocationsStore({ now = Date.now }: { readonly now?: () => number } = {}): SharedLocationsStoreApi {
  let endedAt: Readonly<Record<string, number>> = {};
  const live = (location: SharedLocation): boolean => Date.parse(location.expiresAt) > now();
  const remember = (userId: string, at: number): void => {
    const kept = Object.entries({ ...endedAt, [userId]: Math.max(at, endedAt[userId] ?? 0) }).slice(-ENDED_MEMORY);
    endedAt = Object.fromEntries(kept);
  };
  const accepts = (byUser: Readonly<Record<string, SharedLocation>>, location: SharedLocation): boolean => {
    if (!live(location)) return false;
    if (Date.parse(location.updatedAt) <= (endedAt[location.userId] ?? Number.NEGATIVE_INFINITY)) return false;
    const current = byUser[location.userId];
    return current === undefined || Date.parse(location.updatedAt) >= Date.parse(current.updatedAt);
  };
  const withAll = (byUser: Readonly<Record<string, SharedLocation>>, locations: readonly SharedLocation[]) =>
    locations.reduce((acc, location) => (accepts(acc, location) ? { ...acc, [location.userId]: location } : acc), byUser);
  return createStore<SharedLocationsState>((set, get) => ({
    byUser: {},
    receive: (location) => set((state) => ({ byUser: withAll(state.byUser, [location]) })),
    merge: (locations) => set((state) => ({ byUser: withAll(state.byUser, locations) })),
    end: (userId, at) =>
      set((state) => {
        /* L'horloge du SERVEUR, jamais la nôtre : un appareil en avance masquerait un redémarrage légitime. */
        remember(userId, at !== undefined ? Date.parse(at) : Date.parse(state.byUser[userId]?.updatedAt ?? '') || now());
        return { byUser: Object.fromEntries(Object.entries(state.byUser).filter(([id]) => id !== userId)) };
      }),
    expire: () => set((state) => ({ byUser: Object.fromEntries(Object.entries(state.byUser).filter(([, location]) => live(location))) })),
    clear: () => {
      endedAt = {};
      set({ byUser: {} });
    },
    nextExpiry: () => {
      const terms = Object.values(get().byUser).map((location) => Date.parse(location.expiresAt));
      return terms.length === 0 ? null : Math.min(...terms);
    },
  }));
}

export const sharedLocationsStore: SharedLocationsStoreApi = createSharedLocationsStore();

type Wire = Readonly<Record<string, unknown>>;

const objectOf = (raw: unknown): Wire | null => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Wire) : null);

export function decodeSharedLocationEnded(raw: unknown): { readonly userId: string } | null {
  const userId = objectOf(raw)?.userId;
  return typeof userId === 'string' && userId !== '' ? { userId } : null;
}

export function bindSharedLocationsLive({
  socket,
  store,
}: {
  readonly socket: SocketClient;
  readonly store: SharedLocationsStoreApi;
}): () => void {
  const onChanged = (payload: unknown): void => {
    const location = decodeSharedLocation(payload);
    if (location !== null) store.getState().receive(location);
  };
  const onEnded = (payload: unknown): void => {
    const ended = decodeSharedLocationEnded(payload);
    if (ended !== null) store.getState().end(ended.userId);
  };
  socket.on(SHARED_LOCATION_SERVER_EVENTS.SHARED_LOCATION_CHANGED, onChanged);
  socket.on(SHARED_LOCATION_SERVER_EVENTS.SHARED_LOCATION_ENDED, onEnded);
  return () => {
    socket.off(SHARED_LOCATION_SERVER_EVENTS.SHARED_LOCATION_CHANGED, onChanged);
    socket.off(SHARED_LOCATION_SERVER_EVENTS.SHARED_LOCATION_ENDED, onEnded);
  };
}
