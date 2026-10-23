/**
 * Les CLIENTS LECTEURS d'une route (#11271, décision du 2026-10-23 sur #12288,
 * dans la ligne de #12266).
 *
 * Une route ne se génère que dans le catalogue d'un client qui la LIT : une
 * entrée Swift ou Kotlin qu'aucun écran natif n'appelle n'est pas une dette à
 * compter (`check-swift-catalog-dead-entries.mjs`), c'est une adresse qui
 * n'avait pas à être générée. Une route NON déclarée ici est lue par tous —
 * c'est le cas nominal, et rien ne change pour elle. Une route déclarée
 * quitte le catalogue natif de tout client qu'elle ne nomme pas ; le jour où
 * un écran iOS ou Android la lit, il ajoute son client ici, et l'entrée
 * revient au générateur suivant.
 *
 * Le catalogue TS (`api/endpoints.ts`) ne filtre pas : il sert le web, et
 * `check-ts-catalog-dead-entries.mjs` exige que le web ait le lecteur.
 *
 * Les routes de la console d'administration web (`web-console-routes.ts`)
 * sont des routes lues par le web seul : elles sont déclarées ici par
 * construction, pour qu'un seul filtre serve les générateurs.
 */
import type { ManifestRouteInput } from './ops-only-routes.js';
import { WEB_CONSOLE_ROUTES } from './web-console-routes.js';

export type NativeClient = 'ios' | 'android';
export type RouteClient = 'web' | NativeClient;

export type DeclaredRouteReaders = ManifestRouteInput & {
  readonly readers: readonly RouteClient[];
  /** Qui la lit, et pourquoi pas les autres. */
  readonly reason: string;
};

const LENS_WEB_ONLY =
  'Lens (#11271) : catalogue, document, installation et modération des packs de lens. Lues par le web (W16) ; ' +
  'le composer iOS ajoutera `ios` quand il les lira (IC24).';

const LENS_ROUTES: readonly DeclaredRouteReaders[] = [
  { method: 'GET', path: '/api/v1/packs/lens' },
  { method: 'GET', path: '/api/v1/packs/lens/:slug' },
  { method: 'GET', path: '/api/v1/packs/lens/:slug/document' },
  { method: 'GET', path: '/api/v1/packs/lens/installed' },
  { method: 'PUT', path: '/api/v1/packs/lens/:slug/install' },
  { method: 'DELETE', path: '/api/v1/packs/lens/:slug/install' },
  { method: 'GET', path: '/api/v1/packs/lens/pending' },
  { method: 'GET', path: '/api/v1/packs/lens/submissions' },
  { method: 'POST', path: '/api/v1/packs/lens/submissions' },
  { method: 'POST', path: '/api/v1/packs/lens/:slug/review' },
  { method: 'POST', path: '/api/v1/packs/lens/:slug/withdraw' },
].map((route) => ({ ...route, readers: ['web'] as const, reason: LENS_WEB_ONLY }));

export const ROUTE_READERS: readonly DeclaredRouteReaders[] = [
  ...WEB_CONSOLE_ROUTES.map((route) => ({ method: route.method, path: route.path, readers: ['web'] as const, reason: route.reason })),
  ...LENS_ROUTES,
];

const keyOf = (route: ManifestRouteInput) => `${route.method} ${route.path}`;

function indexOf(declarations: readonly DeclaredRouteReaders[]): ReadonlyMap<string, readonly RouteClient[]> {
  return new Map(declarations.map((route) => [keyOf(route), route.readers]));
}

const DECLARED = indexOf(ROUTE_READERS);

/** Les clients qui lisent cette route, ou `null` si elle n'est pas déclarée (lue par tous). */
export function readersOf(route: ManifestRouteInput): readonly RouteClient[] | null {
  return DECLARED.get(keyOf(route)) ?? null;
}

/** Le catalogue d'un client natif : les routes non déclarées, et celles qui le nomment. */
export function filterRoutesReadBy<T extends ManifestRouteInput>(
  routes: readonly T[],
  client: NativeClient,
  declarations: readonly DeclaredRouteReaders[] = ROUTE_READERS,
): readonly T[] {
  const declared = declarations === ROUTE_READERS ? DECLARED : indexOf(declarations);
  return routes.filter((route) => declared.get(keyOf(route))?.includes(client) ?? true);
}
