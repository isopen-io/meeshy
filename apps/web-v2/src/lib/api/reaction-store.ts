import { createStore } from 'zustand/vanilla';

/**
 * « MES RÉACTIONS » DE LA SESSION (#5814, § 3 conséquence 1) — la passerelle
 * ne sert PAS « les miennes » sur `GET …/messages`
 * (`packages/shared/types/conversation.ts:174-175` : `reactionSummary` est
 * un COMPTE `{emoji: n}`, jamais une liste de participants). Ce magasin
 * mémorise donc, pour la SEULE session courante, quels emojis CE lecteur a
 * posés sur quel message — seedé à VIDE, jamais deviné depuis un compte
 * (un compte de 2 ne dit pas qui). Issue compagnon (§ 3) : lire
 * `GET /reactions/:messageId` (`userReactions`) au chargement du fil pour ne
 * plus repartir de zéro à chaque session.
 *
 * `zustand/vanilla`, motif `conversation-store.ts` : hors de tout composant,
 * observable par `subscribe()` et par `useStore(reactionStore, selector)`.
 */
export type ReactionStoreState = {
  readonly mine: Readonly<Record<string, readonly string[]>>;
  readonly add: (messageId: string, emoji: string) => void;
  readonly remove: (messageId: string, emoji: string) => void;
};

export const reactionStore = createStore<ReactionStoreState>((set) => ({
  mine: {},
  add: (messageId, emoji) =>
    set((state) => {
      const current = state.mine[messageId] ?? [];
      if (current.includes(emoji)) return state;
      return { mine: { ...state.mine, [messageId]: [...current, emoji] } };
    }),
  remove: (messageId, emoji) =>
    set((state) => {
      const current = state.mine[messageId] ?? [];
      if (!current.includes(emoji)) return state;
      return { mine: { ...state.mine, [messageId]: current.filter((e) => e !== emoji) } };
    }),
}));

/** L'accesseur PUR — `reactionStore.getState().mine[messageId] ?? EMPTY`
 * ailleurs dans le dépôt écrirait la même ligne dix fois. */
const EMPTY: readonly string[] = [];
export function mineOf(messageId: string): readonly string[] {
  return reactionStore.getState().mine[messageId] ?? EMPTY;
}
