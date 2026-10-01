import { defineListSpec, type ListState } from './list-state';

/**
 * **LA LISTE DES PUBLICATIONS** (#8876) — ce que `GET /admin/posts` admet, ni
 * plus ni moins (`routes/admin/posts.ts`, `querystring`) :
 *
 * - cinq filtres à valeurs FERMÉES : le type, la visibilité, le retrait
 *   (`isDeleted` — la passerelle montre les publications en ligne tant qu'on ne
 *   demande pas les retirées), l'épinglage, la période ;
 * - un filtre par IDENTIFIANT : l'auteur (`?authorId=` depuis la fiche d'une
 *   publication ou d'un membre) ;
 * - une recherche dans le texte.
 *
 * **Aucun tri** : la passerelle range toujours de la plus récente à la plus
 * ancienne. `ListSpec` exige une clé de tri ; `createdAt` est donc déclarée
 * comme DÉFAUT, et aucune colonne ne la rend triable — une colonne triable que
 * la passerelle ne trie pas serait un contrôle sans effet (loi 4).
 */
export const POST_TYPES = ['POST', 'STORY', 'REEL', 'STATUS'] as const;
export const POST_VISIBILITIES = ['PUBLIC', 'FRIENDS', 'COMMUNITY', 'PRIVATE', 'EXCEPT', 'ONLY'] as const;
export const POST_PERIODS = ['today', 'week', 'month'] as const;

export const POST_LIST_SPEC = defineListSpec({
  sortKeys: ['createdAt'],
  defaultSort: 'createdAt',
  ascendingFirst: [],
  filters: {
    type: POST_TYPES,
    visibility: POST_VISIBILITIES,
    isDeleted: ['true', 'false'],
    isPinned: ['true', 'false'],
    period: POST_PERIODS,
  },
  idFilters: ['authorId'],
  pageSizes: [20, 50, 100],
});

export type PostListState = ListState<(typeof POST_LIST_SPEC.sortKeys)[number], keyof typeof POST_LIST_SPEC.filters, 'authorId'>;

export type PostPeriod = (typeof POST_PERIODS)[number];

/** La période d'une liste : celle de l'adresse (déjà passée par la liste blanche), ou « depuis le début ». */
export const periodOf = (value: string | undefined): PostPeriod | 'all' => POST_PERIODS.find((period) => period === value) ?? 'all';

/** Les onglets de type : « Toutes » (aucun filtre), puis un onglet par type de publication. */
export const POST_TABS = ['all', ...POST_TYPES] as const;

export type PostTab = (typeof POST_TABS)[number];

/** L'onglet actif d'une liste : le type filtré, ou « Toutes » sans filtre. */
export const postTabOf = (filters: { readonly type?: string }): PostTab => POST_TYPES.find((type) => type === filters.type) ?? 'all';

/** Le filtre de type d'un onglet : `null` pour « Toutes » — l'onglet RETIRE le filtre. */
export const postTypeOfTab = (tab: PostTab): string | null => (tab === 'all' ? null : tab);
