/**
 * Sonde de fumée post-déploiement (#5644) — distingue une route ABSENTE
 * (404, le conteneur servi ne connaît pas encore cette route) d'une route
 * PRÉSENTE mais gardée (401/403 le plus souvent, l'authentification manque).
 *
 * Les routes proviennent de `route-manifest.json`, jamais d'une liste
 * recopiée à la main — c'est la même garantie que le manifeste porte déjà
 * pour les catalogues clients (#4276).
 */

const PLACEHOLDER_PATH_PARAM = '000000000000000000000000';
const SMOKE_TESTABLE_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export type ManifestRoute = {
  method: string;
  path: string;
  module: string;
  mountPrefix: string;
  securityLevel: string;
};

export type SmokeVerdict = 'present' | 'absent' | 'unreachable';

export type SmokeResult = {
  method: string;
  path: string;
  module: string;
  status: number | 'network-error';
  verdict: SmokeVerdict;
};

export type SmokeReport = {
  total: number;
  absent: SmokeResult[];
  unreachable: SmokeResult[];
};

/** Remplace chaque segment `:param` par un identifiant Mongo ObjectId plausible. */
export function resolveRoutePath(path: string, placeholder: string = PLACEHOLDER_PATH_PARAM): string {
  return path
    .split('/')
    .map((segment) => (segment.startsWith(':') ? placeholder : segment))
    .join('/');
}

/**
 * Le manifeste porte aussi des surfaces hors périmètre client (`/health`,
 * `/docs`) et des méthodes qu'une sonde ne doit jamais émettre (`HEAD`,
 * `OPTIONS` répondent souvent 404/405 sans rapport avec l'existence de la
 * route GET/POST correspondante).
 */
export function isSmokeTestable(route: Pick<ManifestRoute, 'method' | 'path'>): boolean {
  return route.path.startsWith('/api') && SMOKE_TESTABLE_METHODS.has(route.method);
}

export function selectSmokeRoutes(routes: readonly ManifestRoute[]): ManifestRoute[] {
  return routes.filter(isSmokeTestable);
}

/** 404 = la route n'existe pas sur le binaire servi. Tout le reste prouve qu'elle y est. */
export function classifySmokeStatus(status: number): 'present' | 'absent' {
  return status === 404 ? 'absent' : 'present';
}

export function summarizeSmokeResults(results: readonly SmokeResult[]): SmokeReport {
  return {
    total: results.length,
    absent: results.filter((result) => result.verdict === 'absent'),
    unreachable: results.filter((result) => result.verdict === 'unreachable')
  };
}

export type SmokeFetchResponse = { status: number };
export type SmokeFetch = (
  url: string,
  init: { method: string; headers: Record<string, string> }
) => Promise<SmokeFetchResponse>;

export type RunRouteSmokeTestOptions = {
  baseUrl: string;
  routes: readonly ManifestRoute[];
  fetchImpl: SmokeFetch;
  concurrency?: number;
};

const DEFAULT_CONCURRENCY = 8;

/**
 * Sonde chaque route en parallèle borné. Un échec réseau vaut `unreachable`,
 * jamais `absent` — un hôte injoignable ne PROUVE rien sur ses routes
 * (verdict fail-closed, § « Un verdict de garde a TROIS états » CLAUDE.md).
 */
export async function runRouteSmokeTest(options: RunRouteSmokeTestOptions): Promise<SmokeResult[]> {
  const { baseUrl, routes, fetchImpl, concurrency = DEFAULT_CONCURRENCY } = options;
  const results: SmokeResult[] = new Array(routes.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < routes.length) {
      const index = cursor++;
      const route = routes[index];
      const url = `${baseUrl}${resolveRoutePath(route.path)}`;
      try {
        const response = await fetchImpl(url, {
          method: route.method,
          headers: { 'X-Meeshy-Smoke-Test': '1', 'Content-Type': 'application/json' }
        });
        results[index] = {
          method: route.method,
          path: route.path,
          module: route.module,
          status: response.status,
          verdict: classifySmokeStatus(response.status)
        };
      } catch {
        results[index] = {
          method: route.method,
          path: route.path,
          module: route.module,
          status: 'network-error',
          verdict: 'unreachable'
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, routes.length) }, () => worker()));
  return results;
}
