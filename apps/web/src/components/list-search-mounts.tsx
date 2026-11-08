import { lazy, Suspense } from 'react';

import type { InterfaceLanguage } from '@/lib/interface-language';
import { hasNavigatedInApp, useSearch } from '@/lib/router';

/**
 * **LES DEUX PORTES DE LA RECHERCHE GÉNÉRALE DANS LA LISTE** (#14619, #14620) —
 * statiques et minuscules : le code qu'elles ouvrent (la section « Messages »,
 * l'écran de recherche) ne se télécharge qu'au premier besoin, jamais avec la
 * liste, dont le chunk est à son plafond de poids (`budgets.json`).
 *
 * La section ne se monte qu'à partir de deux caractères ; la recherche générale
 * se présente PAR-DESSUS la liste tant que `?search=` est dans l'adresse, comme
 * `GlobalSearchView` sur iOS, et le retour la ferme.
 */

export const GLOBAL_SEARCH_PARAM = 'search';

const ListMessageSearch = lazy(() => import('@/components/list-message-search').then((m) => ({ default: m.ListMessageSearch })));
const GlobalSearchScreen = lazy(() => import('@/components/global-search-screen'));

export function ListMessageSearchMount({ language, query }: { readonly language: InterfaceLanguage; readonly query: string }) {
  if (query.trim().length < 2) return null;
  return (
    <Suspense fallback={null}>
      <ListMessageSearch language={language} query={query} />
    </Suspense>
  );
}

export function GlobalSearchOverlay() {
  const [params, setParams] = useSearch();
  const query = params.get(GLOBAL_SEARCH_PARAM);
  if (query === null) return null;
  const close = () => {
    if (hasNavigatedInApp()) {
      window.history.back();
      return;
    }
    const next = new URLSearchParams(params);
    next.delete(GLOBAL_SEARCH_PARAM);
    next.delete('tab');
    setParams(next, true);
  };
  return (
    <Suspense fallback={null}>
      <GlobalSearchScreen initialQuery={query} initialTab={params.get('tab')} onClose={close} />
    </Suspense>
  );
}
