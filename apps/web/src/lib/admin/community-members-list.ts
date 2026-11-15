import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { AdminDeps } from '@/lib/api/admin';
import { adminCommunityMembersQueryKey, loadAdminCommunityMembers, type AdminCommunityMember } from '@/lib/api/admin-communities-detail';
import { unwrap } from '@/lib/api/client';
import { useSearch } from '@/lib/router';

import { COMMUNITY_MEMBERS_SPEC, type CommunityMembersState } from './community-list';
import { parseListState, serializeListState, toggleSort, withFilter, withPage, withSearch } from './list-state';
import type { AdminListController } from './use-admin-list';

/**
 * **LA LISTE DES MEMBRES D'UNE COMMUNAUTÉ** (#8876) — la liste vit DANS la fiche,
 * sous l'onglet `?tab=members`.
 *
 * `useAdminList` (le kit) réécrit l'adresse ENTIÈRE à partir des seules clés de sa
 * spécification : y monter cette liste ferait retomber la fiche sur l'onglet
 * « Aperçu » au premier filtre. Celle-ci rend le MÊME contrôleur (`AdminEntityList`
 * la consomme telle quelle) mais réécrit SES clés seulement et GARDE les autres —
 * l'onglet, et tout ce qu'un lien partagé y aurait ajouté.
 *
 * Même règle de recherche que `useAdminListState` : l'adresse porte la requête
 * nettoyée, le champ garde ce qu'on tape et ne l'écrit qu'après 250 ms.
 */
const OWN_KEYS = ['sort', 'order', 'role', 'isActive', 'q', 'offset', 'limit'] as const;

/**
 * L'adresse SANS l'onglet des membres ni rien de ce qui le règle : ce que « Aperçu »
 * écrit en y revenant. Sans cela, `?tab=members&role=admin` deviendrait `?role=admin`
 * — un réglage orphelin d'une liste qui n'est plus à l'écran.
 */
export function withoutMembersList(search: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(search);
  ['tab', ...OWN_KEYS].forEach((key) => next.delete(key));
  return next;
}

type MembersController = AdminListController<AdminCommunityMember, 'joinedAt', 'role' | 'isActive'>;

export function useCommunityMembersList(params: {
  readonly communityId: string;
  readonly deps: AdminDeps;
  readonly enabled: boolean;
}): MembersController {
  const [search, setSearch] = useSearch();
  const state = parseListState(search, COMMUNITY_MEMBERS_SPEC);
  const address = serializeListState(state, COMMUNITY_MEMBERS_SPEC).toString();
  const [draft, setDraft] = useState(state.q);

  const write = (next: CommunityMembersState) => {
    const merged = new URLSearchParams(search);
    OWN_KEYS.forEach((key) => merged.delete(key));
    serializeListState(next, COMMUNITY_MEMBERS_SPEC).forEach((value, key) => merged.set(key, value));
    setSearch(merged, true);
  };

  useEffect(() => {
    if (draft.trim() === state.q) return undefined;
    const timer = setTimeout(() => write(withSearch(state, draft.trim())), 250);
    return () => clearTimeout(timer);
  });

  const query = useQuery({
    queryKey: adminCommunityMembersQueryKey(params.communityId, address),
    queryFn: async ({ signal }) => unwrap(await loadAdminCommunityMembers({ ...params.deps, communityId: params.communityId, state, signal })),
    enabled: params.enabled,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    retry: false,
  });

  return {
    state,
    address,
    draft,
    setDraft,
    query,
    sort: (key) => write(toggleSort(state, key, COMMUNITY_MEMBERS_SPEC)),
    filter: (key, value) => write(withFilter(state, key, value ?? '', COMMUNITY_MEMBERS_SPEC)),
    page: (next) => write(withPage(state, next, COMMUNITY_MEMBERS_SPEC)),
    reset: () => {
      setDraft('');
      write(parseListState(new URLSearchParams(), COMMUNITY_MEMBERS_SPEC));
    },
  };
}
