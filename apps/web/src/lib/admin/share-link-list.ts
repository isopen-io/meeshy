import { defineListSpec, type ListState } from './list-state';

/**
 * **LA LISTE DES LIENS DE PARTAGE** (#8876, #6729) — ce que l'écran sait filtrer,
 * donc ce que l'adresse peut porter : l'ouverture du lien (`isActive`), la
 * recherche par NOM, la page.
 *
 * - **Pas de tri** : la route range toujours par création décroissante et n'a aucun
 *   paramètre de tri. La clé est unique (`createdAt`), aucune colonne n'est
 *   triable — une flèche de tri sans effet serait un contrôle mort.
 * - **La recherche ne porte que sur le nom** : jamais sur le secret de jointure
 *   (#4693) — on retrouve un lien par son nom ou par la conversation qu'il ouvre.
 * - `isActive` dit seulement « fermé à la main ou non » : un lien ouvert peut être
 *   expiré ou avoir atteint son quota, ce que la colonne d'état nomme ligne à ligne.
 */
export const SHARE_LINK_OPENNESS = ['true', 'false'] as const;

export const SHARE_LINK_LIST_SPEC = defineListSpec({
  sortKeys: ['createdAt'],
  defaultSort: 'createdAt',
  ascendingFirst: [],
  filters: { isActive: SHARE_LINK_OPENNESS },
  pageSizes: [20, 50, 100],
});

export type ShareLinkSortKey = (typeof SHARE_LINK_LIST_SPEC.sortKeys)[number];
export type ShareLinkFilterKey = keyof typeof SHARE_LINK_LIST_SPEC.filters;
export type ShareLinkListState = ListState<ShareLinkSortKey, ShareLinkFilterKey>;

/** La requête envoyée à la passerelle : la page, la recherche (nom), l'ouverture — rien d'autre n'est lu par la route. */
export function shareLinkListQuery(state: ShareLinkListState): URLSearchParams {
  const query = new URLSearchParams({ offset: String(state.offset), limit: String(state.limit) });
  if (state.q !== '') query.set('search', state.q);
  const isActive = state.filters.isActive;
  if (isActive !== undefined) query.set('isActive', isActive);
  return query;
}
