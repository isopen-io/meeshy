/**
 * Écriture NON DESTRUCTIVE du cache infinite de la liste de conversations
 * (`conversations.infinite()`, celui que lisent la sidebar v2 et le layout v1).
 *
 * Chokepoint unique de toute mise à jour dérivée d'un event socket ou d'un
 * rattrapage delta : l'updater reçoit la liste À PLAT et rend la liste voulue ;
 * la structure de pages est reconstruite derrière lui. Aucun appelant ne
 * fabrique de pages à la main — c'est précisément ce qui cassait
 * `getNextPageParam` (cf. commentaire « PRESERVE PAGE STRUCTURE » ci-dessous).
 */

import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { Conversation } from '@/types';

export type InfiniteConversationData = {
  pages: { conversations: Conversation[]; pagination: { limit: number; offset: number; total: number; hasMore: boolean } }[];
  pageParams: number[];
};

/** Liste à plat + `hasMore` de la dernière page, sans écrire quoi que ce soit. */
export function readInfiniteConversationCache(
  queryClient: QueryClient
): { conversations: Conversation[]; hasMore: boolean } | null {
  const cached = queryClient.getQueryData<InfiniteConversationData>(
    queryKeys.conversations.infinite()
  );
  if (!cached?.pages?.length) return null;

  return {
    conversations: cached.pages.flatMap((page) => page.conversations),
    hasMore: Boolean(cached.pages[cached.pages.length - 1]?.pagination?.hasMore),
  };
}

export function updateInfiniteConversationCache(
  queryClient: QueryClient,
  updater: (conversations: Conversation[]) => Conversation[]
): void {
  queryClient.setQueryData(
    queryKeys.conversations.infinite(),
    (old: InfiniteConversationData | undefined) => {
      if (!old) return old;
      const allConversations = old.pages.flatMap(page => page.conversations);
      const updated = updater(allConversations);
      if (updated === allConversations) return old;

      // PRESERVE PAGE STRUCTURE. Previously this code collapsed every
      // existing page into a single synthetic page with `pageParams: [0]`
      // and `pagination.offset: 0` — meaning the next `fetchNextPage`
      // call recomputed `getNextPageParam` against that single fused
      // page and either re-fetched offset=0 (re-loading already-loaded
      // conversations as duplicates) or stalled if the synthetic
      // `hasMore` didn't propagate. By rebuilding the original page
      // boundaries from the updated array, `pageParams` stay intact and
      // infinite scroll keeps advancing past the last real page.
      const rebuiltPages: typeof old.pages = [];
      let cursor = 0;
      for (let i = 0; i < old.pages.length; i++) {
        const originalPage = old.pages[i];
        const originalLength = originalPage.conversations.length;
        const slice = updated.slice(cursor, cursor + originalLength);
        rebuiltPages.push({
          conversations: slice,
          pagination: {
            // Keep the original pagination metadata so `getNextPageParam`
            // continues to see correct offsets/limits.
            ...originalPage.pagination,
            // `total` is the only field worth refreshing — the global
            // count grows when a brand-new conversation is prepended.
            total: i === old.pages.length - 1 ? updated.length : originalPage.pagination.total,
          },
        });
        cursor += originalLength;
      }
      // Tail: any items the updater added beyond the original total
      // length (e.g. a brand-new conversation prepended via fetch
      // fallback). Append them as an extra page so they're not lost.
      if (cursor < updated.length) {
        const last = old.pages[old.pages.length - 1];
        rebuiltPages.push({
          conversations: updated.slice(cursor),
          pagination: {
            ...last.pagination,
            offset: cursor,
            total: updated.length,
          },
        });
      }

      return {
        pages: rebuiltPages,
        pageParams: old.pageParams,
      };
    }
  );
}
