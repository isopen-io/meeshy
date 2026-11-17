import type { QueryClient } from '@tanstack/react-query';

import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';

import type { DepartureKind } from '@/lib/conversation-departure';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, type ConversationsDeps } from './conversations';
import type { ConversationsInfiniteData } from './conversations-pages';
import type { HttpRequest } from './http';
import { createLiveGesture, writeLive, type LiveGesture } from './live-cache-journal';
import type { Conversation } from './types';

/**
 * **LA RANGÉE PART AU GESTE, LA PASSERELLE CONFIRME** (#7285, #7837) — miroir
 * de `ConversationStore.apply(.deleteForUser | .leave)` : la ligne quitte la
 * liste avant la réponse ; un refus ou une panne la RAMÈNE à sa place, sur sa
 * page. Un hors-ligne CERTAIN (`navigator.onLine === false`) ne retire rien :
 * le web n'a pas la file de reprise d'iOS, et une rangée qui disparaît pour
 * revenir une seconde plus tard ment deux fois.
 *
 * Un 404 (« vous ne participez pas ») dit que le départ a DÉJÀ eu lieu —
 * ailleurs, ou par un premier envoi dont la réponse s'est perdue : la rangée
 * ne revient pas — sauf pour RENDRE OBSOLÈTE (#14645) : la passerelle n'y
 * répond 404 à personne, et un refus doit ramener la rangée. Réussi, ce geste
 * emporte aussi le cache des messages (`conversationQueryKey` en préfixe) ;
 * refusé (403), il se dit `refused` — l'hôte le retient et le motive (#14690).
 *
 * PAR LE JOURNAL DES ÉCRITURES VIVES (#19082) : une relecture de la liste
 * partie avant le geste ne ramène pas la rangée ; refusé, le geste se retire
 * des journaux, et la rangée revient — telle que la réponse la sert, si une
 * relecture était en vol, ou telle qu'elle était.
 */
export type DepartureDeps = ConversationsDeps & { readonly queryClient: QueryClient };

export type DepartureOutcome = 'departed' | 'offline' | 'failed' | 'refused';

const REQUESTS: Readonly<Record<DepartureKind, (conversationId: string) => HttpRequest>> = {
  leave: (id) => ({ method: 'POST', path: conversationsEndpoints.byIdLeave(id) }),
  delete: (id) => ({ method: 'DELETE', path: conversationsEndpoints.byIdDeleteForMe(id) }),
  obsolete: (id) => ({ method: 'DELETE', path: conversationsEndpoints.byIdObsolete(id) }),
};

const alreadyGone = (kind: DepartureKind, status: number): boolean => kind !== 'obsolete' && status === 404;

/** Rendre obsolète refusé (403) : un REFUS de la porte, pas une panne (#14690). */
const refused = (kind: DepartureKind, status: number): boolean => kind === 'obsolete' && status === 403;

type Withdrawn = { readonly pageIndex: number; readonly index: number; readonly conversation: Conversation };

const withoutConversation =
  (conversationId: string) =>
  (data: ConversationsInfiniteData | undefined): ConversationsInfiniteData | undefined =>
    data === undefined || !Array.isArray(data.pages) || !data.pages.some((page) => page.conversations.some((c) => c.id === conversationId))
      ? data
      : { ...data, pages: data.pages.map((page) => ({ ...page, conversations: page.conversations.filter((c) => c.id !== conversationId) })) };

function withdraw(queryClient: QueryClient, conversationId: string, gesture: LiveGesture): Withdrawn | null {
  const data = queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY);
  const pageIndex = data === undefined || !Array.isArray(data.pages) ? -1 : data.pages.findIndex((page) => page.conversations.some((c) => c.id === conversationId));
  const page = data?.pages[pageIndex];
  const index = page === undefined ? -1 : page.conversations.findIndex((c) => c.id === conversationId);
  const conversation = page?.conversations[index];
  gesture.run(() => writeLive(queryClient, CONVERSATIONS_QUERY_KEY, withoutConversation(conversationId)));
  return conversation === undefined ? null : { pageIndex, index, conversation };
}

function restore(queryClient: QueryClient, withdrawn: Withdrawn | null): void {
  if (withdrawn === null) return;
  writeLive<ConversationsInfiniteData>(queryClient, CONVERSATIONS_QUERY_KEY, (data) => {
    if (data === undefined || !Array.isArray(data.pages)) return data;
    if (data.pages.some((page) => page.conversations.some((c) => c.id === withdrawn.conversation.id))) return data;
    return {
      ...data,
      pages: data.pages.map((page, i) =>
        i === withdrawn.pageIndex
          ? {
              ...page,
              conversations: [
                ...page.conversations.slice(0, withdrawn.index),
                withdrawn.conversation,
                ...page.conversations.slice(withdrawn.index),
              ],
            }
          : page,
      ),
    };
  });
}

export async function performDeparture(params: {
  readonly conversationId: string;
  readonly kind: DepartureKind;
  readonly online: boolean;
  readonly deps: DepartureDeps;
}): Promise<DepartureOutcome> {
  const { conversationId, kind, online, deps } = params;
  if (!online) return 'offline';

  const gesture = createLiveGesture();
  const withdrawn = withdraw(deps.queryClient, conversationId, gesture);
  if (__FIXTURES__ && deps.source === 'fixtures') return 'departed';

  const result = await deps.transport.request<unknown>(REQUESTS[kind](conversationId)).catch(() => null);
  if (result === null || (!result.ok && !alreadyGone(kind, result.status))) {
    gesture.retract();
    restore(deps.queryClient, withdrawn);
    return result !== null && !result.ok && refused(kind, result.status) ? 'refused' : 'failed';
  }

  withdraw(deps.queryClient, conversationId, gesture);
  deps.queryClient.removeQueries({ queryKey: conversationQueryKey(conversationId) });
  return 'departed';
}
