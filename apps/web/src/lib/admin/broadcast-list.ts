import { defineListSpec, type ListState } from './list-state';

/**
 * **LA LISTE DES DIFFUSIONS** (#8876, #6731) — ce que l'écran sait filtrer, donc
 * ce que l'adresse peut porter.
 *
 * `GET /admin/broadcasts` lit `status` et `search` (nom et objet, jamais le
 * corps) et range TOUJOURS par création décroissante : **aucun tri n'est
 * offert** — une colonne triable qui ne changerait rien serait un contrôle sans
 * effet (loi 4). La spécification garde malgré tout une clé de tri, `createdAt`,
 * parce que `defineListSpec` en exige une : elle n'est ni dessinée ni envoyée.
 */
export const BROADCAST_STATUSES = ['DRAFT', 'TRANSLATING', 'READY', 'SENDING', 'SENT', 'FAILED'] as const;

export const BROADCAST_LIST_SPEC = defineListSpec({
  sortKeys: ['createdAt'],
  defaultSort: 'createdAt',
  ascendingFirst: [],
  filters: { status: BROADCAST_STATUSES },
  pageSizes: [20, 50, 100],
});

export type BroadcastSortKey = (typeof BROADCAST_LIST_SPEC.sortKeys)[number];
export type BroadcastFilterKey = keyof typeof BROADCAST_LIST_SPEC.filters;
export type BroadcastListState = ListState<BroadcastSortKey, BroadcastFilterKey>;

/** `BroadcastsListQuerySchema` borne la recherche à 100 caractères : au-delà, la passerelle refuse la requête entière. */
const SEARCH_MAX = 100;

export function broadcastListQuery(state: BroadcastListState): URLSearchParams {
  const query = new URLSearchParams({ offset: String(state.offset), limit: String(state.limit) });
  const status = state.filters.status;
  if (status !== undefined) query.set('status', status);
  const search = Array.from(state.q.trim()).slice(0, SEARCH_MAX).join('');
  if (search !== '') query.set('search', search);
  return query;
}
