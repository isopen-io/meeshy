import { reactionStore, seedMineFromServed, type ReactionStoreState } from './reaction-store';
import type { Message } from './types';

/**
 * « MA RÉACTION » JUSTE DÈS LE CHARGEMENT DU FIL (#5863, #7936).
 *
 * `GET /conversations/:id/messages` sert `currentUserReactions` par message —
 * les emojis que CE lecteur a posés, résolus par la passerelle en UNE requête
 * pour la page. La page suffit : aucun `GET /reactions/:id` ne part plus.
 *
 * **Un geste local pendant le chargement gagne** : la page décrit l'état du
 * serveur AVANT ce geste. `snapshotMine()` se prend avant la requête ; un
 * message dont « ma réaction » a bougé depuis n'est pas réécrit.
 */
export type MineSnapshot = ReactionStoreState['mine'];

export const snapshotMine = (): MineSnapshot => reactionStore.getState().mine;

const isUnconfirmedLocal = (message: Message): boolean =>
  (message as { readonly clientMessageId?: string }).clientMessageId === message.id;

export function seedMineFromPage(messages: readonly Message[], before: MineSnapshot): void {
  const now = reactionStore.getState().mine;
  seedMineFromServed(messages.filter((m) => !isUnconfirmedLocal(m) && now[m.id] === before[m.id]));
}
