import type { QueryClient } from '@tanstack/react-query';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey } from './conversations';
import type { ConversationsInfiniteData } from './conversations-pages';

/**
 * UNE CONVERSATION FERMÉE OU RENDUE OBSOLÈTE QUITTE L'ÉCRAN (#14645) —
 * `conversation:closed` (`DELETE /conversations/:id`) et
 * `conversation:obsoleted` (`DELETE /conversations/:id/obsolete`, #14643, émis
 * juste après le premier). Les deux retirent la ligne de la liste, le détail
 * et les messages en cache (`conversationQueryKey` en préfixe), et le fil
 * ouvert se referme sur la liste : il n'a plus rien à montrer.
 *
 * FAIL-CLOSED sur la forme : une charge sans `conversationId` lisible ne
 * retire rien.
 */
export function conversationGoneOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const id = (payload as Readonly<Record<string, unknown>>).conversationId;
  return typeof id === 'string' && id !== '' ? id : null;
}

export function applyConversationGone(queryClient: QueryClient, conversationId: string): void {
  queryClient.setQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY, (data) => {
    if (data === undefined || !Array.isArray(data.pages)) return data;
    if (!data.pages.some((page) => page.conversations.some((c) => c.id === conversationId))) return data;
    return { ...data, pages: data.pages.map((page) => ({ ...page, conversations: page.conversations.filter((c) => c.id !== conversationId) })) };
  });
  queryClient.removeQueries({ queryKey: conversationQueryKey(conversationId) });
}

export type ThreadExit = {
  readonly pathname: string;
  readonly threadPath: (conversationId: string) => string;
  readonly listPath: string;
  readonly go: (path: string) => void;
};

export function leaveThreadOfGoneConversation(conversationId: string, exit: ThreadExit): void {
  if (exit.pathname === exit.threadPath(conversationId)) exit.go(exit.listPath);
}
