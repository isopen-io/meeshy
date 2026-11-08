import { SHARED_LOCATION_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/shared-location-event-names';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { decodeSharedLocation, type SharedLocation } from '@/lib/api/shared-locations';
import { sessionIdentityKey, sessionStore, type SessionStoreApi } from '@/lib/api/session';
import type { GeoBbox } from '@/lib/map/slippy';
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
 *   position plus récente, ni ressusciter un partage arrêté depuis. Avec SON emprise et
 *   l'instant où il est parti, il fait foi dans cette emprise : ce qu'il ne sert plus et
 *   qui était arrivé avant lui disparaît (une fin manquée pendant que la carte était
 *   fermée — blocage, baisse sous Ami), et ce qu'il sert après une fin la fait revenir
 *   (une remontée : le serveur ne renvoie rien en direct).
 * - Il appartient au compte ouvert : un changement d'identité le vide.
 *
 * Rien n'est fabriqué : une position n'existe ici que si le serveur l'a servie.
 */

export type SharedLocationsState = {
  readonly byUser: Readonly<Record<string, SharedLocation>>;
  receive(location: SharedLocation): void;
  merge(locations: readonly SharedLocation[], scope?: SnapshotScope): void;
  end(userId: string, at?: string): void;
  expire(): void;
  clear(): void;
  /** L'échéance la plus proche (ms), `null` quand rien n'est en cours : l'hôte arme UN minuteur dessus. */
  nextExpiry(): number | null;
};

export type SharedLocationsStoreApi = StoreApi<SharedLocationsState>;

/** Où et quand (horloge LOCALE) un rattrapage a été demandé. */
export type SnapshotScope = { readonly bbox: GeoBbox; readonly requestedAt: number };

const within = (location: SharedLocation, bbox: GeoBbox): boolean =>
  location.latitude >= bbox.minLatitude && location.latitude <= bbox.maxLatitude && location.longitude >= bbox.minLongitude && location.longitude <= bbox.maxLongitude;

/** Assez pour qu'une copie en retard d'un partage arrêté ne le ressuscite pas ; borné, rien ne grossit. */
const ENDED_MEMORY = 128;

export function createSharedLocationsStore({ now = Date.now }: { readonly now?: () => number } = {}): SharedLocationsStoreApi {
  /* `server` : l'horloge du serveur (pour le direct) ; `local` : quand la fin est arrivée ici (pour un rattrapage). */
  let ended: Readonly<Record<string, { readonly server: number; readonly local: number }>> = {};
  let arrived: Readonly<Record<string, number>> = {};
  const live = (location: SharedLocation): boolean => Date.parse(location.expiresAt) > now();
  const remember = (userId: string, at: number): void => {
    const kept = Object.entries({ ...ended, [userId]: { server: Math.max(at, ended[userId]?.server ?? 0), local: now() } }).slice(-ENDED_MEMORY);
    ended = Object.fromEntries(kept);
  };
  const forget = (userId: string): void => {
    ended = Object.fromEntries(Object.entries(ended).filter(([id]) => id !== userId));
  };
  const newest = (byUser: Readonly<Record<string, SharedLocation>>, location: SharedLocation): boolean => {
    const current = byUser[location.userId];
    return current === undefined || Date.parse(location.updatedAt) >= Date.parse(current.updatedAt);
  };
  const accepts = (byUser: Readonly<Record<string, SharedLocation>>, location: SharedLocation): boolean =>
    live(location) && Date.parse(location.updatedAt) > (ended[location.userId]?.server ?? Number.NEGATIVE_INFINITY) && newest(byUser, location);
  /* Un rattrapage parti APRÈS la fin fait foi ; parti avant, il ne ressuscite rien. */
  const acceptsFromSnapshot = (byUser: Readonly<Record<string, SharedLocation>>, location: SharedLocation, requestedAt: number): boolean => {
    const end = ended[location.userId];
    if (end !== undefined && end.local >= requestedAt) return false;
    return live(location) && newest(byUser, location);
  };
  const place = (byUser: Readonly<Record<string, SharedLocation>>, location: SharedLocation) => {
    arrived = { ...arrived, [location.userId]: now() };
    return { ...byUser, [location.userId]: location };
  };
  const withAll = (byUser: Readonly<Record<string, SharedLocation>>, locations: readonly SharedLocation[]) =>
    locations.reduce((acc, location) => (accepts(acc, location) ? place(acc, location) : acc), byUser);
  const withSnapshot = (byUser: Readonly<Record<string, SharedLocation>>, locations: readonly SharedLocation[], scope: SnapshotScope) => {
    const servedIds = new Set(locations.map((location) => location.userId));
    const kept = Object.fromEntries(
      Object.entries(byUser).filter(([id, location]) => servedIds.has(id) || !within(location, scope.bbox) || (arrived[id] ?? 0) >= scope.requestedAt),
    );
    return locations.reduce((acc, location) => {
      if (!acceptsFromSnapshot(acc, location, scope.requestedAt)) return acc;
      forget(location.userId);
      return place(acc, location);
    }, kept);
  };
  const keepArrivals = (byUser: Readonly<Record<string, SharedLocation>>) => {
    arrived = Object.fromEntries(Object.entries(arrived).filter(([id]) => byUser[id] !== undefined));
    return byUser;
  };
  return createStore<SharedLocationsState>((set, get) => ({
    byUser: {},
    receive: (location) => set((state) => ({ byUser: withAll(state.byUser, [location]) })),
    merge: (locations, scope) => set((state) => ({ byUser: keepArrivals(scope === undefined ? withAll(state.byUser, locations) : withSnapshot(state.byUser, locations, scope)) })),
    end: (userId, at) =>
      set((state) => {
        /* L'horloge du SERVEUR, jamais la nôtre : un appareil en avance masquerait un redémarrage légitime. */
        remember(userId, at !== undefined ? Date.parse(at) : Date.parse(state.byUser[userId]?.updatedAt ?? '') || now());
        return { byUser: keepArrivals(Object.fromEntries(Object.entries(state.byUser).filter(([id]) => id !== userId))) };
      }),
    expire: () => set((state) => ({ byUser: keepArrivals(Object.fromEntries(Object.entries(state.byUser).filter(([, location]) => live(location)))) })),
    clear: () => {
      ended = {};
      arrived = {};
      set({ byUser: {} });
    },
    nextExpiry: () => {
      const terms = Object.values(get().byUser).map((location) => Date.parse(location.expiresAt));
      return terms.length === 0 ? null : Math.min(...terms);
    },
  }));
}

/** Les positions reçues sur la connexion d'un compte ne passent pas au suivant (#8674, même doctrine). */
export function watchSharedLocationsIdentity({ session, store }: { readonly session: SessionStoreApi; readonly store: SharedLocationsStoreApi }): () => void {
  let last = sessionIdentityKey(session.getState().session);
  return session.subscribe((state) => {
    const identity = sessionIdentityKey(state.session);
    if (identity === last) return;
    last = identity;
    store.getState().clear();
  });
}

export const sharedLocationsStore: SharedLocationsStoreApi = createSharedLocationsStore();
watchSharedLocationsIdentity({ session: sessionStore, store: sharedLocationsStore });

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
