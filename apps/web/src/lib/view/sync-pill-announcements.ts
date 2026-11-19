import { createStore, type StoreApi } from 'zustand/vanilla';

import { pillAnnouncementArmed } from '@/lib/view/sync-pill-gate';

/**
 * **LES ANNONCES DE LA PASTILLE DE SYNCHRONISATION** (#14147) — la pastille ne dit plus seulement ce qui attend
 * dans l'outbox : elle fait DÉFILER les annonces qu'on lui confie (la batterie d'un Proche qui faiblit, d'un Sang
 * qui s'éteint), une après l'autre, puis DISPARAÎT. Elle ne revient que sur un nouvel événement, et rien n'est
 * jamais rangé : ni en mémoire au-delà de la file, ni sur le disque.
 *
 * - une annonce de la MÊME source (`key`) remplace celle qui attend : la pastille dit le présent, pas l'historique
 *   d'un épisode ;
 * - chaque annonce parle {@link ANNOUNCEMENT_DWELL_MS}, puis cède à la suivante ;
 * - une annonce qui a attendu plus de {@link ANNOUNCEMENT_MAX_WAIT_MS} (la pastille disait un échec d'envoi, plus
 *   urgent) n'est jamais dite : elle surgirait, périmée.
 *
 * Le portillon de la pastille (`sync-pill-gate.ts`, chunk d'ENTRÉE) n'importe PAS ce module : la file de
 * l'application lui tient un seul booléen, `pillAnnouncementArmed`, et la file reste hors de la première peinture.
 */

export const ANNOUNCEMENT_DWELL_MS = 4_000;
export const ANNOUNCEMENT_MAX_WAIT_MS = 30_000;

/** `alert` : rouge ; `warn` : avertissement ; `good` : retour à la normale. */
export type PillAnnouncementTone = 'alert' | 'warn' | 'good';

export type PillAnnouncementIcon =
  | { readonly kind: 'battery'; readonly level: number | null; readonly charging: boolean }
  | { readonly kind: 'phone'; readonly reachable: boolean }
  | { readonly kind: 'inactivity'; readonly responded: boolean }
  | { readonly kind: 'call'; readonly active: boolean };

export type PillAnnouncement = {
  readonly id: string;
  /** La SOURCE : une annonce de même clé remplace celle qui attend. */
  readonly key: string;
  readonly text: string;
  readonly tone: PillAnnouncementTone;
  /**
   * Le dessin de tête : une batterie, son niveau (nul : contour seul) et sa charge ; ou un téléphone, barré
   * quand il est injoignable (#18737) ; ou un sablier, que le retour remplace par une coche (#18738) ; ou un
   * combiné, raccroché à la fin d'un appel (#18753).
   */
  readonly icon: PillAnnouncementIcon;
  /** L'horloge locale de l'arrivée. */
  readonly at: number;
};

export type PillAnnouncementState = {
  readonly queue: readonly PillAnnouncement[];
  announce(announcement: PillAnnouncement): void;
  retire(id: string): void;
};

export type PillAnnouncementStoreApi = StoreApi<PillAnnouncementState>;

export function createPillAnnouncementStore(): PillAnnouncementStoreApi {
  return createStore<PillAnnouncementState>((set) => ({
    queue: [],
    announce: (announcement) => set((state) => ({ queue: [...state.queue.filter((entry) => entry.key !== announcement.key), announcement] })),
    retire: (id) => set((state) => (state.queue.some((entry) => entry.id === id) ? { queue: state.queue.filter((entry) => entry.id !== id) } : state)),
  }));
}

export const pillAnnouncementStore: PillAnnouncementStoreApi = createPillAnnouncementStore();

pillAnnouncementStore.subscribe((state) => pillAnnouncementArmed.setState(state.queue.length > 0, true));

/** L'annonce à dire maintenant : la plus ancienne qui n'a pas trop attendu. */
export function currentPillAnnouncement({ queue, now }: { readonly queue: readonly PillAnnouncement[]; readonly now: number }): PillAnnouncement | null {
  return queue.find((entry) => now - entry.at <= ANNOUNCEMENT_MAX_WAIT_MS) ?? null;
}

/** L'instant où l'annonce montrée cède la place. */
export const nextPillAnnouncementWake = ({ shownAt }: { readonly shownAt: number }): number => shownAt + ANNOUNCEMENT_DWELL_MS;
