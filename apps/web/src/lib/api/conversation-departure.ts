import type { QueryClient } from '@tanstack/react-query';

import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';

import type { DepartureKind } from '@/lib/conversation-departure';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, type ConversationsDeps } from './conversations';
import type { ConversationsInfiniteData } from './conversations-pages';
import type { HttpRequest } from './http';
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
 * ne revient pas.
 */
export type DepartureDeps = ConversationsDeps & { readonly queryClient: QueryClient };

export type DepartureOutcome = 'departed' | 'offline' | 'failed';

const requestOf = (kind: DepartureKind, conversationId: string): HttpRequest =>
  kind === 'leave'
    ? { method: 'POST', path: conversationsEndpoints.byIdLeave(conversationId) }
    : { method: 'DELETE', path: conversationsEndpoints.byIdDeleteForMe(conversationId) };

type Withdrawn = { readonly pageIndex: number; readonly index: number; readonly conversation: Conversation };

function withdraw(queryClient: QueryClient, conversationId: string): Withdrawn | null {
  const data = queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY);
  if (data === undefined || !Array.isArray(data.pages)) return null;
  const pageIndex = data.pages.findIndex((page) => page.conversations.some((c) => c.id === conversationId));
  const page = data.pages[pageIndex];
  if (page === undefined) return null;
  const index = page.conversations.findIndex((c) => c.id === conversationId);
  const conversation = page.conversations[index];
  if (conversation === undefined) return null;
  queryClient.setQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY, {
    ...data,
    pages: data.pages.map((p, i) => (i === pageIndex ? { ...p, conversations: p.conversations.filter((c) => c.id !== conversationId) } : p)),
  });
  return { pageIndex, index, conversation };
}

function restore(queryClient: QueryClient, withdrawn: Withdrawn | null): void {
  if (withdrawn === null) return;
  queryClient.setQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY, (data) => {
    if (data === undefined) return data;
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

  const withdrawn = withdraw(deps.queryClient, conversationId);
  if (__FIXTURES__ && deps.source === 'fixtures') return 'departed';

  const result = await deps.transport.request<unknown>(requestOf(kind, conversationId)).catch(() => null);
  if (result === null || (!result.ok && result.status !== 404)) {
    restore(deps.queryClient, withdrawn);
    return 'failed';
  }

  withdraw(deps.queryClient, conversationId);
  deps.queryClient.removeQueries({ queryKey: conversationQueryKey(conversationId) });
  return 'departed';
}
