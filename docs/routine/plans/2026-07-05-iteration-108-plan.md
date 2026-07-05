# Iteration 108 — Plan d'implémentation (2026-07-05)

## Objectives
Corriger **F77** : `CircuitBreaker` (`services/gateway/src/utils/circuitBreaker.ts`) n'implémentait pas
`failureWindowMs` (documenté « Time window for counting failures » et configuré par toutes les
factories). Des échecs dispersés au-delà de la fenêtre s'accumulaient et ouvraient parasitairement le
disjoncteur. Implémenter une fenêtre fixe ancrée au premier échec du cycle.

## Affected modules
- `services/gateway/src/utils/circuitBreaker.ts` — classe `CircuitBreaker` (`onFailure`,
  `transitionToClosed`, nouveau champ `failureWindowStart`).
- `services/gateway/src/__tests__/unit/utils/circuitBreaker.test.ts` — 3 tests de fenêtre.
- Consommateurs (héritent automatiquement, non modifiés) : `services/gateway/src/services/CacheStore.ts`
  (Redis), `services/gateway/src/services/PushNotificationService.ts` (FCM/APNs).

## Implementation phases
1. **Champ** — `private failureWindowStart?: number`. ✅
2. **`onFailure`** — fenêtre fixe : si `failureCount === 0` ou `now - failureWindowStart >
   failureWindowMs`, démarrer une nouvelle fenêtre (`failureWindowStart = now`, `failureCount = 1`) ;
   sinon incrémenter. ✅
3. **`transitionToClosed`** — reset `failureWindowStart = undefined`. ✅
4. **Tests** — 3 cas neufs (dispersés > fenêtre ne s'accumulent pas ; dispersés < fenêtre ouvrent ;
   compteur reset à l'expiration). ✅
5. **Validation** — `bun run test:unit -- circuitBreaker.test.ts` : 80/80. ✅

## Dependencies
Aucune. Aucun changement d'API publique.

## Estimated risks
Très faible. Comportement identique sur rafales (tous les tests existants déclenchent dans un seul
tick). Seul changement : échecs séparés de plus de `failureWindowMs` ne s'accumulent plus.

## Rollback strategy
Trivial : retirer le champ + restaurer `this.failureCount++`. Un seul fichier de prod, aucun état
persistant, aucune migration.

## Validation criteria
- [x] 77 tests existants inchangés + 3 neufs = 80/80 (bun/jest).
- [x] Aucun changement de signature/contrat ; `CacheStore`/`PushNotificationService` héritent du fix.

## Completion status
**COMPLET.** Fix + tests + docs. Prêt à commit/push.

## Progress tracking
- [x] Analyse (`2026-07-05-iteration-108-analyse.md`).
- [x] Plan (ce fichier).
- [x] Fix `circuitBreaker.ts`.
- [x] Tests `circuitBreaker.test.ts`.
- [x] `bun run test:unit` vert (80/80).
- [ ] Commit + push branche `claude/brave-archimedes-fru31a`.
- [ ] PR + merge.

## Future improvements
- **F78** (LOW-MEDIUM) : `buildAttachmentUrl` ne corrige que l'hôte exact `meeshy.me` (pas `www.`) et
  drop query/hash — impact conditionnel à l'existence de telles URLs en prod.
