import { createStore } from 'zustand/vanilla';

/**
 * « MES RÉACTIONS » (#5814, § 3 conséquence 1 ; #5863) — quels emojis CE
 * lecteur a posés sur quel message, jamais deviné depuis un compte (un compte
 * de 2 ne dit pas qui). Trois écrivains : la page servie par
 * `GET …/messages` (`currentUserReactions`, `seedMineFromServed` ci-dessous),
 * le geste local (`performReaction`) et l'écho temps réel de MES réactions
 * posées ailleurs (`realtime-message-reactions.ts`).
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

/**
 * « MA RÉACTION » DÈS LE CHARGEMENT DU FIL (#5863, seconde moitié) — la page
 * servie par `GET /conversations/:id/messages` porte `currentUserReactions`
 * (les emojis que CE lecteur a posés, résolus par la passerelle en UNE
 * requête par page). Le serveur fait foi pour les messages qu'il décrit ; une
 * clé ABSENTE (passerelle antérieure) n'efface rien — l'absence n'est pas un
 * « aucune réaction ». Le magasin n'est réécrit que si quelque chose change.
 */
export type ServedMine = { readonly id: string; readonly currentUserReactions?: readonly string[] | null };

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((emoji) => b.includes(emoji));

export function seedMineFromServed(messages: readonly ServedMine[]): void {
  const current = reactionStore.getState().mine;
  const changed = messages.filter(
    (m) => Array.isArray(m.currentUserReactions) && !sameSet(current[m.id] ?? [], m.currentUserReactions),
  );
  if (changed.length === 0) return;
  const patch = Object.fromEntries(changed.map((m) => [m.id, [...(m.currentUserReactions ?? [])]]));
  reactionStore.setState({ mine: { ...current, ...patch } });
}
