import { createStore, type StoreApi } from 'zustand/vanilla';

import { getUserPresenceStatus, type UserPresenceStatus } from '@meeshy/shared/utils/user-presence';

/**
 * LA PRÉSENCE VIVANTE (#10571) — miroir de `PresenceManager.swift` : UNE carte
 * `userId → { isOnline, lastActiveAt }`, nourrie par la passerelle, que
 * chaque pastille lit AVANT le REST.
 *
 * Sans elle, toute pastille du web venait de la charge REST figée dans le
 * cache de requêtes : un pair qui se connectait ou partait ne changeait de
 * point qu'au prochain refetch. La passerelle pousse pourtant chaque
 * transition (`user:status`, audience = amis acceptés + ADMIN+) et amorce à
 * chaque authentification (`presence:snapshot`, résolu par destinataire).
 *
 * Le client ne FABRIQUE rien : il ne garde que ce que la passerelle sert, et
 * `typing:start` — l'activité qu'elle diffuse déjà — vaut activité immédiate
 * (`packages/shared/utils/user-presence.ts`, en tête). Une coupure VIDE la
 * carte, comme le détachement (changement d'identité) : ce qui a changé pendant
 * qu'on n'écoutait pas ne survit pas, et la reconnexion ré-amorce par le
 * snapshot.
 */

export type LivePresence = {
  readonly isOnline: boolean;
  readonly lastActiveAt: string | null;
};

export type PresenceState = {
  readonly byUser: Readonly<Record<string, LivePresence>>;
  put(userId: string, presence: LivePresence): void;
  putAll(entries: readonly (readonly [string, LivePresence])[]): void;
  clear(): void;
};

export type PresenceStoreApi = StoreApi<PresenceState>;

export function createPresenceStore(): PresenceStoreApi {
  return createStore<PresenceState>((set) => ({
    byUser: {},
    put: (userId, presence) => set((state) => ({ byUser: { ...state.byUser, [userId]: presence } })),
    putAll: (entries) => set((state) => ({ byUser: { ...state.byUser, ...Object.fromEntries(entries) } })),
    clear: () => set({ byUser: {} }),
  }));
}

/** L'INSTANCE UNIQUE — motif `typingStore`/`viewingStore`. */
export const presenceStore: PresenceStoreApi = createPresenceStore();

/** `undefined` ⇒ jamais servie en direct : la charge REST décide. */
export function livePresenceOf(
  state: Pick<PresenceState, 'byUser'>,
  userId: string | undefined,
  now: number,
): UserPresenceStatus | undefined {
  const live = userId === undefined ? undefined : state.byUser[userId];
  return live === undefined ? undefined : getUserPresenceStatus(live, now);
}
