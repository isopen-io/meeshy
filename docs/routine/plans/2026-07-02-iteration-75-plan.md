# Iteration 75 — Plan d'implémentation (2026-07-02)

## Objectifs
Éliminer la fuite de timer de l'idiome `Promise.race([op, setTimeout-reject])` recopié dans 3 sites
du gateway, en introduisant une source unique testée `withTimeout` qui annule toujours le timer.

## Modules affectés
- `services/gateway/src/utils/with-timeout.ts` (nouveau — SSOT)
- `services/gateway/src/utils/__tests__/with-timeout.test.ts` (nouveau — 7 cas, TDD)
- `services/gateway/src/services/zmq-translation/ZmqRequestSender.ts` (hot path)
- `services/gateway/src/services/notifications/FirebaseNotificationService.ts` (+ type `MulticastResponse`)
- `services/gateway/src/utils/circuitBreaker.ts`

## Phases
1. **RED** — Écrire `with-timeout.test.ts` (resolve/reject transparents, timeout défaut + custom,
   0 timer résiduel sur les 3 issues via `jest.getTimerCount()`).
2. **GREEN** — Implémenter `withTimeout<T>` : `Promise.race` + `finally { clearTimeout }`.
3. **Adoption** — Convertir les 3 sites, message d'origine préservé pour assertions/logs.
4. **Type-safety** — Typer le résultat multicast Firebase (`MulticastResponse`) car `admin` est `any`.
5. **Validation** — `jest` sur les 5 suites + `tsc --noEmit` filtré sur les fichiers touchés.

## Dépendances
Aucune (helper autonome, imports relatifs internes au gateway).

## Risques estimés
Faible — sémantique identique à `Promise.race`, messages inchangés. Seul ajout : `clearTimeout`.

## Stratégie de rollback
Revert du commit : les 3 sites reviennent à l'idiome inline, helper + test supprimés. Isolé.

## Critères de validation
- [x] 213/213 tests verts (with-timeout 7, circuitBreaker 77, Firebase + Zmq 129).
- [x] `jest.getTimerCount() === 0` après resolve, reject et timeout.
- [x] Messages d'erreur préservés (assertions existantes vertes).
- [x] `tsc --noEmit` : 0 erreur neuve (résidu prisma-client environnemental uniquement).

## Statut de complétion
**COMPLÉTÉ** — implémenté, testé, typé, prêt à merger.

## Suivi / améliorations futures
- Étendre `withTimeout` aux futurs sites de timeout (convention gateway).
- Consignés inchangés : F32-humain, F31, F2 (cf. analyse iter 75).
