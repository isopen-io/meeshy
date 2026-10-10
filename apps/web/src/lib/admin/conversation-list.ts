import { defineListSpec, type ListState } from './list-state';
import { ADMIN_PERIODS, isAdminPeriod, periodStart } from './period';

/**
 * **LA LISTE DES CONVERSATIONS** (#7873, #8876) — ce que la passerelle sait
 * trier et filtrer, donc ce que l'adresse peut porter.
 *
 * - **tri** : les deux que `GET /admin/conversations` admet (`TRIS`,
 *   `conversations-sovereign.ts`). `memberCount` n'en est pas un : la colonne
 *   est morte, le compte servi est recalculé après la requête ;
 * - **filtres** : le type, l'activité (`isActive`, qui se lit « active » /
 *   « archivée »), et la PÉRIODE de création (`createdAfter`, posée par
 *   {@link conversationListQuery} sur l'horloge qu'on lui donne) ;
 * - **`communityId`** : « les conversations de CETTE communauté », un filtre par
 *   identifiant (une fiche communauté y mène) — accepté seulement s'il a la
 *   forme d'un ObjectId ;
 * - **recherche** : le titre OU l'identifiant public, jamais le contenu.
 */
export const CONVERSATION_TYPES = ['direct', 'group', 'public', 'global', 'broadcast'] as const;

export const CONVERSATION_LIST_SPEC = defineListSpec({
  sortKeys: ['lastMessageAt', 'createdAt'],
  defaultSort: 'lastMessageAt',
  ascendingFirst: [],
  filters: { type: CONVERSATION_TYPES, isActive: ['true', 'false'], period: ADMIN_PERIODS },
  idFilters: ['communityId'],
  pageSizes: [20, 50, 100],
});

export type ConversationSortKey = (typeof CONVERSATION_LIST_SPEC.sortKeys)[number];
export type ConversationFilterKey = keyof typeof CONVERSATION_LIST_SPEC.filters;
export type ConversationIdFilterKey = 'communityId';
export type ConversationListState = ListState<ConversationSortKey, ConversationFilterKey, ConversationIdFilterKey>;

const FORWARDED_FILTERS = ['type', 'isActive'] as const satisfies readonly ConversationFilterKey[];

/**
 * La requête envoyée à la passerelle. `now` est INJECTÉ : la période
 * (`createdAfter`) se calcule sur l'horloge qu'on lui donne, jamais sur celle du
 * module — un témoin doit pouvoir la fixer. Un filtre ou une recherche VIDE n'est
 * pas un filtre : il ne part pas.
 */
export function conversationListQuery(state: ConversationListState, now: Date): URLSearchParams {
  const query = new URLSearchParams({
    offset: String(state.offset),
    limit: String(state.limit),
    sort: state.sort,
    order: state.order,
  });
  if (state.q !== '') query.set('search', state.q);
  FORWARDED_FILTERS.forEach((key) => {
    const value = state.filters[key];
    if (value !== undefined && value !== '') query.set(key, value);
  });
  const period = state.filters.period;
  if (period !== undefined && isAdminPeriod(period)) query.set('createdAfter', periodStart(period, now));
  const community = state.ids.communityId;
  if (community !== undefined) query.set('communityId', community);
  return query;
}
