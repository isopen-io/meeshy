# Iteration 85 — Plan d'implémentation (2026-07-03)

## Objectifs
Fermer le TOCTOU d'amplification brute-force sur les compteurs de tentatives du reset SMS
(`PhonePasswordResetService.verifyIdentity` / `verifyCode`) via un consume atomique conditionnel,
sans changement de comportement observable hors concurrence.

## Modules affectés
- `services/gateway/src/services/PhonePasswordResetService.ts` (`verifyIdentity`, `verifyCode`)
- `services/gateway/src/__tests__/unit/services/PhonePasswordResetService.test.ts` (mock `updateMany`
  + régressions concurrence)

## Phases
1. **RED** — Ajouter `updateMany` au mock `makePrisma` (défaut `{ count: 1 }`). Réécrire le test
   « increments codeAttempts on invalid code » pour attendre le consume `updateMany({ where: { id,
   codeAttempts: { lt } }, data: { codeAttempts: { increment: 1 } } })`. Ajouter les régressions
   concurrence : `count === 0` ⟹ `max_attempts_exceeded` + révocation (code ET identité). Adapter les
   tests de plafond existants (`>= 5` / `>= 3`) pour piloter `updateMany → { count: 0 }`.
2. **GREEN** — Dans `verifyCode` : remplacer le garde `codeAttempts >= MAX` + l'increment de la
   branche invalide par un consume `updateMany` conditionnel placé avant la vérification du code ;
   `count === 0` ⟹ revoke+block. Idem `verifyIdentity` pour `identityAttempts`.
3. **REFACTOR** — Vérifier la cohérence des deux hooks (même idiome), commentaire doctrine.

## Dépendances
Aucune (MongoDB `updateMany` conditionnel déjà utilisé ailleurs dans le gateway).

## Risques estimés
FAIBLE. Voir analyse (risk assessment). Comportement observable préservé hors course.

## Stratégie de rollback
Revert du commit unique ; aucun changement de schéma/migration.

## Critères de validation
- Suite `PhonePasswordResetService` verte (dont régressions concurrence).
- Suites `password-reset` + `AuthService` vertes.
- Aucune signature publique modifiée.

## Statut d'achèvement
- [x] Analyse
- [x] Plan
- [x] RED (mock `updateMany` + régressions concurrence code/identité)
- [x] GREEN (consume atomique conditionnel `verifyCode` + `verifyIdentity`)
- [x] Validation (`PhonePasswordResetService` 66/66, `password-reset`+`AuthService` 138/138)
- [x] Commit + push

## Améliorations futures
F47 (cap affiliation, même consume conditionnel), F49/F50 (agrégats JSON RMW, auto-guéris).
