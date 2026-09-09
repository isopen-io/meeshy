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

/**
 * Remplace chaque segment variable par un identifiant Mongo ObjectId plausible
 * — `:param` ET le JOKER `*`, qui échappait à la substitution : la sonde
 * interrogeait `/api/v1/attachments/file/*` avec un astérisque LITTÉRAL, une
 * URL dont aucun verdict ne pouvait rien dire (#5857).
 */
export function resolveRoutePath(path: string, placeholder: string = PLACEHOLDER_PATH_PARAM): string {
  return path
    .split('/')
    .map((segment) => (segment.startsWith(':') || segment === '*' ? placeholder : segment))
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

/**
 * Le corps que `sendError()` produit — le producteur UNIQUE des réponses du
 * gateway (§ « API Response Format » du CLAUDE.md racine). Le reconnaître
 * PROUVE que notre handler a tourné, donc que la route existe.
 */
function isGatewayErrorBody(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    (body as { success?: unknown }).success === false
  );
}

/**
 * **Un 404 ne dit pas à lui seul qu'une route est absente (#5857).**
 *
 * La sonde interroge chaque `:param` avec un ObjectId qui n'existe pas : une
 * route PUBLIQUE de lecture-par-identifiant répond donc légitimement 404.
 * Mesuré sur staging le 2026-09-09 — douze routes vivantes déclarées absentes,
 * à chaque déploiement, ce qui avait fini par vider ce gate de tout signal.
 * Les routes GARDÉES y échappaient par accident : elles rendent 401/403 AVANT
 * de chercher quoi que ce soit.
 *
 * La règle est POSITIVE et fail-closed : un 404 n'est « présent » que s'il
 * porte la signature de notre propre producteur d'erreurs. Tout autre 404 —
 * la forme du `notFoundHandler` de Fastify, un corps vide, du HTML de proxy —
 * n'a rien prouvé et reste « absent ». Conclure l'inverse (absent SI la forme
 * Fastify) pencherait du mauvais côté : le jour où cette forme change, une
 * route réellement disparue passerait pour présente — exactement la panne que
 * #5644 existe pour attraper.
 */
export function classifySmokeStatus(status: number, body?: unknown): 'present' | 'absent' {
  if (status !== 404) return 'present';
  return isGatewayErrorBody(body) ? 'present' : 'absent';
}

export function summarizeSmokeResults(results: readonly SmokeResult[]): SmokeReport {
  return {
    total: results.length,
    absent: results.filter((result) => result.verdict === 'absent'),
    unreachable: results.filter((result) => result.verdict === 'unreachable')
  };
}

/**
 * Le CORPS voyage avec le statut : sans lui, `classifySmokeStatus` ne peut pas
 * distinguer les deux 404 — la sonde était structurellement incapable de
 * rendre un verdict juste, quel que soit son classificateur (#5857).
 */
export type SmokeFetchResponse = { status: number; body?: unknown };
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
          verdict: classifySmokeStatus(response.status, response.body)
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
