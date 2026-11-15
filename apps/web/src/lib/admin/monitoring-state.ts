/**
 * **L'ÉTAT DE LA SUPERVISION, DANS L'ADRESSE** (#8876, #6734) — l'onglet (`?tab=`,
 * lu par `useAdminTab`) et, pour l'usage des routes, la portée, la recherche et la
 * taille du détail. Liste blanche : une valeur inconnue retombe sur le défaut, jamais
 * sur la passerelle.
 *
 * `serializeRouteUsageState` RÉÉCRIT sur l'adresse courante : l'onglet y vit aussi, et
 * changer un filtre ne doit pas le faire disparaître.
 */
export const MONITORING_TABS = ['health', 'routes'] as const;
export type MonitoringTab = (typeof MONITORING_TABS)[number];

export const ROUTE_USAGE_SCOPES = ['watched', 'all'] as const;
export type RouteUsageScope = (typeof ROUTE_USAGE_SCOPES)[number];

export const ROUTE_USAGE_LIMITS = [50, 100, 250, 500] as const;
export type RouteUsageLimit = (typeof ROUTE_USAGE_LIMITS)[number];

export type RouteUsageState = {
  readonly scope: RouteUsageScope;
  /** Sous-chaîne de la route — le filtre que la passerelle applique au détail. */
  readonly route: string;
  readonly limit: RouteUsageLimit;
};

export const DEFAULT_ROUTE_USAGE_STATE: RouteUsageState = { scope: 'watched', route: '', limit: 100 };

/** La santé se relit toute seule, tant que l'écran est visible : un tableau de bord figé ment. */
export const HEALTH_REFRESH_MS = 30_000;

export const healthRefetchInterval = (visible: boolean, refreshMs: number = HEALTH_REFRESH_MS): number | false => (visible ? refreshMs : false);

const MAX_ROUTE_LENGTH = 120;

export function parseRouteUsageState(search: URLSearchParams): RouteUsageState {
  const scope = ROUTE_USAGE_SCOPES.find((candidate) => candidate === search.get('scope')) ?? DEFAULT_ROUTE_USAGE_STATE.scope;
  const limit = ROUTE_USAGE_LIMITS.find((candidate) => String(candidate) === search.get('limit')) ?? DEFAULT_ROUTE_USAGE_STATE.limit;
  return { scope, route: (search.get('route') ?? '').trim().slice(0, MAX_ROUTE_LENGTH), limit };
}

export function serializeRouteUsageState(state: RouteUsageState, base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  const write = (key: string, value: string | null) => (value === null ? next.delete(key) : next.set(key, value));
  write('scope', state.scope === DEFAULT_ROUTE_USAGE_STATE.scope ? null : state.scope);
  write('route', state.route === '' ? null : state.route);
  write('limit', state.limit === DEFAULT_ROUTE_USAGE_STATE.limit ? null : String(state.limit));
  return next;
}

export const isDefaultRouteUsageState = (state: RouteUsageState): boolean =>
  state.scope === DEFAULT_ROUTE_USAGE_STATE.scope && state.route === '' && state.limit === DEFAULT_ROUTE_USAGE_STATE.limit;

export const withScope = (state: RouteUsageState, scope: string): RouteUsageState => ({
  ...state,
  scope: ROUTE_USAGE_SCOPES.find((candidate) => candidate === scope) ?? DEFAULT_ROUTE_USAGE_STATE.scope,
});

export const withLimit = (state: RouteUsageState, limit: string): RouteUsageState => ({
  ...state,
  limit: ROUTE_USAGE_LIMITS.find((candidate) => String(candidate) === limit) ?? DEFAULT_ROUTE_USAGE_STATE.limit,
});

export const withRoute = (state: RouteUsageState, route: string): RouteUsageState => ({ ...state, route: route.trim().slice(0, MAX_ROUTE_LENGTH) });

/** Les noms exacts de la requête de `GET /admin/route-usage` ; la recherche vide n'est pas envoyée. */
export function routeUsageRequestQuery(state: RouteUsageState): URLSearchParams {
  const query = new URLSearchParams({ scope: state.scope, limit: String(state.limit) });
  if (state.route !== '') query.set('route', state.route);
  return query;
}

/** Les issues qui motivent un retrait vivent dans le dépôt : le lien ouvre l'issue numérotée. */
export const routeIssueUrl = (issue: number): string => `https://github.com/isopen-io/meeshy/issues/${issue}`;
