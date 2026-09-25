import { defineListSpec } from './list-state';

/**
 * LA LISTE DES ANONYMES (#7873) — les clés de tri que `GET
 * /admin/anonymous-users` admet (`joinedAt`, `lastActiveAt`, `displayName`),
 * et son filtre d'état.
 */
export const ANONYMOUS_LIST_SPEC = defineListSpec({
  sortKeys: ['joinedAt', 'lastActiveAt', 'displayName'],
  defaultSort: 'joinedAt',
  ascendingFirst: ['displayName'],
  filters: { status: ['active', 'inactive'] },
  pageSizes: [20, 50, 100],
});
