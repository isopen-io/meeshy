/**
 * conversation-unread-cache — écriture centralisée du compteur non-lu d'une
 * conversation dans les DEUX caches React Query (liste plate + infinite).
 * Utilisée par le handler socket `conversation:unread-updated` (avec garde de
 * conversation active) et par le reset optimiste à l'ouverture d'une
 * conversation.
 */

import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { setConversationUnreadInCache } from '@/lib/conversations/unread-cache';

type TestConversation = { id: string; unreadCount?: number; title?: string };

function seedCaches(queryClient: QueryClient, conversations: TestConversation[]) {
  queryClient.setQueryData(queryKeys.conversations.list(undefined), conversations);
  queryClient.setQueryData(queryKeys.conversations.infinite(), {
    pages: [
      {
        conversations: conversations.slice(0, 1),
        pagination: { offset: 0, limit: 1, total: conversations.length, hasMore: true },
      },
      {
        conversations: conversations.slice(1),
        pagination: { offset: 1, limit: 20, total: conversations.length, hasMore: false },
      },
    ],
    pageParams: [0, 1],
  });
}

describe('setConversationUnreadInCache', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it('écrit le compteur dans la liste plate ET dans toutes les pages du cache infinite', () => {
    seedCaches(queryClient, [
      { id: 'a', unreadCount: 2 },
      { id: 'b', unreadCount: 5 },
    ]);

    setConversationUnreadInCache(queryClient, 'b', 0);

    const flat = queryClient.getQueryData(queryKeys.conversations.list(undefined)) as TestConversation[];
    expect(flat.find((c) => c.id === 'b')!.unreadCount).toBe(0);
    expect(flat.find((c) => c.id === 'a')!.unreadCount).toBe(2);

    const infinite = queryClient.getQueryData(queryKeys.conversations.infinite()) as {
      pages: Array<{ conversations: TestConversation[] }>;
    };
    const all = infinite.pages.flatMap((p) => p.conversations);
    expect(all.find((c) => c.id === 'b')!.unreadCount).toBe(0);
    expect(all.find((c) => c.id === 'a')!.unreadCount).toBe(2);
  });

  it('préserve la structure de pages du cache infinite', () => {
    seedCaches(queryClient, [
      { id: 'a', unreadCount: 1 },
      { id: 'b', unreadCount: 1 },
    ]);

    setConversationUnreadInCache(queryClient, 'a', 7);

    const infinite = queryClient.getQueryData(queryKeys.conversations.infinite()) as {
      pages: Array<{ conversations: TestConversation[]; pagination: { offset: number } }>;
      pageParams: number[];
    };
    expect(infinite.pages).toHaveLength(2);
    expect(infinite.pages[0].pagination.offset).toBe(0);
    expect(infinite.pages[1].pagination.offset).toBe(1);
    expect(infinite.pageParams).toEqual([0, 1]);
  });

  it('reste un no-op sans cache peuplé', () => {
    expect(() => setConversationUnreadInCache(queryClient, 'ghost', 0)).not.toThrow();
    expect(queryClient.getQueryData(queryKeys.conversations.infinite())).toBeUndefined();
  });
});
