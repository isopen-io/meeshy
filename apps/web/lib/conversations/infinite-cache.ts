/**
 * Écriture structurée du cache infinite des conversations
 * (`queryKeys.conversations.infinite()` — celui que lit la sidebar).
 *
 * Extrait de `use-socket-cache-sync.ts`, qui en était le seul appelant jusqu'au
 * catch-up delta (`use-conversations-delta-sync.ts`). Les deux écrivent la MÊME
 * structure de pages ; la dupliquer aurait produit deux règles de repagination
 * divergentes sur le même cache.
 */

import type { Conversation } from '@/types';
import type { GetConversationsResponse } from '@/services/conversations/types';

/**
 * Forme exacte de ce que React Query stocke sous
 * `queryKeys.conversations.infinite()` : une page PAR appel de `queryFn`, donc
 * une `GetConversationsResponse` par page.
 */
export type InfiniteConversationData = {
  pages: GetConversationsResponse[];
  pageParams: number[];
};

/**
 * Reconstruit les pages depuis une liste À PLAT mise à jour, en PRÉSERVANT les
 * frontières de pages d'origine.
 *
 * Une version antérieure fusionnait toutes les pages en une seule page
 * synthétique avec `pageParams: [0]` et `pagination.offset: 0` : le
 * `fetchNextPage` suivant recalculait `getNextPageParam` contre cette page
 * fusionnée et soit re-tirait `offset=0` (doublons), soit calait. En rebâtissant
 * les frontières d'origine, `pageParams` reste intact et le scroll infini
 * continue d'avancer au-delà de la dernière page réelle.
 *
 * Le surplus (éléments ajoutés au-delà de la longueur d'origine — une
 * conversation neuve arrivée par socket ou par delta) part dans une page
 * supplémentaire plutôt que d'être perdu.
 */
export function rebuildInfiniteConversationPages(
  old: InfiniteConversationData,
  updated: Conversation[]
): InfiniteConversationData {
  const rebuiltPages: InfiniteConversationData['pages'] = [];
  let cursor = 0;
  for (let i = 0; i < old.pages.length; i++) {
    const originalPage = old.pages[i];
    const originalLength = originalPage.conversations.length;
    const slice = updated.slice(cursor, cursor + originalLength);
    rebuiltPages.push({
      conversations: slice,
      pagination: {
        // Métadonnées de pagination d'origine conservées pour que
        // `getNextPageParam` continue de voir les bons offsets/limites.
        ...originalPage.pagination,
        // `total` est le seul champ qui mérite un rafraîchissement — le compte
        // global grossit quand une conversation neuve est ajoutée.
        total: i === old.pages.length - 1 ? updated.length : originalPage.pagination.total,
      },
    });
    cursor += originalLength;
  }
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
