import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { conversationsService } from '@/services/conversations.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import { useConversationsDeltaSync } from './use-conversations-delta-sync';

export function useConversationQuery(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.conversations.detail(conversationId ?? ''),
    queryFn: () => conversationsService.getConversation(conversationId!),
    // staleTime: Infinity (défini globalement dans QueryClient)
    enabled: !!conversationId,
  });
}

interface UseInfiniteConversationsOptions {
  limit?: number;
  enabled?: boolean;
}

export function useInfiniteConversationsQuery(options: UseInfiniteConversationsOptions = {}) {
  const { limit = 20, enabled = true } = options;

  // Rattrapage après une coupure SOCKET — que `refetchOnMount` (montage) et
  // `refetchOnReconnect` (réseau navigateur) laissent tous deux découverte.
  // Monté ICI, sur le propriétaire du cache `conversations.infinite()`, pour
  // qu'aucun consommateur ne puisse l'oublier ; le garde par QueryClient fait
  // que plusieurs consommateurs montés ensemble ne tirent qu'une fois.
  useConversationsDeltaSync(enabled);

  return useInfiniteQuery({
    queryKey: queryKeys.conversations.infinite(),
    queryFn: ({ pageParam = 0 }) =>
      conversationsService.getConversations({
        limit,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage.pagination.hasMore) return undefined;
      return lastPage.pagination.offset + lastPage.pagination.limit;
    },
    // Dédup par `id` à la SÉLECTION (E10 — LWS-9) : la pagination OFFSET sur un
    // tri serveur `lastMessageAt` décroissant duplique une conversation en
    // frontière de page quand un message arrive entre le fetch de deux pages
    // (elle remonte en tête de la page suivante alors qu'elle était déjà dans
    // la précédente). `select` ne touche PAS le cache brut — `old.pages` reste
    // intact pour les écritures socket (`use-socket-cache-sync.ts`,
    // `use-conversations-delta-sync.ts`) — il ne filtre que la vue lue par les
    // consommateurs (`useConversationsPaginationRQ`, `use-conversations-v2.ts`).
    // On garde la PREMIÈRE occurrence rencontrée (page la plus ancienne =
    // rang le plus haut au tri desc) : jamais `translations.first`-style
    // dernier-gagne, qui afficherait la ligne à sa frontière la plus basse.
    select: (data) => {
      const seenIds = new Set<string>();
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          conversations: page.conversations.filter((conversation) => {
            if (seenIds.has(conversation.id)) return false;
            seenIds.add(conversation.id);
            return true;
          }),
        })),
      };
    },
    enabled,
    // Le client global tourne en `staleTime: Infinity` + `refetchOnMount: false`
    // et cette liste est PERSISTÉE en IndexedDB (24 h). Le socket ne pousse
    // rien app fermée : au démarrage à froid, badges et aperçus restaient un
    // instantané d'il y a 24 h. Même correctif que la liste de notifications
    // (use-notifications-query.ts) : monter la sidebar relit toujours le serveur.
    refetchOnMount: 'always',
    // Dérogation au `refetchOnWindowFocus: 'always'` global, jumelle de celle de
    // `use-conversation-messages-rq.ts`. Sur une `useInfiniteQuery`, ce refetch
    // rejoue TOUTES les pages chargées et REMPLACE le cache : dix pages de
    // scroll = dix requêtes sur une route lourde à chaque retour d'onglet, les
    // écritures socket concurrentes écrasées, et — parce que la route pagine par
    // OFFSET sur un tri `lastMessageAt` décroissant — une ligne dupliquée à la
    // frontière dès qu'un message arrive entre deux pages.
    // Le focus reste servi, par le delta borné de `useConversationsDeltaSync`
    // (Trigger 2), qui porte aussi la relecture complète 1×/24 h dont ce refetch
    // était jusqu'ici le seul substitut.
    refetchOnWindowFocus: false,
    // Jumelle de la dérogation ci-dessus, sur l'AUTRE déclencheur global
    // (`refetchOnReconnect: 'always'`). Elle avait été omise : le refetch
    // destructeur décrit juste au-dessus restait donc armé sur un déclencheur
    // bien plus ordinaire qu'un retour d'onglet — toute transition réseau du
    // NAVIGATEUR (sortie de tunnel, bascule Wi-Fi/4G, réveil de machine).
    // `useConversationsDeltaSync` (Trigger 1) couvre STRICTEMENT plus : il part
    // du front `false → true` de la socket, donc aussi des coupures que
    // `navigator.onLine` ne voit pas (redémarrage gateway, drop de load
    // balancer, échec d'upgrade de transport).
    refetchOnReconnect: false,
  });
}
