/**
 * L'ÉTAT D'UNE LISTE D'ADMINISTRATION — tri, ordre, filtres, recherche, page
 * — LU ET ÉCRIT DANS L'ADRESSE (#7873).
 *
 * Pourquoi l'adresse et pas un `useState` : un administrateur partage un lien
 * (« les comptes ADMIN désactivés, les plus anciens d'abord »), revient en
 * arrière depuis une fiche, recharge la page ; dans les trois cas la liste
 * doit revenir telle qu'il l'a laissée.
 *
 * Tout ce qui se lit dans l'adresse passe par une LISTE BLANCHE : une clé de
 * tri ou une valeur de filtre inconnue est ignorée, jamais transmise à la
 * passerelle. Celle-ci filtre aussi, mais une adresse bricolée ne doit pas
 * produire une requête que l'écran ne saurait pas nommer.
 */
export type SortOrder = 'asc' | 'desc';

export type ListSpec<S extends string, F extends string> = {
  readonly sortKeys: readonly S[];
  readonly defaultSort: S;
  /** Les colonnes de TEXTE : un premier clic les range de A à Z, les dates partent de la plus récente. */
  readonly ascendingFirst: readonly S[];
  readonly filters: Readonly<Record<F, readonly string[]>>;
  readonly pageSizes: readonly number[];
};

export type ListState<S extends string, F extends string> = {
  readonly sort: S;
  readonly order: SortOrder;
  readonly filters: Readonly<Partial<Record<F, string>>>;
  readonly q: string;
  readonly offset: number;
  readonly limit: number;
};

export function defineListSpec<const S extends string, const F extends string>(spec: ListSpec<S, F>): ListSpec<S, F> {
  return spec;
}

const ordreParDefaut = <S extends string, F extends string>(spec: ListSpec<S, F>, sort: S): SortOrder =>
  spec.ascendingFirst.includes(sort) ? 'asc' : 'desc';

const tailleParDefaut = <S extends string, F extends string>(spec: ListSpec<S, F>): number => spec.pageSizes[0] ?? 20;

const filtreConnu = <S extends string, F extends string>(spec: ListSpec<S, F>, cle: F, valeur: string): boolean =>
  spec.filters[cle].includes(valeur);

const clesDeFiltre = <S extends string, F extends string>(spec: ListSpec<S, F>): readonly F[] =>
  Object.keys(spec.filters) as F[];

export function parseListState<S extends string, F extends string>(
  search: URLSearchParams,
  spec: ListSpec<S, F>,
): ListState<S, F> {
  const triDemande = search.get('sort') ?? '';
  const sort = spec.sortKeys.find((cle) => cle === triDemande) ?? spec.defaultSort;
  const ordreDemande = search.get('order');
  const order: SortOrder = ordreDemande === 'asc' || ordreDemande === 'desc' ? ordreDemande : ordreParDefaut(spec, sort);
  const filters = Object.fromEntries(
    clesDeFiltre(spec).flatMap((cle) => {
      const valeur = search.get(cle) ?? '';
      return filtreConnu(spec, cle, valeur) ? [[cle, valeur]] : [];
    }),
  ) as Partial<Record<F, string>>;
  const limiteDemandee = Number(search.get('limit'));
  const limit = spec.pageSizes.includes(limiteDemandee) ? limiteDemandee : tailleParDefaut(spec);
  const offsetDemande = Number(search.get('offset'));
  const offset = Number.isInteger(offsetDemande) && offsetDemande > 0 ? offsetDemande : 0;
  return { sort, order, filters, q: (search.get('q') ?? '').trim(), offset, limit };
}

export function serializeListState<S extends string, F extends string>(
  state: ListState<S, F>,
  spec: ListSpec<S, F>,
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.sort !== spec.defaultSort) params.set('sort', state.sort);
  if (state.sort !== spec.defaultSort || state.order !== ordreParDefaut(spec, spec.defaultSort)) params.set('order', state.order);
  clesDeFiltre(spec).forEach((cle) => {
    const valeur = state.filters[cle];
    if (valeur !== undefined && valeur !== '') params.set(cle, valeur);
  });
  if (state.q !== '') params.set('q', state.q);
  if (state.offset > 0) params.set('offset', String(state.offset));
  if (state.limit !== tailleParDefaut(spec)) params.set('limit', String(state.limit));
  return params;
}

export function toggleSort<S extends string, F extends string>(
  state: ListState<S, F>,
  sort: S,
  spec: ListSpec<S, F>,
): ListState<S, F> {
  const order: SortOrder =
    state.sort === sort ? (state.order === 'asc' ? 'desc' : 'asc') : ordreParDefaut(spec, sort);
  return { ...state, sort, order, offset: 0 };
}

export function withFilter<S extends string, F extends string>(
  state: ListState<S, F>,
  cle: F,
  valeur: string,
  spec: ListSpec<S, F>,
): ListState<S, F> {
  const autres = Object.fromEntries(
    Object.entries(state.filters).filter(([nom]) => nom !== cle),
  ) as Partial<Record<F, string>>;
  const filters = filtreConnu(spec, cle, valeur) ? { ...autres, [cle]: valeur } : autres;
  return { ...state, filters, offset: 0 };
}

export function withSearch<S extends string, F extends string>(state: ListState<S, F>, q: string): ListState<S, F> {
  return { ...state, q, offset: 0 };
}

export function withPage<S extends string, F extends string>(
  state: ListState<S, F>,
  page: { readonly offset?: number; readonly limit?: number },
  spec: ListSpec<S, F>,
): ListState<S, F> {
  if (page.limit !== undefined && spec.pageSizes.includes(page.limit)) return { ...state, limit: page.limit, offset: 0 };
  return { ...state, offset: Math.max(0, page.offset ?? state.offset) };
}
