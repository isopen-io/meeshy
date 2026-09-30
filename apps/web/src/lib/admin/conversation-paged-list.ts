import { keepPreviousData, useQuery, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { AdminPage } from '@/lib/api/admin-page';
import { unwrap } from '@/lib/api/client';
import type { ApiResult } from '@/lib/api/http';

import type { ListState } from './list-state';
import type { AdminListController } from './use-admin-list';

/**
 * **UNE LISTE PAGINÉE QUI VIT DANS L'ÉCRAN, PAS DANS L'ADRESSE** (#8876) —
 * la même manette que `useAdminList` (`AdminListController`, donc les mêmes
 * `AdminEntityList` et `AdminListToolbar`), pour les listes qui s'ajoutent à un
 * écran qui a déjà la sienne : les membres sur une fiche de conversation, les
 * conversations suivies et le journal des scans sur l'écran de l'agent.
 *
 * Deux listes d'un même écran ne pourraient pas écrire `?offset=` dans la MÊME
 * adresse sans se piétiner ; leur état est donc local (page, taille, filtres,
 * recherche), et la requête le porte dans sa clé — changer de page ou de filtre
 * garde la page précédente à l'écran (atténuée) le temps que la suivante arrive.
 *
 * Aucune clé de tri : la passerelle ne trie pas ces listes, et une colonne
 * triable qu'elle ne trierait pas serait un contrôle sans effet. La recherche a
 * son brouillon et n'est écrite qu'après une courte pause — une frappe n'est pas
 * une requête.
 */
export type LocalSort = 'default';

export type LocalListState<F extends string> = ListState<LocalSort, F>;

const SEARCH_PAUSE_MS = 250;

/** `{}` est l'élément neutre de `Partial<Record<F, string>>`, mais TypeScript ne le prouve pas pour un `F` générique (même cas que `parseListState`). */
const noFilters = <F extends string>(): Partial<Record<F, string>> => ({}) as Partial<Record<F, string>>;

export function useLocalAdminList<Row, F extends string>(params: {
  readonly queryKey: (state: LocalListState<F>) => QueryKey;
  readonly load: (state: LocalListState<F>, signal: AbortSignal) => Promise<ApiResult<AdminPage<Row>>>;
  readonly pageSizes: readonly number[];
  readonly enabled?: boolean;
  readonly staleTime?: number;
}): AdminListController<Row, LocalSort, F> {
  const firstSize = params.pageSizes[0] ?? 20;
  const initial: LocalListState<F> = { sort: 'default', order: 'desc', filters: noFilters<F>(), ids: {}, q: '', offset: 0, limit: firstSize };
  const [state, setState] = useState<LocalListState<F>>(initial);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (draft.trim() === state.q) return undefined;
    const timer = setTimeout(() => setState((current) => ({ ...current, q: draft.trim(), offset: 0 })), SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [draft, state.q]);

  const query = useQuery<AdminPage<Row>>({
    queryKey: params.queryKey(state),
    queryFn: async ({ signal }) => unwrap(await params.load(state, signal)),
    enabled: params.enabled ?? true,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    staleTime: params.staleTime ?? 60_000,
    retry: false,
  });

  return {
    state,
    address: JSON.stringify([state.offset, state.limit, state.q, state.filters]),
    draft,
    setDraft,
    query,
    sort: () => undefined,
    filter: (key, value) =>
      setState((current) => {
        const others = Object.fromEntries(Object.entries(current.filters).filter(([name]) => name !== key)) as Partial<Record<F, string>>;
        const filters = value === null || value === '' ? others : { ...others, [key]: value };
        return { ...current, filters, offset: 0 };
      }),
    page: (next) =>
      setState((current) =>
        next.limit !== undefined && params.pageSizes.includes(next.limit)
          ? { ...current, limit: next.limit, offset: 0 }
          : { ...current, offset: Math.max(0, next.offset ?? current.offset) },
      ),
    reset: () => {
      setDraft('');
      setState(initial);
    },
  };
}
