import { defineListSpec, type ListState } from './list-state';

/**
 * **LES LISTES DE COMMUNAUTÉS** (#8876) — ce que la passerelle admet.
 *
 * - La LISTE (`GET /admin/communities`) : tri `createdAt` (les plus récentes
 *   d'abord) ou `name` (de A à Z), la visibilité (`isPrivate`), l'état
 *   (`isActive` — une communauté désactivée est retirée de tous les lecteurs
 *   publics), une recherche (nom, identifiant public, description).
 * - Les MEMBRES d'une fiche (`GET /admin/communities/:id/members`) : recherche
 *   (pseudo ou nom affiché), rôle, activité — rangés du plus récent au plus
 *   ancien, sans tri : `ListSpec` veut une clé, `joinedAt` est déclarée comme le
 *   défaut et aucune colonne ne la rend triable.
 */
export const COMMUNITY_ROLES = ['admin', 'moderator', 'member'] as const;

export const COMMUNITY_LIST_SPEC = defineListSpec({
  sortKeys: ['createdAt', 'name'],
  defaultSort: 'createdAt',
  ascendingFirst: ['name'],
  filters: { isPrivate: ['true', 'false'], isActive: ['true', 'false'] },
  pageSizes: [20, 50, 100],
});

export type CommunityListState = ListState<(typeof COMMUNITY_LIST_SPEC.sortKeys)[number], keyof typeof COMMUNITY_LIST_SPEC.filters>;

export const COMMUNITY_MEMBERS_SPEC = defineListSpec({
  sortKeys: ['joinedAt'],
  defaultSort: 'joinedAt',
  ascendingFirst: [],
  filters: { role: COMMUNITY_ROLES, isActive: ['true', 'false'] },
  pageSizes: [20, 50, 100],
});

export type CommunityMembersState = ListState<(typeof COMMUNITY_MEMBERS_SPEC.sortKeys)[number], keyof typeof COMMUNITY_MEMBERS_SPEC.filters>;
