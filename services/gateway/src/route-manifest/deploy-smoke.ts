/**
 * Le test de fumée post-déploiement (#5644) frappe les routes que les
 * clients publiés appellent réellement — dérivées de
 * `services/gateway/route-manifest.json`, filtrées des routes
 * d'exploitation (`@meeshy/shared/api/ops-only-routes`, #5424) — et
 * distingue un **404** (aucune route Fastify ne matche : ABSENTE du serveur
 * assemblé) d'un **401** ou de tout autre code (la route a matché, le
 * verdict qui suit est métier : PRÉSENTE).
 *
 * Restreint aux verbes **GET** : sonder un POST/PUT/DELETE réel en
 * production mute des données. La distinction 404/reste ne dépend pas du
 * verbe — un GET suffit à prouver la présence de la route.
 *
 * Ces trois fonctions sont la règle PURE derrière
 * `scripts/smoke-test-deployed-routes.ts`, qui fait la requête réseau.
 */
import { filterOutOpsOnlyRoutes, type ManifestRouteInput } from '@meeshy/shared/api/ops-only-routes';

export type { ManifestRouteInput };

export type RouteProbeVerdict = 'present' | 'absent';

/** 404 = aucune route Fastify ne matche ce chemin ; tout le reste = la route a matché. */
export function classifyRouteProbe(statusCode: number): RouteProbeVerdict {
  return statusCode === 404 ? 'absent' : 'present';
}

/**
 * Forme d'un ObjectId MongoDB (24 caractères hexadécimaux) — la plupart des
 * identifiants de ressource Meeshy en sont un, et un identifiant de cette
 * forme atteint le gestionnaire de la route (401/400/404-métier) au lieu de
 * faire échouer le ROUTAGE Fastify (qui rendrait un 404 pour une tout autre
 * raison que celle que ce test de fumée cherche à détecter).
 */
const PLACEHOLDER_ID = '000000000000000000000000';

/** Remplace chaque segment `:param` ou `*` (wildcard Fastify) par un identifiant plausible. */
export function resolveSmokeTestPath(path: string): string {
  return path
    .split('/')
    .map((segment) => (segment.startsWith(':') || segment === '*' ? PLACEHOLDER_ID : segment))
    .join('/');
}

export type SmokeTestManifest = {
  readonly routes: readonly ManifestRouteInput[];
};

/** Les routes GET, hors exploitation — celles qu'un test de fumée peut frapper sans risque et sans faux positif. */
export function selectSmokeTestRoutes(manifest: SmokeTestManifest): readonly ManifestRouteInput[] {
  return filterOutOpsOnlyRoutes(manifest.routes.filter((route) => route.method === 'GET'));
}
