import type { BlockedPage, BlockedData } from './blocks';
import type { FriendRequestsDeps } from './friend-requests';
import { BLOCKED_USERS_QUERY_KEY, FRIENDS_STALE_TIME } from './friends-keys';

/**
 * LE PANIER DES BLOQUÉS, LU PAR LA LISTE DES CONVERSATIONS (#10593) — la MÊME
 * entrée de cache que « Découvrir » (`blockedUsersQueryOptions`,
 * `blocks.ts`) et que le geste de blocage écrit (`performBlock`) : la ligne
 * d'un direct dit « Débloquer » à l'instant du geste.
 *
 * Le port, lui, se charge À LA DEMANDE : `blocks.ts` emporte `zod` et les
 * décodeurs de l'annuaire, que la première peinture de la liste n'a pas à
 * télécharger. La clé et la fraîcheur viennent de `friends-keys.ts`, sans
 * dépendance.
 */
type PageContext = { readonly pageParam: string | null; readonly signal?: AbortSignal };

export function lazyBlockedUsersQueryOptions(deps: FriendRequestsDeps) {
  return {
    queryKey: BLOCKED_USERS_QUERY_KEY,
    staleTime: FRIENDS_STALE_TIME,
    initialPageParam: null as string | null,
    queryFn: async (context: PageContext): Promise<BlockedPage> => (await import('./blocks')).blockedUsersQueryOptions(deps).queryFn(context),
    getNextPageParam: (page: BlockedPage) => page.nextCursor ?? undefined,
  };
}

/** Les identifiants servis — `undefined` tant que le panier n'est pas lu. */
export const blockedIdsOf = (data: BlockedData | undefined): ReadonlySet<string> | undefined =>
  data === undefined ? undefined : new Set(data.pages.flatMap((page) => page.users.map((person) => person.id)));
