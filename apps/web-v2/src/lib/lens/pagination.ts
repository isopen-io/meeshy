/**
 * L'ÉTAT DE PAGINATION DE LA LENTILLE (#6195) — somme à QUATRE cas, miroir de
 * `PaginationState` (`LoadState.swift:36-41`) : `idle` (sentinelle invisible,
 * prête à charger), `loading-more` (spinner — ici `TypingDots`), `exhausted`
 * (« tout chargé », au-delà de 30) et `error` (caption + Réessayer). DÉRIVÉE
 * des drapeaux de `useInfiniteQuery`, jamais tenue à part : un second état
 * divergerait du SEUL que TanStack sait faire avancer.
 */
export type ListPaginationState = 'idle' | 'loading-more' | 'exhausted' | 'error';

export type PaginationFlags = {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly isFetchNextPageError: boolean;
};

/** `isFetchingNextPage` PRIME sur l'erreur (une page en vol peut suivre un
 * `onRetry`) ; l'erreur PRIME sur `exhausted` — un défilement raté rend
 * TOUJOURS « Réessayer », jamais silencieusement « tout chargé » (iOS
 * `:1926-1927` : `hasMore` reste vrai après un échec). */
export function paginationStateOf(flags: PaginationFlags): ListPaginationState {
  if (flags.isFetchingNextPage) return 'loading-more';
  if (flags.isFetchNextPageError) return 'error';
  return flags.hasNextPage ? 'idle' : 'exhausted';
}

/** « Toutes les conversations sont chargées » — seulement au-delà de 30
 * (`ConversationListView+Rows.swift:557` : « avoids cluttering empty/small
 * lists »). `count > pageSize`, jamais `>=` : une page 1 exactement pleine
 * n'affiche RIEN tant qu'une seconde page n'a pas confirmé qu'il y a plus. */
export function showsAllLoadedHint(count: number, pageSize: number): boolean {
  return count > pageSize;
}

/** 5 rangs avant la queue — iOS `triggerLoadMoreIfNeeded`
 * (`ConversationListView.swift:1045-1060`, `threshold = count - 5`). */
export const LOAD_MORE_LEAD_ROWS = 5;

/** `rootMargin` bas d'un `IntersectionObserver` posé sur `#contenu` — même
 * distance que le seuil iOS, exprimée en pixels plutôt qu'en rangs. */
export function loadMoreRootMargin(rowHeight: number): string {
  return `0px 0px ${rowHeight * LOAD_MORE_LEAD_ROWS}px 0px`;
}
