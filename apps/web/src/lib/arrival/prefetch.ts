import type { QueryClient } from '@tanstack/react-query';

import { conversationsInfiniteOptions, type ConversationsDeps } from '@/lib/api/conversations';
import { feedInfiniteOptions } from '@/lib/api/feed';
import { friendRequestsQueryOptions } from '@/lib/api/friend-requests';
import { storyTrayQueryOptions } from '@/lib/api/stories';

/**
 * LE PRÉCHARGEMENT DE L'ARRIVÉE (#8088) — les premières données RÉELLES
 * partent EN PARALLÈLE pendant la célébration, par les MÊMES fabriques et
 * sous les MÊMES clés que les écrans qui les lisent :
 *  - la liste des conversations (`useConversations`) et son plateau de
 *    stories (`useStoryTray`) — l'écran d'arrivée se peint depuis le cache ;
 *  - les contacts (amis acceptés, `friendRequestsQueryOptions('accepted')`,
 *    lus par Découvrir et « Nouvelle conversation ») ;
 *  - la première page du fil (`useFeed`).
 *
 * `prefetch*Query` n'échoue jamais : une lecture en panne laisse sa clé
 * vide, l'écran concerné la relira à son ouverture.
 */
export function prefetchArrival(queryClient: QueryClient, deps: ConversationsDeps): Promise<void> {
  return Promise.all([
    queryClient.prefetchInfiniteQuery(conversationsInfiniteOptions(deps)),
    queryClient.prefetchQuery({ ...storyTrayQueryOptions(deps), staleTime: 60_000 }),
    queryClient.prefetchInfiniteQuery(friendRequestsQueryOptions(deps, 'accepted')),
    queryClient.prefetchInfiniteQuery(feedInfiniteOptions(deps)),
  ]).then(() => undefined);
}
