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

---

# Iteration 85 — Plan d'implémentation (2026-07-03)

## Objectives
Unifier le filtrage de visibilité de `PostFeedService.getFeed` et `getUserPosts` sur la SSOT
`buildVisibilityFilter`, fermant (a) une fuite de posts FRIENDS dans le feed principal et
(b) la sous-diffusion des posts FRIENDS aux amis sur le profil.

## Affected modules
- `services/gateway/src/services/PostFeedService.ts` (`getFeed`, `getUserPosts`)
- `services/gateway/src/__tests__/unit/services/PostFeedService.visibility.test.ts` (tests)
- `docs/routine/analyses/2026-07-03-iteration-85-analyse.md`
- `docs/routine/plans/2026-07-03-iteration-85-plan.md`
- `tasks/lessons.md` (Leçon 56)

## Implementation phases
1. **RED** — 5 tests neufs dans `PostFeedService.visibility.test.ts` : getFeed gate FRIENDS aux
   contacts + sert PUBLIC/own/COMMUNITY ; getUserPosts ami → FRIENDS, anonyme → PUBLIC, self → tout.
   (3 échouent contre le code buggé, 2 passent déjà — anonyme/self inchangés.)
2. **GREEN** — `getFeed` : fetch social graph avant la requête, `buildVisibilityFilter` composé sous
   `AND` (visibilityFilter + expiry + cursor) ; retrait de `friendIds` du `Promise.all` post-requête
   (déjà résolu). `getUserPosts` : branche anonyme/self/non-self via `buildVisibilityFilter`.
3. **VALIDATE** — suites posts-feed complètes + tsc.

## Dependencies
Aucune. Changement autonome, disjoint de toutes les PR ouvertes (#1367/#1370/#1372/#1373/#1374/#1376).

## Estimated risks
FAIBLE. Resserre une fuite + élargit une sous-diffusion, deux directions correctes. Helpers de
contacts/co-membres dégradent en `[]`. Pas de migration, pas de changement de schéma, pas de
signature publique modifiée.

## Rollback strategy
Revert du commit unique. Aucun effet de bord persistant (changement de clause `where` runtime).

## Validation criteria
- [x] `getFeed` gate FRIENDS `authorId ∈ contacts` (plus de `visibility: { in }` plat).
- [x] `getUserPosts` ami voit FRIENDS ; anonyme → PUBLIC ; self → tout.
- [x] 7/7 `PostFeedService.visibility`, 220/220 suites posts-feed, 0 nouvelle erreur tsc.

## Completion status
COMPLETED — implémenté, testé, validé. Prêt à commit/push.

## Progress tracking
- [x] Phase 1 RED
- [x] Phase 2 GREEN
- [x] Phase 3 VALIDATE
- [x] Docs analyse + plan + lesson

## Future improvements
- **F51 (mineur)** : `routes/posts/interactions.ts` — `POST /posts/:postId/impression` et
  `/posts/impressions/batch` écrivent `postImpression` + `increment impressionCount`/`postOpenCount`
  sans vérifier l'existence/visibilité du post (pas de FK MongoDB) → un client peut gonfler les
  analytics d'IDs arbitraires. Intégrité analytique (impact bas), unit-testable. Candidat prochain
  cycle.
- **F49/F50** : résidus lost-update basse sévérité (cache TTL self-healed / agrégats JSON
  `recompute()`-corrected). Rendement décroissant.
