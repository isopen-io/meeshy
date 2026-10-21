import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { CONVERSATIONS_QUERY_KEY, findCachedConversation } from './conversations';
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
 *
 * 4. **La conversation HORS PAGE** (#10573, `createUnknownRowCatchUp`).
 *    `patchConversation` ne patche qu'une ligne que la liste en cache porte :
 *    un message dans une conversation au-delà des pages chargées, ou née
 *    pendant que le socket était sourd, ne remontait jamais en tête. La liste
 *    est relue, UNE fois par rafale.
 *
 * 5. **La PREMIÈRE authentification** (#10573, `catchUpFirstAuthentication`).
 *    Le socket se branche après la première peinture : ce qui est parti entre
 *    la lecture REST et l'entrée dans les rooms ne parvient jamais.
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

/** La LISTE seule (`exact`) : `['conversations']` préfixe aussi la case et la
 * page de chaque fil, qu'une relecture de liste n'a pas à relancer. */
export const relaunchConversationList = (queryClient: QueryClient): void => relaunch(queryClient, CONVERSATIONS_QUERY_KEY);

export function keepLiveMessageOverFetch(queryClient: QueryClient, conversationId: string): void {
  if (isFetching(queryClient, messagesQueryKey(conversationId))) relaunchThread(queryClient, conversationId);
}

export function keepLiveListOverFetch(queryClient: QueryClient): void {
  if (isFetching(queryClient, CONVERSATIONS_QUERY_KEY)) relaunchConversationList(queryClient);
}

/** La fenêtre d'une rafale : une salve de `message:new` d'un groupe hors page
 * ne coûte qu'UNE relecture, partie après elle. */
export const UNKNOWN_ROW_COALESCE_MS = 500;

export type UnknownRowCatchUp = {
  readonly note: (conversationId: string) => void;
  readonly dispose: () => void;
};

/**
 * Une liste jamais chargée n'est pas demandée : son ouverture la chargera. Le
 * minuteur est celui de la connexion (`RealtimeDeps.scheduleTimeout`), donc
 * témoignable sans attendre, et annulé à sa destruction.
 */
export function createUnknownRowCatchUp(params: {
  readonly queryClient: QueryClient;
  readonly scheduleTimeout: (fn: () => void, ms: number) => unknown;
  readonly clearTimeoutFn: (handle: unknown) => void;
}): UnknownRowCatchUp {
  const { queryClient } = params;
  let pending: { readonly handle: unknown } | null = null;
  return {
    note: (conversationId) => {
      if (pending !== null) return;
      if (queryClient.getQueryData(CONVERSATIONS_QUERY_KEY) === undefined) return;
      if (findCachedConversation(queryClient, conversationId) !== undefined) return;
      pending = {
        handle: params.scheduleTimeout(() => {
          pending = null;
          relaunchConversationList(queryClient);
        }, UNKNOWN_ROW_COALESCE_MS),
      };
    },
    dispose: () => {
      if (pending !== null) params.clearTimeoutFn(pending.handle);
      pending = null;
    },
  };
}

const isListOrLiveThread = (queryKey: QueryKey): boolean =>
  queryKey[0] === CONVERSATIONS_QUERY_KEY[0] && (queryKey.length === 1 || (queryKey.length === 3 && queryKey[2] === 'messages'));

/**
 * Seules les requêtes DÉJÀ SERVIES et au repos sont relues : une requête
 * jamais servie est celle du démarrage à froid, encore en vol, et une relecture
 * en vol (cache restauré) part après la sienne — la relancer doublerait la
 * requête que l'écran vient d'émettre. Ni la case d'une conversation, ni une
 * fenêtre ancrée (#7420, du passé) : `message:new` ne les nourrit pas. Seules
 * les requêtes OBSERVÉES repartent (`refetchType: 'active'` par défaut) ; un
 * fil fermé est seulement marqué périmé.
 */
export function catchUpFirstAuthentication(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    queryKey: CONVERSATIONS_QUERY_KEY,
    predicate: (query) =>
      query.state.dataUpdatedAt > 0 && query.state.fetchStatus !== 'fetching' && isListOrLiveThread(query.queryKey),
  });
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
