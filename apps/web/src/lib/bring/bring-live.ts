import { createStore, type StoreApi } from 'zustand/vanilla';

import type { BringRingEventData, BringSent, BringStopReason, BringStoppedEventData } from '@meeshy/shared/types/bring';
import { RELATION_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/relation-event-names';

import type { SocketClient } from '@/lib/net/socket';

/**
 * **LES BRINGS EN VOL, SUR CET ONGLET** (#13936, sous-lot `proche-bring@web`).
 *
 * - `bring:ring` (room `user:<moi>`) fait sonner ; il ne porte aucun nom : l'hôte
 *   nomme l'expéditeur par ses propres caches.
 * - `bring:stopped` arrête, chez le destinataire ET chez l'expéditeur.
 * - Le serveur n'émet RIEN à l'expiration : `expire()` retire ce qui a passé
 *   `expiresAt`, appelé par l'horloge de l'hôte.
 * - Socket et push partent tous deux : un `bringId` déjà connu — en vol OU déjà
 *   arrêté — ne sonne jamais une seconde fois.
 *
 * Ce module ne joue aucun son et ne touche aucun écran : c'est l'hôte
 * (`components/bring-ring-host.tsx`) qui sonne tant que `incoming` n'est pas vide.
 */

export type LiveBring = BringRingEventData;

/** Mon Bring qui sonne chez quelqu'un : ce que `POST /bring/:userId` a rendu. */
export type OutgoingBring = Pick<BringSent, 'bringId' | 'toUserId' | 'sentAt' | 'expiresAt'>;

export type BringState = {
  /** Les Brings qui sonnent ICI, le plus ancien d'abord. */
  readonly incoming: readonly LiveBring[];
  /** Mon Bring qui sonne chez chaque destinataire, par identifiant. */
  readonly outgoing: Readonly<Record<string, OutgoingBring>>;
  receive(ring: LiveBring): void;
  sent(sent: BringSent): void;
  stop(bringId: string): void;
  expire(): void;
};

export type BringStoreApi = StoreApi<BringState>;

/** Assez pour qu'une copie en retard d'un Bring arrêté ne ressuscite pas ; borné, rien ne grossit. */
const ENDED_MEMORY = 64;

export function createBringStore({ now = Date.now }: { readonly now?: () => number } = {}): BringStoreApi {
  let ended: readonly string[] = [];
  const live = (entry: { readonly expiresAt: string }): boolean => Date.parse(entry.expiresAt) > now();
  const remember = (bringId: string): void => {
    ended = [...ended.filter((id) => id !== bringId), bringId].slice(-ENDED_MEMORY);
  };
  return createStore<BringState>((set) => ({
    incoming: [],
    outgoing: {},
    receive: (ring) =>
      set((state) => {
        if (!live(ring) || ended.includes(ring.bringId) || state.incoming.some((entry) => entry.bringId === ring.bringId)) return state;
        return { incoming: [...state.incoming, ring] };
      }),
    sent: (sent) =>
      set((state) => ({
        outgoing: { ...state.outgoing, [sent.toUserId]: { bringId: sent.bringId, toUserId: sent.toUserId, sentAt: sent.sentAt, expiresAt: sent.expiresAt } },
      })),
    stop: (bringId) =>
      set((state) => {
        remember(bringId);
        return {
          incoming: state.incoming.filter((entry) => entry.bringId !== bringId),
          outgoing: Object.fromEntries(Object.entries(state.outgoing).filter(([, entry]) => entry.bringId !== bringId)),
        };
      }),
    expire: () =>
      set((state) => ({
        incoming: state.incoming.filter(live),
        outgoing: Object.fromEntries(Object.entries(state.outgoing).filter(([, entry]) => live(entry))),
      })),
  }));
}

export const bringStore: BringStoreApi = createBringStore();

type Wire = Readonly<Record<string, unknown>>;

const objectOf = (raw: unknown): Wire | null => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Wire) : null);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const STOP_REASONS: readonly BringStopReason[] = ['recipient', 'sender'];

export function decodeBringRing(raw: unknown): BringRingEventData | null {
  const wire = objectOf(raw);
  const [bringId, fromUserId, toUserId, sentAt, expiresAt] = [wire?.bringId, wire?.fromUserId, wire?.toUserId, wire?.sentAt, wire?.expiresAt].map(textOf);
  if (bringId == null || fromUserId == null || toUserId == null || sentAt == null || expiresAt == null || Number.isNaN(Date.parse(expiresAt))) return null;
  return { bringId, fromUserId, toUserId, sentAt, expiresAt };
}

export function decodeBringStopped(raw: unknown): BringStoppedEventData | null {
  const wire = objectOf(raw);
  const [bringId, fromUserId, toUserId, stoppedAt] = [wire?.bringId, wire?.fromUserId, wire?.toUserId, wire?.stoppedAt].map(textOf);
  const reason = STOP_REASONS.find((candidate) => candidate === wire?.reason);
  if (bringId == null || fromUserId == null || toUserId == null || stoppedAt == null || reason === undefined) return null;
  return { bringId, fromUserId, toUserId, reason, stoppedAt };
}

export function bindBringLive({
  socket,
  store,
  viewerId,
}: {
  readonly socket: SocketClient;
  readonly store: BringStoreApi;
  /** Le compte de cet onglet : un Bring adressé à un autre (changement de compte en vol) ne sonne pas ici. */
  readonly viewerId: () => string | null;
}): () => void {
  const onRing = (payload: unknown): void => {
    const ring = decodeBringRing(payload);
    if (ring !== null && ring.toUserId === viewerId()) store.getState().receive(ring);
  };
  const onStopped = (payload: unknown): void => {
    const stopped = decodeBringStopped(payload);
    if (stopped !== null) store.getState().stop(stopped.bringId);
  };
  socket.on(RELATION_SERVER_EVENTS.BRING_RING, onRing);
  socket.on(RELATION_SERVER_EVENTS.BRING_STOPPED, onStopped);
  return () => {
    socket.off(RELATION_SERVER_EVENTS.BRING_RING, onRing);
    socket.off(RELATION_SERVER_EVENTS.BRING_STOPPED, onStopped);
  };
}
