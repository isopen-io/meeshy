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
 * `typing:start` — l'activité qu'elle diffuse déjà — rafraîchit la seule
 * activité (`packages/shared/utils/user-presence.ts`, en tête). Une coupure
 * ÉTEINT la carte sans l'effacer (#11412) : chaque pastille décroît depuis sa
 * dernière activité au lieu de disparaître d'un coup, et le snapshot de la
 * reconnexion la corrige. Seul le détachement (changement d'identité) la vide.
 */

export type LivePresence = {
  readonly isOnline: boolean;
  readonly lastActiveAt: string | null;
};

export type PresenceState = {
  readonly byUser: Readonly<Record<string, LivePresence>>;
  put(userId: string, presence: LivePresence): void;
  putAll(entries: readonly (readonly [string, LivePresence])[]): void;
  markAllOffline(): void;
  clear(): void;
};

const activityOf = (presence: LivePresence | undefined): number =>
  presence?.lastActiveAt == null ? Number.NEGATIVE_INFINITY : Date.parse(presence.lastActiveAt);

/**
 * UN AMORÇAGE N'EFFACE PAS PLUS FRAIS QUE LUI (#11412) — le snapshot est composé
 * avant d'arriver : un `user:status` ou une frappe reçus entre-temps portent une
 * activité plus récente, que la photographie ne remonte pas. À activité égale
 * ou plus récente, le snapshot l'emporte. Plus ancien, il garde l'activité de
 * l'entrée mais peut encore dire « connecté » : la passerelle calcule
 * `isOnline` en direct, alors qu'une frappe date l'activité sur l'horloge du
 * client — jeter le snapshot laisserait décroître un pair bel et bien là.
 */
const mergeSnapshot = (incoming: LivePresence, existing: LivePresence | undefined): LivePresence =>
  existing !== undefined && activityOf(existing) > activityOf(incoming)
    ? { isOnline: incoming.isOnline || existing.isOnline, lastActiveAt: existing.lastActiveAt }
    : incoming;

export type PresenceStoreApi = StoreApi<PresenceState>;

export function createPresenceStore(): PresenceStoreApi {
  return createStore<PresenceState>((set) => ({
    byUser: {},
    put: (userId, presence) => set((state) => ({ byUser: { ...state.byUser, [userId]: presence } })),
    putAll: (entries) =>
      set((state) => ({
        byUser: {
          ...state.byUser,
          ...Object.fromEntries(entries.map(([userId, presence]) => [userId, mergeSnapshot(presence, state.byUser[userId])] as const)),
        },
      })),
    markAllOffline: () =>
      set((state) => ({
        byUser: Object.fromEntries(
          Object.entries(state.byUser).map(([userId, presence]) => [userId, { ...presence, isOnline: false }] as const),
        ),
      })),
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
