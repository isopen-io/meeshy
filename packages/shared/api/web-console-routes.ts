/**
 * Routes de la CONSOLE D'ADMINISTRATION WEB, que les clients natifs ne lisent
 * pas (#11280, décision du 2026-10-23 sur #12266).
 *
 * L'administration de Meeshy vit dans le web (`apps/web/src/routes/admin-*`) :
 * iOS et Android n'en ont aucun écran. Une route qu'aucun client natif ne
 * pourra lire n'a pas à être générée dans `AdminEndpoint.swift` ni dans
 * `ApiRoutesAdmin.kt`, où elle ne serait qu'une entrée morte comptée comme
 * dette par `check-swift-catalog-dead-entries.mjs`. Le catalogue TS
 * (`api/endpoints.ts`), lui, la garde : c'est la console web qui la lit, et
 * `check-ts-catalog-dead-entries.mjs` exige qu'elle ait son lecteur.
 *
 * Même patron que `ops-only-routes.ts` : une liste EXPLICITE de couples
 * (méthode, chemin), chacun avec sa raison. Le manifeste ne change pas : ces
 * routes sont déclarées lues par le web seul dans `route-readers.ts` (#11271),
 * le filtre UNIQUE des générateurs natifs et de leurs cliquets.
 * Une route qu'un écran natif se met à lire quitte cette liste.
 */
import type { ManifestRouteInput } from './ops-only-routes.js';

export type WebConsoleRoute = ManifestRouteInput & {
  /** Pourquoi aucun client natif ne la lit. */
  readonly reason: string;
};

export const WEB_CONSOLE_ROUTES: readonly WebConsoleRoute[] = [
  {
    method: 'GET',
    path: '/api/v1/admin/analytics/playback',
    reason:
      'Qualité de lecture agrégée (#11280) : temps jusqu’à la première image et rebuffer, p50/p95 par surface et tier. ' +
      'Lue par l’onglet « Lecture » des statistiques de la console web ; aucun écran d’administration natif.',
  },
  {
    method: 'GET',
    path: '/api/v1/admin/packs/registry',
    reason:
      'Registre des packs (#11275) : lecture, publication et retrait des entrées du registre, réservés à l’administration. ' +
      'Lu par la console web (W17) ; aucun écran d’administration natif.',
  },
  {
    method: 'PUT',
    path: '/api/v1/admin/packs/registry/:domain/:slug',
    reason:
      'Registre des packs (#11275) : lecture, publication et retrait des entrées du registre, réservés à l’administration. ' +
      'Lu par la console web (W17) ; aucun écran d’administration natif.',
  },
  {
    method: 'DELETE',
    path: '/api/v1/admin/packs/registry/:domain/:slug',
    reason:
      'Registre des packs (#11275) : lecture, publication et retrait des entrées du registre, réservés à l’administration. ' +
      'Lu par la console web (W17) ; aucun écran d’administration natif.',
  },
];
