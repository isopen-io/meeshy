import type { QueryClient } from '@tanstack/react-query';

import { conversationActiveCallQueryKey, type ConversationActiveCall } from '@/lib/api/call-sessions';
import { patchConversation, patchConversationDetail } from '@/lib/api/conversations';
import type { ListConversation } from '@/lib/api/list-preview';
import { messagesQueryKey } from '@/lib/api/messages';
import type { MessagesInfiniteData } from '@/lib/api/messages-pages';
import type { Conversation } from '@/lib/api/types';
import { metadataOf } from '@/lib/view/message-metadata';

export type EndedCall = { readonly conversationId: string; readonly callId: string };

/**
 * **UN APPEL QUE LE SERVEUR DIT FINI CESSE D'ÊTRE JOIGNABLE PARTOUT** (#19778) —
 * la carte d'un appel terminé offrait « Rejoindre » parce que sa copie était
 * restée `call-live` (édition terminale manquée, fil relu du cache). Sur la
 * preuve serveur (join refusé CALL_ENDED, sondage qui ne voit plus cet appel),
 * les trois sources qui le tenaient pour vivant oublient CET appel, et lui seul :
 * le sondage du fil, la ligne de liste (et le détail, que l'en-tête lit), et le
 * fil qui en garde la carte « en cours » se relit pour recevoir son résumé
 * servi — le client n'invente ni durée ni issue.
 */
export function repairEndedCall(queryClient: QueryClient, ended: EndedCall): void {
  queryClient.setQueryData<ConversationActiveCall | null>(conversationActiveCallQueryKey(ended.conversationId), (served) =>
    served?.callId === ended.callId ? null : served,
  );
  const forget = (conversation: Conversation): Conversation => {
    const { activeCall, ...rest } = conversation as ListConversation;
    return activeCall?.id === ended.callId ? (rest as Conversation) : conversation;
  };
  patchConversation(queryClient, ended.conversationId, forget);
  patchConversationDetail(queryClient, ended.conversationId, forget);
  if (holdsLiveCard(queryClient, ended)) void queryClient.invalidateQueries({ queryKey: messagesQueryKey(ended.conversationId) });
}

function holdsLiveCard(queryClient: QueryClient, ended: EndedCall): boolean {
  return queryClient
    .getQueriesData<MessagesInfiniteData>({ queryKey: messagesQueryKey(ended.conversationId) })
    .some(([, data]) =>
      Array.isArray(data?.pages) &&
      data.pages.some((page) =>
        page.messages.some((message) => {
          const metadata = metadataOf(message);
          return metadata?.kind === 'call-live' && metadata.callId === ended.callId;
        }),
      ),
    );
}
