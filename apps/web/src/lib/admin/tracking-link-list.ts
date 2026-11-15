import { defineListSpec, type ListState } from './list-state';

/**
 * **LA LISTE DES LIENS DE SUIVI** (#8876, #6729) — ce que la passerelle sait
 * trier et filtrer, donc ce que l'adresse peut porter.
 *
 * - Tri : les quatre clés de `SORT_KEYS` côté passerelle (`createdAt`,
 *   `totalClicks`, `uniqueClicks`, `lastClickedAt`) — toutes numériques ou
 *   datées, donc d'abord le plus grand / le plus récent.
 * - Filtres : `isActive` (un lien désactivé à la main ; un lien EXPIRÉ reste
 *   « actif » pour ce filtre, ce que la colonne d'état nomme ligne à ligne) et
 *   `targetType` (les sept genres de cible).
 * - `createdBy` : « tous les liens créés par CE membre » — un filtre par
 *   IDENTIFIANT, qui n'entre que s'il a la forme d'un ObjectId.
 * - La recherche porte sur le nom, le jeton, l'adresse et la campagne.
 */
export const TRACKING_ACTIVITY = ['true', 'false'] as const;
export const TRACKING_TARGET_TYPES = ['POST', 'REEL', 'STORY', 'STATUS', 'CONVERSATION', 'PROFILE', 'EXTERNAL'] as const;

export const TRACKING_LINK_LIST_SPEC = defineListSpec({
  sortKeys: ['createdAt', 'totalClicks', 'uniqueClicks', 'lastClickedAt'],
  defaultSort: 'createdAt',
  ascendingFirst: [],
  filters: { isActive: TRACKING_ACTIVITY, targetType: TRACKING_TARGET_TYPES },
  idFilters: ['createdBy'],
  pageSizes: [20, 50, 100],
});

export type TrackingSortKey = (typeof TRACKING_LINK_LIST_SPEC.sortKeys)[number];
export type TrackingFilterKey = keyof typeof TRACKING_LINK_LIST_SPEC.filters;
export type TrackingIdFilterKey = 'createdBy';
export type TrackingListState = ListState<TrackingSortKey, TrackingFilterKey, TrackingIdFilterKey>;

/** La requête envoyée à la passerelle : la page, le tri (`sort` / `order`, pas `sortBy`), la recherche, les filtres. */
export function trackingLinkListQuery(state: TrackingListState): URLSearchParams {
  const query = new URLSearchParams({
    offset: String(state.offset),
    limit: String(state.limit),
    sort: state.sort,
    order: state.order,
  });
  if (state.q !== '') query.set('search', state.q);
  const isActive = state.filters.isActive;
  if (isActive !== undefined) query.set('isActive', isActive);
  const targetType = state.filters.targetType;
  if (targetType !== undefined) query.set('targetType', targetType);
  const createdBy = state.ids.createdBy;
  if (createdBy !== undefined) query.set('createdBy', createdBy);
  return query;
}
