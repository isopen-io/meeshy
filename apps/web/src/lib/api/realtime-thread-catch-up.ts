import type { QueryClient } from '@tanstack/react-query';

import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { findCachedThreadMessage, messagesQueryKey } from './messages';
import type { MessagesInfiniteData } from './messages-pages';

/**
 * **UN MESSAGE ANNONCÉ FINIT DANS LE FIL OUVERT** (#9291) — retour porteur
 * 2026-10-04 : « on a parfois la notification, mais pas le message dans le
 * fil ».
 *
 * DEUX TROUS, deux fonctions.
 *
 * 1. **La requête en vol écrase le temps réel** (`keepLiveMessageOverFetch`).
 *    `upsertThreadMessage` pose le message dans le cache du fil ; mais si une
 *    requête du fil est en vol à cet instant (ouverture, retour de focus,
 *    reconnexion, page plus ancienne), TanStack remplace le cache par SA
 *    réponse — partie AVANT le message (`infiniteQueryBehavior` capture
 *    `oldPages` au départ). Le message disparaissait jusqu'à la relecture
 *    suivante. Invalider ANNULE la requête en vol (`cancelRefetch`) et en
 *    relance une, qui le contient.
 *
 * 2. **`message:new` ne parvient pas** (`catchUpThreadMessage`). Il ne voyage
 *    que dans la room de la conversation ; `conversation:updated` et
 *    `notification:new` voyagent dans la room PERSONNELLE. Un socket absent de
 *    la room (jonction échouée, chemin d'admission sans auto-join, coupure non
 *    détectée) voyait la ligne de liste et la cloche bouger, le fil restant
 *    muet. Le signal personnel qui NOMME un message absent du fil en cache
 *    relit ce fil : rien ne part quand le message y est déjà (le cas nominal),
 *    ni quand le fil n'a jamais été ouvert (la prochaine ouverture le charge).
 *
 * 3. **La LISTE avait le même trou** (#9637, retour porteur 2026-10-07 : « les
 *    derniers messages reçus disparaissent », web et coque Android). Une
 *    relecture de la liste partie avant le message remettait l'aperçu
 *    précédent sur la ligne (`keepLiveListOverFetch`) ; même remède.
 */

const isFetching = (queryClient: QueryClient, queryKey: readonly unknown[]): boolean =>
  queryClient.getQueryState(queryKey)?.fetchStatus === 'fetching';

/** Invalider ANNULE la requête en vol (`cancelRefetch`) et en relance une, qui
 * contient ce que le temps réel vient de poser. */
const relaunch = (queryClient: QueryClient, queryKey: readonly unknown[]): void => {
  void queryClient.invalidateQueries({ queryKey, exact: true });
};

const relaunchThread = (queryClient: QueryClient, conversationId: string): void =>
  relaunch(queryClient, messagesQueryKey(conversationId));

export function keepLiveMessageOverFetch(queryClient: QueryClient, conversationId: string): void {
  if (isFetching(queryClient, messagesQueryKey(conversationId))) relaunchThread(queryClient, conversationId);
}

export function keepLiveListOverFetch(queryClient: QueryClient): void {
  if (isFetching(queryClient, CONVERSATIONS_QUERY_KEY)) relaunch(queryClient, CONVERSATIONS_QUERY_KEY);
}

export function catchUpThreadMessage(
  queryClient: QueryClient,
  params: { readonly conversationId: string; readonly messageId: string },
): void {
  const data = queryClient.getQueryData<MessagesInfiniteData>(messagesQueryKey(params.conversationId));
  if (data === undefined) return;
  if (findCachedThreadMessage(queryClient, params.conversationId, params.messageId) !== undefined) return;
  relaunchThread(queryClient, params.conversationId);
}
