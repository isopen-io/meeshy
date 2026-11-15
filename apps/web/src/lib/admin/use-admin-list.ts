import { keepPreviousData, useQuery, type QueryKey, type UseQueryResult } from '@tanstack/react-query';

import type { AdminPage } from '@/lib/api/admin-page';
import { unwrap } from '@/lib/api/client';
import type { ApiResult } from '@/lib/api/http';

import { parseListState, toggleSort, withFilter, withPage, type ListSpec, type ListState } from './list-state';
import { useAdminListState } from './use-list-state';

export type { AdminPage };

/**
 * **LE CONTRÔLEUR D'UNE LISTE D'ADMINISTRATION** (#8876) — l'état dans l'adresse
 * (`useAdminListState`) + la requête, prêts à être remis à `AdminEntityList` :
 * tri, filtre, page et « Réinitialiser » sont déjà des gestes qui ÉCRIVENT
 * l'adresse, donc une liste se partage, se recharge et se retrouve en revenant
 * d'une fiche.
 */
export type AdminListController<Row, S extends string, F extends string, I extends string = never> = {
  readonly state: ListState<S, F, I>;
  readonly address: string;
  readonly draft: string;
  readonly setDraft: (q: string) => void;
  readonly query: UseQueryResult<AdminPage<Row>>;
  readonly sort: (key: S) => void;
  readonly filter: (key: F, value: string | null) => void;
  readonly page: (next: { readonly offset?: number; readonly limit?: number }) => void;
  readonly reset: () => void;
};

/**
 * `placeholderData: keepPreviousData` — changer de tri ou de page garde la page
 * précédente à l'écran (atténuée) le temps que la suivante arrive : jamais un
 * spinner sur des données déjà là. `refetchOnWindowFocus: false` : revenir sur
 * l'onglet ne doit pas frapper la passerelle (et, pour `/admin/users`, écrire
 * une trace d'audit à chaque lecture). `staleTime` 60 s par défaut ; 5 min
 * pour une liste dont la lecture écrit une trace.
 */
export function useAdminList<Row, S extends string, F extends string, I extends string = never>(params: {
  readonly spec: ListSpec<S, F, I>;
  readonly queryKey: (address: string) => QueryKey;
  readonly load: (state: ListState<S, F, I>, signal: AbortSignal) => Promise<ApiResult<AdminPage<Row>>>;
  readonly enabled: boolean;
  readonly staleTime?: number;
}): AdminListController<Row, S, F, I> {
  const { spec } = params;
  const list = useAdminListState(spec);

  const query = useQuery<AdminPage<Row>>({
    queryKey: params.queryKey(list.address),
    queryFn: async ({ signal }) => unwrap(await params.load(list.state, signal)),
    enabled: params.enabled,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    staleTime: params.staleTime ?? 60_000,
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
