import { useCallback, useSyncExternalStore } from 'react';
import { notifyManager, type QueryClient } from '@tanstack/react-query';

import { ownSetting, readCommentsClosed } from '@/lib/api/comment-settings';
import { appQueryClient } from '@/lib/api/query-client';

/**
 * **LES COMMENTAIRES DE CETTE PUBLICATION SONT-ILS FERMÉS — EN DIRECT**
 * (#16541). La réponse vit dans les caisses (une seule source : ce que la
 * passerelle a servi, l'optimiste d'un réglage, une diffusion `post:updated`)
 * ; ces crochets la relisent à chaque écriture. Le fil monté pour une
 * publication dont l'auteur vient de fermer les commentaires perd sa barre
 * sans rechargement, et la retrouve s'il les rouvre.
 */
function useCachedVerdict(queryClient: QueryClient, read: () => boolean): boolean {
  /* `batchCalls`, comme `useQuery` : une requête CRÉÉE pendant le rendu d'un
     autre composant notifie le cache sur-le-champ, et relire là serait mettre
     à jour ce fil pendant le rendu d'un voisin. */
  const subscribe = useCallback((notify: () => void) => queryClient.getQueryCache().subscribe(notifyManager.batchCalls(notify)), [queryClient]);
  return useSyncExternalStore(subscribe, read, read);
}

/** Fermés pour l'écriture — par la publication ou par l'original qu'elle republie. */
export function useCommentsClosed(postId: string, queryClient: QueryClient = appQueryClient): boolean {
  return useCachedVerdict(queryClient, useCallback(() => readCommentsClosed(queryClient, postId), [queryClient, postId]));
}

/** Le réglage PROPRE de la publication — ce que « Désactiver / Réactiver les commentaires » bascule. */
export function useOwnCommentsDisabled(postId: string | undefined, queryClient: QueryClient = appQueryClient): boolean {
  return useCachedVerdict(queryClient, useCallback(() => postId !== undefined && ownSetting(queryClient, postId), [queryClient, postId]));
}
