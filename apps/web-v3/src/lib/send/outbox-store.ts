import { createStore, type StoreApi } from 'zustand/vanilla';

import type { ApiFailure } from '@/lib/api/http';
import type { LocalDelivery } from '@/lib/view/message';

import type { LocalMessage } from './local-message';

/**
 * L'OUTBOX (#5813, étape 4) — le magasin qui porte un envoi tant que le
 * transport n'a pas tranché, HORS du cache TanStack (D-16 amendée par D-28,
 * § 0 de la spécification #5813). Même motif que `conversation-store.ts`
 * (`zustand/vanilla`, mémoire seule — jamais `localStorage`, Q6 de la
 * spécification) : ce fichier ne sait rien de la vue, `use-send.ts` s'y
 * abonne via `zustand/react`.
 *
 * `entries` est indexé PAR CONVERSATION : le magasin ne dépend d'aucun
 * composant monté, une entrée survit à un aller-retour vers `/` (§ 6.2 de la
 * spécification, « quitter le fil puis revenir »).
 */
export type OutboxEntry = {
  /** Le local — `id === clientMessageId` avant confirmation. */
  readonly message: LocalMessage;
  readonly delivery: LocalDelivery;
  readonly attempts: number;
  /** Epoch ms de la tentative COURANTE — l'horloge des 200 ms (§5 étape 9). */
  readonly startedAt: number;
  readonly lastError?: ApiFailure;
};

export type OutboxState = {
  readonly entries: Readonly<Record<string, readonly OutboxEntry[]>>;
  /**
   * COMBIEN D'ENVOIS SE SONT CONFIRMÉS, PAR CONVERSATION — des compteurs
   * MONOTONES, jamais un état d'entrée : une entrée confirmée n'existe plus.
   * C'est le seul signal qu'une confirmation a EU LIEU, et c'est ce que
   * l'annonce lecteur d'écran (`use-send.ts`) attendait. Le dériver du
   * compte d'entrées `failed` faisait dire « Message envoyé » au DÉBUT d'une
   * reprise (`markPending`, avant tout appel) et jamais sur un envoi réussi
   * du premier coup — l'annonce mentait dans les deux sens.
   *
   * INDEXÉ PAR CONVERSATION comme `entries`, et pour la même raison : un
   * compteur global ferait annoncer, dans le fil ouvert, la confirmation
   * d'un envoi parti d'une AUTRE surface. Aujourd'hui un seul fil est monté
   * à la fois ; ce hook est celui que les surfaces à venir copieront.
   */
  readonly confirmed: Readonly<Record<string, number>>;
  enqueue(conversationId: string, entry: OutboxEntry): void;
  markPending(conversationId: string, clientMessageId: string, startedAt: number): void;
  markFailed(conversationId: string, clientMessageId: string, failure?: ApiFailure): void;
  /** LE GESTE DE LA CONFIRMATION — appelé par `perform-send.ts` sur un 2xx,
   * et de nulle part ailleurs : il incrémente `confirmed`. */
  remove(conversationId: string, clientMessageId: string): void;
};

const replaceEntry = (
  entries: readonly OutboxEntry[],
  clientMessageId: string,
  update: (entry: OutboxEntry) => OutboxEntry,
): readonly OutboxEntry[] =>
  entries.map((entry) => (entry.message.clientMessageId === clientMessageId ? update(entry) : entry));

export function createOutboxStore(): StoreApi<OutboxState> {
  return createStore<OutboxState>((set) => ({
    entries: {},
    confirmed: {},
    enqueue: (conversationId, entry) =>
      set((state) => ({
        entries: { ...state.entries, [conversationId]: [...(state.entries[conversationId] ?? []), entry] },
      })),
    /**
     * `attempts` compte l'ordinal de la tentative EN COURS ou À VENIR — posé
     * à l'`enqueue` (le PREMIER envoi, `perform-send.ts`) et INCRÉMENTÉ par
     * `markFailed` (« la prochaine tentative sera la N+1-ième »), jamais par
     * `markPending` : reprendre une entrée `'failed'` relance exactement la
     * tentative que `markFailed` vient de compter, sans en ouvrir une de
     * plus. Témoin 4.5 (6) : après un échec puis une reprise, `attempts`
     * vaut 2 PENDANT le second envol — un seul incrément entre les deux.
     */
    markPending: (conversationId, clientMessageId, startedAt) =>
      set((state) => {
        const current = state.entries[conversationId];
        if (current === undefined) return state;
        return {
          entries: {
            ...state.entries,
            [conversationId]: replaceEntry(current, clientMessageId, (entry) => ({
              ...entry,
              delivery: 'pending',
              startedAt,
            })),
          },
        };
      }),
    markFailed: (conversationId, clientMessageId, failure) =>
      set((state) => {
        const current = state.entries[conversationId];
        if (current === undefined) return state;
        return {
          entries: {
            ...state.entries,
            [conversationId]: replaceEntry(current, clientMessageId, (entry) => ({
              ...entry,
              delivery: 'failed',
              attempts: entry.attempts + 1,
              ...(failure === undefined ? {} : { lastError: failure }),
            })),
          },
        };
      }),
    remove: (conversationId, clientMessageId) =>
      set((state) => {
        const current = state.entries[conversationId];
        if (current === undefined) return state;
        const next = current.filter((entry) => entry.message.clientMessageId !== clientMessageId);
        // Rien retiré ⇒ rien confirmé : le compteur ne bouge pas, et l'état
        // reste `toBe`-identique.
        if (next.length === current.length) return state;
        const confirmed = {
          ...state.confirmed,
          [conversationId]: (state.confirmed[conversationId] ?? 0) + 1,
        };
        if (next.length === 0) {
          const { [conversationId]: _removed, ...rest } = state.entries;
          return { entries: rest, confirmed };
        }
        return { entries: { ...state.entries, [conversationId]: next }, confirmed };
      }),
  }));
}

/** L'INSTANCE UNIQUE — l'application entière la partage (motif
 * `conversationStore`, `lib/conversation-store.ts:74`). */
export const outboxStore = createOutboxStore();

export const EMPTY_ENTRIES: readonly OutboxEntry[] = [];

export const entriesOf = (state: OutboxState, conversationId: string): readonly OutboxEntry[] =>
  state.entries[conversationId] ?? EMPTY_ENTRIES;

export const confirmedCountOf = (state: OutboxState, conversationId: string): number =>
  state.confirmed[conversationId] ?? 0;
