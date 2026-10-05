import { useQuery } from '@tanstack/react-query';

import { ADMIN_DASH_QUERY_KEY } from '@/lib/api/admin-dashboard';
import { ApiError, unwrap } from '@/lib/api/client';
import type { ApiResult } from '@/lib/api/http';

/**
 * **L'ÉTAT D'UN BLOC DU TABLEAU DE BORD** (#8876, § 4) — chaque bloc lit SA
 * route, a SON squelette, SON erreur avec « Réessayer », et ne retient jamais
 * les autres : quatre états, un seul type.
 *
 * - `loading` : rien en cache, la requête est en vol — un squelette. JAMAIS sur
 *   un cache non vide (cache-first : des données périmées valent mieux qu'un
 *   spinner, la relecture se fait en silence) ;
 * - `ready` : des données, fraîches ou périmées — y compris quand la dernière
 *   relecture a échoué : on garde ce qu'on sait ;
 * - `denied` : la passerelle a refusé (403) alors que la matrice servie
 *   l'autorisait. Un refus n'est pas une panne — pas de « Réessayer » qui
 *   rejouerait un refus d'audit à chaque clic ;
 * - `error` : panne, avec de quoi réessayer.
 */
export type DashBlock<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'denied' }
  | { readonly status: 'error'; readonly retry: () => void }
  | { readonly status: 'ready'; readonly data: T };

/** L'onglet est-il regardé ? Une relecture périodique ne sert à personne dans un onglet caché. */
export const pageIsVisible = (): boolean => typeof document === 'undefined' || document.visibilityState === 'visible';

/**
 * LA RELECTURE PÉRIODIQUE, SEULEMENT SI L'ONGLET EST VISIBLE — la fonction que
 * `refetchInterval` rappelle avant CHAQUE échéance : une valeur figée à la
 * construction n'aurait pas vu l'onglet passer en arrière-plan.
 */
export function visibleInterval<T>(every: (data: T | undefined) => number | false) {
  return (query: { readonly state: { readonly data: T | undefined } }): number | false => (pageIsVisible() ? every(query.state.data) : false);
}

export function useDashBlock<T>(spec: {
  /** Le nom du bloc, sous `['admin', 'dash', …]` : jamais persisté, invalidé d'un coup par « Recalculer maintenant ». */
  readonly key: readonly string[];
  readonly load: (signal: AbortSignal) => Promise<ApiResult<T>>;
  readonly staleTime: number;
  /** Si posée, la relecture périodique (en ms, ou `false` pour la suspendre) — toujours conditionnée à la visibilité de l'onglet. */
  readonly refetchEvery?: (data: T | undefined) => number | false;
}): DashBlock<T> {
  const query = useQuery<T>({
    queryKey: [...ADMIN_DASH_QUERY_KEY, ...spec.key],
    queryFn: async ({ signal }) => unwrap(await spec.load(signal)),
    staleTime: spec.staleTime,
    retry: false,
    refetchOnWindowFocus: false,
    ...(spec.refetchEvery === undefined ? {} : { refetchInterval: visibleInterval(spec.refetchEvery) }),
  });

  if (query.data !== undefined) return { status: 'ready', data: query.data };
  if (query.isError) {
    return query.error instanceof ApiError && query.error.status === 403
      ? { status: 'denied' }
      : { status: 'error', retry: () => void query.refetch() };
  }
  return { status: 'loading' };
}
