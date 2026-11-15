import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { AdminDeps } from '@/lib/api/admin';
import { adminAuditListKey, loadAdminAuditLogs, type AdminAuditEntry } from '@/lib/api/admin-audit';
import { unwrap } from '@/lib/api/client';

import {
  AUDIT_LIST_SPEC,
  auditListQuery,
  type AuditFilterKey,
  type AuditIdFilterKey,
  type AuditSortKey,
} from './audit-list';
import { parseListState, toggleSort, withFilter, withPage } from './list-state';
import type { AdminListController } from './use-admin-list';
import { useAdminListState } from './use-list-state';

/**
 * **LE CONTRÔLEUR DE LA LISTE DU JOURNAL** (#8876, #6727) — le jumeau de
 * `useAdminList`, à UNE différence près qui est la raison d'être de ce fichier : la
 * requête ne survit pas à l'écran (`gcTime: 0`).
 *
 * Le journal d'audit est la donnée la plus sensible de l'administration : sa clé est
 * souveraine (jamais écrite sur le disque), et il ne reste pas non plus en mémoire
 * une fois l'écran quitté. `useAdminList` est un fichier du kit — il n'expose pas
 * `gcTime` — donc ce contrôleur le refait ici plutôt que de peser sur le kit ; il rend
 * le MÊME `AdminListController`, que `AdminEntityList` consomme sans le savoir.
 *
 * `now` est injecté : la période (24 h, 7 j…) se mesure depuis l'horloge du site
 * d'appel, jamais depuis une horloge lue ici.
 */
export function useAuditList(params: {
  readonly deps: AdminDeps;
  readonly enabled: boolean;
  readonly now: () => Date;
}): AdminListController<AdminAuditEntry, AuditSortKey, AuditFilterKey, AuditIdFilterKey> {
  const spec = AUDIT_LIST_SPEC;
  const list = useAdminListState(spec);

  const query = useQuery({
    queryKey: adminAuditListKey(list.address),
    queryFn: async ({ signal }) =>
      unwrap(await loadAdminAuditLogs({ ...params.deps, query: auditListQuery(list.state, params.now()), signal })),
    enabled: params.enabled,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    gcTime: 0,
    retry: false,
  });

  return {
    state: list.state,
    address: list.address,
    draft: list.draft,
    setDraft: list.setDraft,
    query,
    sort: (key) => list.write(toggleSort(list.state, key, spec)),
    filter: (key, value) => list.write(withFilter(list.state, key, value ?? '', spec)),
    page: (next) => list.write(withPage(list.state, next, spec)),
    reset: () => {
      list.setDraft('');
      list.write(parseListState(new URLSearchParams(), spec));
    },
  };
}
