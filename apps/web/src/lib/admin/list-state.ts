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

export type ListSpec<S extends string, F extends string, I extends string = never> = {
  readonly sortKeys: readonly S[];
  readonly defaultSort: S;
  /** Les colonnes de TEXTE : un premier clic les range de A à Z, les dates partent de la plus récente. */
  readonly ascendingFirst: readonly S[];
  readonly filters: Readonly<Record<F, readonly string[]>>;
  readonly pageSizes: readonly number[];
  /**
   * Les filtres par IDENTIFIANT (#8876) — `?senderId=…` depuis une fiche membre :
   * une valeur n'est acceptée que si elle a la forme d'un ObjectId, sinon elle est
   * ignorée. Liste blanche, comme tout ce que l'adresse apporte.
   */
  readonly idFilters?: readonly I[];
};

export type ListState<S extends string, F extends string, I extends string = never> = {
  readonly sort: S;
  readonly order: SortOrder;
  readonly filters: Readonly<Partial<Record<F, string>>>;
  readonly ids: Readonly<Partial<Record<I, string>>>;
  readonly q: string;
  readonly offset: number;
  readonly limit: number;
};

export function defineListSpec<const S extends string, const F extends string, const I extends string = never>(spec: ListSpec<S, F, I>): ListSpec<S, F, I> {
  return spec;
}

const ordreParDefaut = <S extends string, F extends string, I extends string = never>(spec: ListSpec<S, F, I>, sort: S): SortOrder =>
  spec.ascendingFirst.includes(sort) ? 'asc' : 'desc';

const tailleParDefaut = <S extends string, F extends string, I extends string = never>(spec: ListSpec<S, F, I>): number => spec.pageSizes[0] ?? 20;

const filtreConnu = <S extends string, F extends string, I extends string = never>(spec: ListSpec<S, F, I>, cle: F, valeur: string): boolean =>
  spec.filters[cle].includes(valeur);

const OBJECT_ID = /^[0-9a-f]{24}$/;

const clesDId = <S extends string, F extends string, I extends string = never>(spec: ListSpec<S, F, I>): readonly I[] => spec.idFilters ?? [];

const clesDeFiltre = <S extends string, F extends string, I extends string = never>(spec: ListSpec<S, F, I>): readonly F[] =>
  Object.keys(spec.filters) as F[];

export function parseListState<S extends string, F extends string, I extends string = never>(
  search: URLSearchParams,
  spec: ListSpec<S, F, I>,
): ListState<S, F, I> {
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
  const ids = Object.fromEntries(
    clesDId(spec).flatMap((cle) => {
      const valeur = search.get(cle) ?? '';
      return OBJECT_ID.test(valeur) ? [[cle, valeur]] : [];
    }),
  ) as Partial<Record<I, string>>;
  const limiteDemandee = Number(search.get('limit'));
  const limit = spec.pageSizes.includes(limiteDemandee) ? limiteDemandee : tailleParDefaut(spec);
  const offsetDemande = Number(search.get('offset'));
  const offset = Number.isInteger(offsetDemande) && offsetDemande > 0 ? offsetDemande : 0;
  return { sort, order, filters, ids, q: (search.get('q') ?? '').trim(), offset, limit };
}

export function serializeListState<S extends string, F extends string, I extends string = never>(
  state: ListState<S, F, I>,
  spec: ListSpec<S, F, I>,
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.sort !== spec.defaultSort) params.set('sort', state.sort);
  if (state.sort !== spec.defaultSort || state.order !== ordreParDefaut(spec, spec.defaultSort)) params.set('order', state.order);
  clesDeFiltre(spec).forEach((cle) => {
    const valeur = state.filters[cle];
    if (valeur !== undefined && valeur !== '') params.set(cle, valeur);
  });
  clesDId(spec).forEach((cle) => {
    const valeur = state.ids[cle];
    if (valeur !== undefined && OBJECT_ID.test(valeur)) params.set(cle, valeur);
  });
  if (state.q !== '') params.set('q', state.q);
  if (state.offset > 0) params.set('offset', String(state.offset));
  if (state.limit !== tailleParDefaut(spec)) params.set('limit', String(state.limit));
  return params;
}

export function toggleSort<S extends string, F extends string, I extends string = never>(
  state: ListState<S, F, I>,
  sort: S,
  spec: ListSpec<S, F, I>,
): ListState<S, F, I> {
  const order: SortOrder =
    state.sort === sort ? (state.order === 'asc' ? 'desc' : 'asc') : ordreParDefaut(spec, sort);
  return { ...state, sort, order, offset: 0 };
}

export function withFilter<S extends string, F extends string, I extends string = never>(
  state: ListState<S, F, I>,
  cle: F,
  valeur: string,
  spec: ListSpec<S, F, I>,
): ListState<S, F, I> {
  const autres = Object.fromEntries(
    Object.entries(state.filters).filter(([nom]) => nom !== cle),
  ) as Partial<Record<F, string>>;
  const filters = filtreConnu(spec, cle, valeur) ? { ...autres, [cle]: valeur } : autres;
  return { ...state, filters, offset: 0 };
}

export function withSearch<S extends string, F extends string, I extends string = never>(state: ListState<S, F, I>, q: string): ListState<S, F, I> {
  return { ...state, q, offset: 0 };
}

export function withPage<S extends string, F extends string, I extends string = never>(
  state: ListState<S, F, I>,
  page: { readonly offset?: number; readonly limit?: number },
  spec: ListSpec<S, F, I>,
): ListState<S, F, I> {
  if (page.limit !== undefined && spec.pageSizes.includes(page.limit)) return { ...state, limit: page.limit, offset: 0 };
  return { ...state, offset: Math.max(0, page.offset ?? state.offset) };
}

/**
 * Pose (ou retire, avec `null`) un filtre par identifiant (#8876). Une valeur qui
 * n'a pas la forme d'un ObjectId est traitée comme un retrait : la liste ne
 * peut pas être pilotée par une chaîne que l'écran ne saurait pas nommer.
 */
export function withIdFilter<S extends string, F extends string, I extends string = never>(
  state: ListState<S, F, I>,
  cle: I,
  valeur: string | null,
  spec: ListSpec<S, F, I>,
): ListState<S, F, I> {
  const autres = Object.fromEntries(Object.entries(state.ids).filter(([nom]) => nom !== cle)) as Partial<Record<I, string>>;
  const accepte = valeur !== null && OBJECT_ID.test(valeur) && clesDId(spec).includes(cle);
  return { ...state, ids: accepte ? { ...autres, [cle]: valeur } : autres, offset: 0 };
}
