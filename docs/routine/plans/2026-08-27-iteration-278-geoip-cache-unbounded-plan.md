# Plan — Itération 278 : borner le cache GeoIP + planifier sa purge

## Objectifs
Fermer la fuite mémoire du cache GeoIP du gateway (dimension 3 — optimisation
mémoire) : le cache ne doit JAMAIS croître sans borne, et ses entrées expirées
doivent être RENDUES au lieu d'être seulement ignorées à la lecture.

## Modules affectés
- `services/gateway/src/services/GeoIPService.ts` (production)
- `services/gateway/src/jobs/geo-cache-cleanup.ts` (production, neuf)
- `services/gateway/src/jobs/index.ts` (production — câblage)
- `services/gateway/src/__tests__/unit/services/GeoIPService.bound.test.ts` (neuf)
- `services/gateway/src/__tests__/unit/jobs/geo-cache-cleanup.test.ts` (neuf)
- `services/gateway/src/__tests__/unit/jobs/background-jobs-manager.test.ts` (étendu)

## Phases
1. **RED** — écrire les deux suites neuves (plafond du cache, job de purge) et
   étendre la suite manager ; prouver le rouge (exports/module manquants).
2. **GREEN** — `MAX_GEO_CACHE_ENTRIES` + éviction FIFO `rememberGeo` +
   `geoCacheSize()` + `cleanGeoCache(): number` ; `GeoCacheCleanupJob` ;
   câblage `BackgroundJobsManager`.
3. **REFACTOR/VALIDATION** — `tsc --noEmit`, suites jobs+GeoIP complètes,
   contre-épreuve sous mutation (éviction retirée).

## Dépendances
Aucune externe. Réutilise le patron de job existant (`MutationLogCleanupJob`,
`DeliveryQueueCleanupJob`) et l'infrastructure `BackgroundJobsManager`.

## Risques estimés
Faibles. Éviction bornée au plafond seulement ; purge inchangée dans son
invariant (n'ôte que l'expiré) ; changement de signature `void → number`
rétro-compatible.

## Stratégie de rollback
Revert du commit : le cache retombe sur son comportement antérieur (non borné,
purge non planifiée). Aucun état persistant, aucune migration à défaire.

## Critères de validation
- 4 tests de plafond + 13 tests de job verts.
- 221/221 verts sur jobs + GeoIP ; `tsc` à 0 erreur.
- Contre-épreuve : invariant du plafond tombe sous `set` non borné.

## Statut de complétion
LIVRÉ — implémentation, tests, contre-épreuve et typecheck faits dans cette
itération.

## Suivi / améliorations futures
- Map anti-spam mentions évincée par insertion plutôt que par activité (même
  famille borne-mémoire) — candidat itération 279.
- TOCTOU du cap de réaction (hérité du suivi 277).
