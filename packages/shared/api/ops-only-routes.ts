/**
 * Routes d'EXPLOITATION, jamais des routes CLIENT (#5424, décision produit
 * instruite en fermant #5373).
 *
 * Le manifeste (`services/gateway/route-manifest.json`, #4276) ne porte
 * aujourd'hui aucun champ qui distingue mécaniquement « route que l'app
 * mobile/web peut appeler » de « route d'exploitation, gardée `requireAdmin`
 * ou simplement destinée au diagnostic ». Deux options ont été pesées :
 *
 *   1. Détecter `requireAdmin` mécaniquement dans le collecteur
 *      (`route-manifest/collect.ts`), comme il détecte déjà `requirePermission`
 *      / `requireHierarchy` / `requireSovereign()`.
 *   2. Une liste EXPLICITE, ici, de couples (méthode, chemin) avec leur raison
 *      écrite — le même patron que `ALLOWED_OUTSIDE_API_V1`
 *      (`services/gateway/src/__tests__/route-manifest/no-routes-outside-api-v1.ts`)
 *      ou `UNPREFIXED_MOUNT_DECISIONS`.
 *
 * (1) a été écartée : `GET /api/v1/test` (`routes/translation.ts`) n'est PAS
 * gardée par `requireAdmin` — seulement par l'authentification ordinaire —
 * alors qu'elle est, par son USAGE (déclenche un job de traduction réel sur
 * le pipeline ML), tout aussi étrangère à un catalogue client que les trois
 * routes de `maintenance.ts`. Un détecteur mécanique sur `requireAdmin` ne
 * l'aurait donc jamais couverte : la liste explicite, elle, couvre les DEUX
 * régimes de garde sous un même critère produit (« aucun écran de l'app ne
 * doit jamais appeler ceci »).
 *
 * `GET /info` n'apparaît PAS ici : cette route est retirée du gateway dans le
 * même lot (`route-registration.ts`), la décision produit déjà écrite dans
 * `docs/product/api-simplification/platform.md` (« Suppression immédiate,
 * aucun consommateur, aucun alias ») — elle disparaît donc du manifeste lui
 * MÊME, pas seulement des catalogues dérivés.
 *
 * `route-manifest.json` reste la source de vérité de ce que le gateway SERT
 * (`services/gateway/CLAUDE.md` § « Le manifeste recense ce que Meeshy EXPOSE
 * comme API, pas tout ce que le gateway SERT ») : cette liste ne le modifie
 * pas, elle filtre seulement ce qui en dérive vers les catalogues CLIENT
 * (`api/endpoints.ts`, les énumérations Swift). `buildApiEndpointsCatalog()`
 * (`build-catalog.ts`) reste pure et ignorante de tout chemin particulier —
 * c'est cette liste-ci, et non elle, qui connaît des adresses.
 *
 * Consommée par LES DEUX générateurs (`scripts/generate-api-endpoints.ts`,
 * `scripts/generate-ios-endpoints.ts`) et par leurs cliquets respectifs
 * (`__tests__/endpoints-manifest-ratchet.test.ts`,
 * `__tests__/ios-endpoints-generated-ratchet.test.ts`), qui doivent filtrer
 * EXACTEMENT de la même façon que la régénération réelle — sans quoi le
 * cliquet comparerait un catalogue non filtré à un artefact commité filtré,
 * et rougirait pour la mauvaise raison.
 */

export type ManifestRouteInput = {
  readonly method: string;
  readonly path: string;
};

export type OpsOnlyRoute = ManifestRouteInput & {
  /** Pourquoi aucun client Meeshy ne doit jamais appeler cette adresse. */
  readonly reason: string;
};

export const OPS_ONLY_ROUTES: readonly OpsOnlyRoute[] = [
  {
    method: 'POST',
    path: '/api/v1/cleanup',
    reason:
      "`services/gateway/src/routes/maintenance.ts` — requireAdmin, décrite en OpenAPI " +
      "« Manually trigger cleanup of expired data […] for system administrators ».",
  },
  {
    method: 'GET',
    path: '/api/v1/stats',
    reason:
      "`services/gateway/src/routes/maintenance.ts` — requireAdmin, décrite en OpenAPI " +
      "« provides real-time monitoring data for system administrators ».",
  },
  {
    method: 'POST',
    path: '/api/v1/user-status',
    reason:
      "`services/gateway/src/routes/maintenance.ts` — requireAdmin, décrite en OpenAPI " +
      "« allows administrators to override the automatic status tracking for troubleshooting ».",
  },
  {
    method: 'GET',
    path: '/api/v1/test',
    reason:
      "`services/gateway/src/routes/translation.ts` — authentification ordinaire (pas " +
      "`requireAdmin`), mais déclenche un VRAI job de traduction sur le pipeline ML : un " +
      "point de santé du pipeline, jamais un écran d'app.",
  },
];

function routeKey(method: string, path: string): string {
  return `${method} ${path}`;
}

const OPS_ONLY_KEYS: ReadonlySet<string> = new Set(
  OPS_ONLY_ROUTES.map((route) => routeKey(route.method, route.path))
);

export function isOpsOnlyRoute(route: ManifestRouteInput): boolean {
  return OPS_ONLY_KEYS.has(routeKey(route.method, route.path));
}

/** Retire les routes d'exploitation d'une liste issue du manifeste — jamais l'inverse. */
export function filterOutOpsOnlyRoutes<T extends ManifestRouteInput>(
  routes: readonly T[]
): readonly T[] {
  return routes.filter((route) => !isOpsOnlyRoute(route));
}
