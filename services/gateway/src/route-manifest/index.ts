/**
 * Point d'entrée public du collecteur de routes (#4276). Trois consommateurs,
 * une seule implémentation : `src/__tests__/security/route-auth-coverage.test.ts`
 * (le montage vivant, `buildAssembledApp`), `scripts/generate-route-manifest.ts`
 * et `src/__tests__/security/route-manifest-ratchet.test.ts` (l'artefact,
 * `buildRouteManifest`). Voir `collect.ts` pour le détail et le POURQUOI.
 */
export {
  buildAssembledApp,
  buildRouteManifest,
  type CollectedRoute,
  type ManifestRoute,
  type RouteManifestArtifact,
  type SecurityLevel,
  type SecurityTier,
} from './collect';
