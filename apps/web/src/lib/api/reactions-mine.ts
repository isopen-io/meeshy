import type { ReactionSync } from '@meeshy/shared/types/reaction';

import type { ConversationsDeps } from './conversations';
import { reactionStore, seedMineFromServed } from './reaction-store';
import type { Message } from './types';

/**
 * « MA RÉACTION » JUSTE DÈS LE CHARGEMENT DU FIL (#5863, seconde moitié).
 *
 * `GET /conversations/:id/messages` ne sert pas `currentUserReactions` au
 * niveau du message (retiré par #4177, faute d'être déclaré au schéma) : la
 * page dit COMBIEN, jamais QUI. La voie la plus sobre sans toucher la
 * passerelle est celle que l'issue propose — `GET /reactions/:messageId`
 * (`userReactions`, résolu pour le lecteur), mais SEULEMENT pour les messages
 * qui portent au moins une réaction : un message sans réaction ne peut pas
 * être « à moi », il ne coûte aucune requête et efface un reste de session.
 * Si la page sert déjà `currentUserReactions` (passerelle qui le déclarerait),
 * il fait foi et aucune requête ne part.
 *
 * **Un geste local pendant la requête gagne** : la réponse décrit l'état du
 * serveur AVANT ce geste, elle ne l'écrase pas.
 */
type WithServedMine = Message & { readonly currentUserReactions?: readonly string[] | null };

const isReacted = (message: Message): boolean =>
  Object.values(message.reactionSummary ?? {}).some((count) => count > 0);

const isUnconfirmedLocal = (message: Message): boolean =>
  (message as { readonly clientMessageId?: string }).clientMessageId === message.id;

async function refreshOne(deps: ConversationsDeps, messageId: string): Promise<void> {
  const before = reactionStore.getState().mine[messageId];
  const result = await deps.transport
    .request<ReactionSync>({ method: 'GET', path: `/api/v1/reactions/${encodeURIComponent(messageId)}` })
    .catch(() => null);
  if (result === null || !result.ok || !Array.isArray(result.data?.userReactions)) return;
  if (reactionStore.getState().mine[messageId] !== before) return;
  seedMineFromServed([{ id: messageId, currentUserReactions: result.data.userReactions }]);
}

export async function refreshMineForPage(deps: ConversationsDeps, messages: readonly Message[]): Promise<void> {
  if (deps.source === 'fixtures') return;
  const confirmed = (messages as readonly WithServedMine[]).filter((m) => !isUnconfirmedLocal(m));
  const served = confirmed.filter((m) => Array.isArray(m.currentUserReactions));
  const unserved = confirmed.filter((m) => !Array.isArray(m.currentUserReactions));

  seedMineFromServed([
    ...served,
    ...unserved.filter((m) => !isReacted(m)).map((m) => ({ id: m.id, currentUserReactions: [] })),
  ]);
  await Promise.all(unserved.filter(isReacted).map((m) => refreshOne(deps, m.id)));
}
