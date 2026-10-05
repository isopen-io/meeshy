import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import type { CommunityListState } from '@/lib/admin/community-list';

import { asCount, asRecord, asText, type AdminDeps } from './admin';
import { adminPageOf, type AdminPage } from './admin-page';
import { decodeAdminPersonRef, type AdminPersonRef } from './admin-posts';
import type { ApiResult } from './http';

/**
 * **LES COMMUNAUTÉS VUES PAR L'ADMINISTRATION** (#8876) — `GET admin.communities`,
 * la liste. La pagination est À CÔTÉ de `data` : `adminPageOf(…, { kind: 'top' })`.
 *
 * Gardée par `canManageGroups` (la clé servie qui recouvre `canManageCommunities`).
 *
 * **Les deux chiffres sont ceux que la passerelle sert pour l'administration** :
 * `activeMemberCount` (les membres encore là) et `conversationCount`. La ligne
 * porte aussi `_count.members`, qui compte les DÉPARTS — elle n'est jamais lue :
 * un décodeur qui s'en servirait afficherait des membres qui sont partis.
 *
 * Champ par champ, sans étalement ; ni la description ni la bannière ne sont
 * gardées (la liste ne les montre pas — la fiche, oui). Clés sous
 * `['admin', 'community', …]` : jamais persistées sur le disque.
 */
export type AdminCommunityRow = {
  readonly id: string;
  /** L'identifiant public lisible (« mshy_club-jazz ») : le SECONDAIRE du nom, jamais un ObjectId. */
  readonly identifier: string;
  readonly name: string;
  readonly avatar: string | null;
  readonly isPrivate: boolean;
  readonly isActive: boolean;
  readonly deletedAt: string | null;
  readonly createdAt: string | null;
  readonly creator: AdminPersonRef | null;
  readonly activeMemberCount: number;
  readonly conversationCount: number;
};

const textOrNull = (value: unknown): string | null => {
  const text = asText(value).trim();
  return text === '' ? null : text;
};

export function decodeAdminCommunityRow(raw: unknown): AdminCommunityRow | null {
  const community = asRecord(raw);
  if (community === null || typeof community.id !== 'string' || community.id === '') return null;
  return {
    id: community.id,
    identifier: asText(community.identifier),
    name: asText(community.name),
    avatar: textOrNull(community.avatar),
    /* Une communauté est PRIVÉE par défaut (le schéma) : seul `false` explicite la dit publique. */
    isPrivate: community.isPrivate !== false,
    /* Et ACTIVE par défaut : seul `false` explicite la dit désactivée. */
    isActive: community.isActive !== false,
    deletedAt: textOrNull(community.deletedAt),
    createdAt: textOrNull(community.createdAt),
    creator: decodeAdminPersonRef(community.creator),
    activeMemberCount: asCount(community.activeMemberCount),
    conversationCount: asCount(community.conversationCount),
  };
}

export const adminCommunitiesQueryKey = (address: string) => ['admin', 'community', 'list', address] as const;

/** `sort` et `order` : les noms de la ROUTE (les comptes disent `sortBy` / `sortOrder`). */
function listQuery(state: CommunityListState): string {
  return new URLSearchParams({
    offset: String(state.offset),
    limit: String(state.limit),
    ...(state.q === '' ? {} : { search: state.q }),
    sort: state.sort,
    order: state.order,
    ...state.filters,
  }).toString();
}

export async function loadAdminCommunities(
  params: AdminDeps & { readonly state: CommunityListState; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminPage<AdminCommunityRow>>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.communities}?${listQuery(params.state)}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  return adminPageOf(result, decodeAdminCommunityRow, { kind: 'top' });
}
