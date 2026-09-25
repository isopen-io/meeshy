import { defineListSpec } from './list-state';

/**
 * LA LISTE DES CONVERSATIONS (#7873) — les deux tris que la passerelle admet
 * (`TRIS`, `conversations-sovereign.ts` : `memberCount` y est une colonne
 * morte, refusée au schéma), son ordre, et ses deux filtres.
 */
export const CONVERSATION_TYPES = ['direct', 'group', 'public', 'global', 'broadcast'] as const;

export const CONVERSATION_LIST_SPEC = defineListSpec({
  sortKeys: ['lastMessageAt', 'createdAt'],
  defaultSort: 'lastMessageAt',
  ascendingFirst: [],
  filters: { type: CONVERSATION_TYPES, isActive: ['true', 'false'] },
  pageSizes: [20, 50, 100],
});
