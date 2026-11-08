import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import * as communitiesEndpoints from '@meeshy/shared/api/endpoints/communities';

import {
  COMMUNITIES_QUERY_PREFIX,
  communityConversationsQueryKey,
  decodeCommunity,
  type CommunitiesDeps,
  type CommunityPage,
  type CommunitySummary,
} from './communities';
import type { CommunityActionDeps } from './community-actions';
import type { ApiResult } from './http';

/**
 * **RÉGLER SA COMMUNAUTÉ** (#6377) — miroir `CommunitySettingsViewModel.save`
 * et `deleteCommunity` (iOS) : `PUT communities.byId` des SEULS champs changés,
 * `DELETE communities.byId`, tous deux réservés au créateur par la passerelle
 * (`services/gateway/src/routes/communities/settings.ts` : 403
 * `COMMUNITY_CREATOR_ONLY`, 404 sur une communauté désactivée).
 *
 * **Optimiste, comme le veut le web** : le nom, la description et la
 * confidentialité se peignent AU GESTE dans chaque détail en cache (adressé par
 * id ou par identifiant) et dans chaque liste ; une réponse qui refuse rend
 * EXACTEMENT ce qui était en cache. La réponse du `PUT` ne sert pas
 * `currentUserRole` : le rôle déjà lu reste celui du cache.
 *
 * **Supprimer** retire la communauté de chaque liste et de chaque détail ; un
 * 404 est l'état visé (déjà supprimée ailleurs), un refus la rend à sa place.
 *
 * Ce que ce port ne porte pas encore : l'avatar et la bannière (seconde moitié
 * de #6377, motif du profil). L'emoji et la couleur d'iOS ne quittent pas
 * l'appareil (`UserDefaults`) : aucun champ serveur ne les porte.
 */

export type CommunitySettingsDraft = { readonly name: string; readonly description: string; readonly isPrivate: boolean };
export type CommunitySettingsField = 'name' | 'description';
export type CommunitySettingsBody = { readonly name?: string; readonly description?: string; readonly isPrivate?: boolean };

export type SettingsChanges =
  | { readonly ok: true; readonly body: CommunitySettingsBody | null }
  | { readonly ok: false; readonly field: CommunitySettingsField };

export type UpdateSettingsOutcome =
  | { readonly status: 'saved' | 'unchanged' | 'refused' | 'gone' | 'offline' | 'error' }
  | { readonly status: 'invalid'; readonly field: CommunitySettingsField };

export type DeleteCommunityOutcome = { readonly status: 'deleted' | 'refused' | 'offline' | 'error' };

const NAME_MAX = 100;
const DESCRIPTION_MAX = 500;

/** Le créateur seul règle sa communauté — la règle de `PUT` / `DELETE communities.byId`. */
export function canEditSettingsOf(community: CommunitySummary, viewerId: string | null): boolean {
  return viewerId !== null && community.createdBy !== null && community.createdBy === viewerId;
}

export function settingsDraftOf(community: CommunitySummary): CommunitySettingsDraft {
  return { name: community.name, description: community.description ?? '', isPrivate: community.isPrivate };
}

export function settingsChangesOf(community: CommunitySummary, draft: CommunitySettingsDraft): SettingsChanges {
  const name = draft.name.trim();
  const description = draft.description.trim();
  if (name === '' || name.length > NAME_MAX) return { ok: false, field: 'name' };
  if (description.length > DESCRIPTION_MAX) return { ok: false, field: 'description' };
  const body: CommunitySettingsBody = {
    ...(name === community.name ? {} : { name }),
    ...(description === (community.description ?? '') ? {} : { description }),
    ...(draft.isPrivate === community.isPrivate ? {} : { isPrivate: draft.isPrivate }),
  };
  return { ok: true, body: Object.keys(body).length === 0 ? null : body };
}

export async function updateCommunity(deps: CommunitiesDeps, communityId: string, body: CommunitySettingsBody): Promise<ApiResult<CommunitySummary | null>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureUpdateCommunity } = await import('./fixtures-communities');
    return fixtureUpdateCommunity(communityId, body);
  }
  const result = await deps.transport.request<unknown>({ method: 'PUT', path: communitiesEndpoints.byId(communityId), body });
  return result.ok ? { ok: true, data: decodeCommunity(result.data) } : result;
}

export async function deleteCommunity(deps: CommunitiesDeps, communityId: string): Promise<ApiResult<null>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureDeleteCommunity } = await import('./fixtures-communities');
    return fixtureDeleteCommunity(communityId);
  }
  const result = await deps.transport.request<unknown>({ method: 'DELETE', path: communitiesEndpoints.byId(communityId) });
  return result.ok ? { ok: true, data: null } : result;
}

type CacheEntry = readonly [readonly unknown[], unknown];
type Lists = InfiniteData<CommunityPage, number>;

const DETAIL_PREFIX = [...COMMUNITIES_QUERY_PREFIX, 'detail'] as const;
const LIST_PREFIX = [...COMMUNITIES_QUERY_PREFIX, 'list'] as const;

const isCommunitySummary = (value: unknown): value is CommunitySummary =>
  typeof value === 'object' && value !== null && 'id' in value && 'memberCount' in value;

/**
 * Ce qu'un refus rend : les SEULES entrées de cette communauté — sa fiche (par
 * id et par identifiant) et sa ligne dans chaque liste, à sa place. Une liste
 * relue ou une autre communauté rejointe pendant l'aller-retour ne recule pas.
 */
type ListSlot = { readonly key: readonly unknown[]; readonly page: number; readonly index: number; readonly row: CommunitySummary };
type Snapshot = { readonly details: readonly CacheEntry[]; readonly slots: readonly ListSlot[] };

const snapshotOf = (queryClient: QueryClient, communityId: string): Snapshot => ({
  details: queryClient.getQueriesData({ queryKey: DETAIL_PREFIX }).filter(([, data]) => isCommunitySummary(data) && data.id === communityId),
  slots: queryClient.getQueriesData<Lists>({ queryKey: LIST_PREFIX }).flatMap(([key, data]) =>
    (data?.pages ?? []).flatMap((page, pageIndex) =>
      page.communities.flatMap((row, index) => (row.id === communityId ? [{ key, page: pageIndex, index, row }] : [])),
    ),
  ),
});

const restore = (queryClient: QueryClient, snapshot: Snapshot) => {
  snapshot.details.forEach(([key, data]) => queryClient.setQueryData(key, data));
  snapshot.slots.forEach(({ key, page, index, row }) => {
    const current = queryClient.getQueryData<Lists>(key);
    if (current === undefined || current.pages[page] === undefined) return;
    queryClient.setQueryData<Lists>(key, {
      ...current,
      pages: current.pages.map((each, pageIndex) => {
        if (pageIndex !== page) return each;
        const others = each.communities.filter((other) => other.id !== row.id);
        return { ...each, communities: [...others.slice(0, index), row, ...others.slice(index)] };
      }),
    });
  });
};

const patchEverywhere = (queryClient: QueryClient, communityId: string, patch: (community: CommunitySummary) => CommunitySummary) => {
  queryClient.getQueriesData({ queryKey: DETAIL_PREFIX }).forEach(([key, data]) => {
    if (isCommunitySummary(data) && data.id === communityId) queryClient.setQueryData(key, patch(data));
  });
  queryClient.getQueriesData<Lists>({ queryKey: LIST_PREFIX }).forEach(([key, data]) => {
    if (data === undefined) return;
    queryClient.setQueryData<Lists>(key, {
      ...data,
      pages: data.pages.map((page) => ({ ...page, communities: page.communities.map((row) => (row.id === communityId ? patch(row) : row)) })),
    });
  });
};

const removeEverywhere = (queryClient: QueryClient, communityId: string) => {
  queryClient.getQueriesData({ queryKey: DETAIL_PREFIX }).forEach(([key, data]) => {
    if (isCommunitySummary(data) && data.id === communityId) queryClient.removeQueries({ queryKey: key, exact: true });
  });
  queryClient.getQueriesData<Lists>({ queryKey: LIST_PREFIX }).forEach(([key, data]) => {
    if (data === undefined) return;
    queryClient.setQueryData<Lists>(key, {
      ...data,
      pages: data.pages.map((page) => ({ ...page, communities: page.communities.filter((row) => row.id !== communityId) })),
    });
  });
};

const applyBody = (body: CommunitySettingsBody) => (community: CommunitySummary): CommunitySummary => ({
  ...community,
  ...(body.name === undefined ? {} : { name: body.name }),
  ...(body.description === undefined ? {} : { description: body.description === '' ? null : body.description }),
  ...(body.isPrivate === undefined ? {} : { isPrivate: body.isPrivate }),
});

const served = (community: CommunitySummary) => (cached: CommunitySummary): CommunitySummary => ({
  ...cached,
  name: community.name,
  description: community.description,
  isPrivate: community.isPrivate,
  identifier: community.identifier,
});

const refusalOf = (status: number): UpdateSettingsOutcome => ({ status: status === 403 ? 'refused' : status === 404 ? 'gone' : 'error' });

export async function performUpdateCommunitySettings({
  community,
  draft,
  deps,
}: {
  readonly community: CommunitySummary;
  readonly draft: CommunitySettingsDraft;
  readonly deps: CommunityActionDeps;
}): Promise<UpdateSettingsOutcome> {
  const changes = settingsChangesOf(community, draft);
  if (!changes.ok) return { status: 'invalid', field: changes.field };
  if (changes.body === null) return { status: 'unchanged' };
  if (!deps.isOnline()) return { status: 'offline' };

  const { queryClient } = deps;
  const snapshot = snapshotOf(queryClient, community.id);
  patchEverywhere(queryClient, community.id, applyBody(changes.body));

  const result = await updateCommunity(deps, community.id, changes.body);
  if (!result.ok) {
    restore(queryClient, snapshot);
    return refusalOf(result.status);
  }
  if (result.data !== null) patchEverywhere(queryClient, community.id, served(result.data));
  if (changes.body.isPrivate !== undefined) void queryClient.invalidateQueries({ queryKey: communityConversationsQueryKey(community.id) });
  return { status: 'saved' };
}

export async function performDeleteCommunity({
  community,
  deps,
}: {
  readonly community: CommunitySummary;
  readonly deps: CommunityActionDeps;
}): Promise<DeleteCommunityOutcome> {
  if (!deps.isOnline()) return { status: 'offline' };
  const { queryClient } = deps;
  const snapshot = snapshotOf(queryClient, community.id);
  removeEverywhere(queryClient, community.id);

  const result = await deleteCommunity(deps, community.id);
  if (!result.ok && result.status !== 404) {
    restore(queryClient, snapshot);
    return { status: result.status === 403 ? 'refused' : 'error' };
  }
  queryClient.removeQueries({ queryKey: communityConversationsQueryKey(community.id) });
  void queryClient.invalidateQueries({ queryKey: [...LIST_PREFIX], refetchType: 'none' });
  return { status: 'deleted' };
}
