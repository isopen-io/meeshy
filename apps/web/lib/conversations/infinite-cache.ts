/**
 * Écriture centralisée du cache infinite de la liste de conversations
 * (`conversations.infinite()`, celui que lit la sidebar).
 *
 * Extrait de `hooks/queries/use-socket-cache-sync.ts`, où il vivait en privé :
 * le delta-sync du reconnect (`use-conversations-delta-sync.ts`) doit écrire
 * exactement la même reconstruction de pages que les handlers socket. Deux
 * copies de cette reconstruction, c'est deux façons de casser `pageParams`.
 */

import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { Conversation } from '@meeshy/shared/types';

export type InfiniteConversationData = {
  pages: { conversations: Conversation[]; pagination: any }[];
  pageParams: number[];
};

/**
 * Applique `updater` sur la liste APLATIE des conversations en cache, puis
 * reconstruit les frontières de pages d'origine.
 *
 * PRESERVE PAGE STRUCTURE. Une version antérieure fusionnait toutes les pages
 * en une seule page synthétique avec `pageParams: [0]` et
 * `pagination.offset: 0` — le `fetchNextPage` suivant recalculait alors
 * `getNextPageParam` contre cette page fusionnée et soit re-demandait offset=0
 * (doublons), soit calait si le `hasMore` synthétique ne se propageait pas.
 * Reconstruire les frontières d'origine garde `pageParams` intact et laisse le
 * scroll infini avancer au-delà de la dernière page réelle.
 *
 * Un `updater` qui rend le tableau reçu À L'IDENTIQUE (même référence) ne
 * provoque aucune écriture — donc aucun re-render.
 */
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

      const rebuiltPages: typeof old.pages = [];
      let cursor = 0;
      for (let i = 0; i < old.pages.length; i++) {
        const originalPage = old.pages[i];
        const originalLength = originalPage.conversations.length;
        const slice = updated.slice(cursor, cursor + originalLength);
        rebuiltPages.push({
          conversations: slice,
          pagination: {
            // Garder les métadonnées de pagination d'origine pour que
            // `getNextPageParam` continue de voir des offsets/limites justes.
            ...originalPage.pagination,
            // `total` est le seul champ qui mérite d'être rafraîchi — le compte
            // global grandit quand une conversation neuve est ajoutée en tête.
            total: i === old.pages.length - 1 ? updated.length : originalPage.pagination.total,
          },
        });
        cursor += originalLength;
      }
      // Queue : ce que l'updater a ajouté au-delà de la longueur d'origine (une
      // conversation neuve). Ajouté comme page supplémentaire pour ne rien perdre.
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
