import { createStore } from 'zustand/vanilla';

import { flagsOf, type ConversationFlags } from './api/preferences';
import type { Conversation } from './api/types';
import { unreadOf } from './view/conversation';

/**
 * L'ÉTAT OPTIMISTE DES ACTIONS DE RANGÉE (#5559 §5.4) — épingler, sourdine,
 * archiver, marquer lu/non-lu.
 *
 * Cet état n'appartient PAS au client : `isPinned`/`isMuted`/`isArchived`
 * viennent du wire (`userPreferences`, §3.1) et `unreadCount` du serveur. Le
 * store ne porte donc AUCUNE persistance locale (contrairement à
 * `reading-mode/store.ts`, qui mémorise un mode COLLANT dans
 * `localStorage`) — seulement des OVERRIDES, la correction optimiste qu'un
 * appel serveur confirmera ou effacera. Quand le lot `staging` câble le
 * réseau, chaque action appelle le port correspondant
 * (`pushConversationFlags`/`pushRead`/`pushUnread`, `api/preferences.ts`)
 * puis RETIRE l'override sur 4xx — sémantique iOS
 * `ConversationListViewModel.togglePin` (`:2044-2053`) : la mise à jour
 * optimiste précède l'appel, un refus la défait, un succès la laisse telle
 * quelle (le prochain `GET /conversations` la remplacera par le wire
 * confirmé).
 *
 * `zustand/vanilla` — pas `zustand` (l'entrée par défaut suppose un
 * consommateur React immédiat) : ce fichier ne sait rien de la vue, les
 * composants s'y abonnent via `zustand/react`'s `useStore(conversationStore,
 * selector)`. `createStore` rend le magasin observable par `subscribe()`
 * hors de tout composant — c'est ce qu'un témoin exploite directement,
 * sans monter d'arbre.
 */
export type ConversationOverride = {
  readonly flags?: Partial<ConversationFlags>;
  readonly unreadCount?: number;
};

type Overrides = Readonly<Record<string, ConversationOverride>>;

export type ConversationStoreState = {
  readonly overrides: Overrides;
  togglePin(id: string, current: boolean): void;
  toggleMute(id: string, current: boolean): void;
  toggleArchive(id: string, current: boolean): void;
  markRead(id: string): void;
  markUnread(id: string): void;
};

const mergeOverride = (overrides: Overrides, id: string, patch: ConversationOverride): Overrides => ({
  ...overrides,
  [id]: { ...overrides[id], ...patch },
});

const mergeFlag = (
  overrides: Overrides,
  id: string,
  field: keyof ConversationFlags,
  value: boolean,
): Overrides =>
  mergeOverride(overrides, id, { flags: { ...overrides[id]?.flags, [field]: value } });

export const conversationStore = createStore<ConversationStoreState>((set) => ({
  overrides: {},
  togglePin: (id, current) => set((state) => ({ overrides: mergeFlag(state.overrides, id, 'isPinned', !current) })),
  toggleMute: (id, current) => set((state) => ({ overrides: mergeFlag(state.overrides, id, 'isMuted', !current) })),
  toggleArchive: (id, current) =>
    set((state) => ({ overrides: mergeFlag(state.overrides, id, 'isArchived', !current) })),
  markRead: (id) => set((state) => ({ overrides: mergeOverride(state.overrides, id, { unreadCount: 0 }) })),
  /**
   * `unreadCount: 1` — le serveur recule le curseur d'UN message avant le
   * dernier (`ConversationListViewModel.markAsUnread`, `:2150-2160`) : depuis
   * n'importe quel état lu, le résultat observable est « au moins un non
   * lu ». Un compte plus précis exigerait de connaître le nombre RÉEL de
   * messages non consommés, que l'optimiste n'a pas — le serveur le corrige
   * au prochain `GET /conversations`.
   */
  markUnread: (id) => set((state) => ({ overrides: mergeOverride(state.overrides, id, { unreadCount: 1 }) })),
}));

/**
 * Sélecteurs PURS — `(conversation, overrides)`, jamais le store lui-même :
 * un témoin ou un composant qui n'a besoin que de LIRE l'état effectif ne
 * doit pas s'abonner à `conversationStore` pour ça.
 */
export function effectiveFlagsOf(conversation: Conversation, overrides: Overrides): ConversationFlags {
  const wire = flagsOf(conversation);
  const override = overrides[conversation.id]?.flags;
  return override === undefined ? wire : { ...wire, ...override };
}

export function effectiveUnreadOf(conversation: Conversation, overrides: Overrides): number {
  const override = overrides[conversation.id]?.unreadCount;
  return override ?? unreadOf(conversation);
}
