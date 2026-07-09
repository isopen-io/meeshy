# Iteration 152 — Plan d'implémentation

## Objectifs
Mapper le garde de domaine « max 1 réaction » (atteignable via iOS REST) vers un
**HTTP 409 CONFLICT** typé au lieu d'un **500 INTERNAL_ERROR**, sans changer la sémantique
`max 1`.

## Modules affectés
- `services/gateway/src/services/PostReactionService.ts` — throw `ConflictError` typé.
- `services/gateway/src/routes/posts/interactions.ts` — mapping `ConflictError → 409`.
- Tests : `__tests__/unit/services/PostReactionService.test.ts`,
  `__tests__/unit/routes/posts/interactions.test.ts`.

## Phases
1. **RED** — Ajouter test route (409 attendu, actuellement 500) + test service (ConflictError
   typé attendu, actuellement `Error` nu). ✅
2. **GREEN** —
   - `PostReactionService.addReaction` : `throw new ConflictError(msg, 'REACTION_LIMIT_REACHED')`. ✅
   - `interactions.ts` POST /like catch : `if (error instanceof ConflictError) return sendConflict(...)`. ✅
3. **VALIDATION** — Suites gateway ciblées vertes ; pas de régression sur le chemin socket
   (lit `error.message`, inchangé) ni sur le test `.rejects.toThrow('Maximum 1 ...')`.

## Dépendances
Aucune (utilise `ConflictError` existant de `errors/custom-errors.ts` + `sendConflict` de
`utils/response.ts`).

## Risques estimés
Très faibles. Message d'erreur préservé → tous les consommateurs par message restent valides.

## Stratégie de rollback
Revert du commit — 2 fichiers de prod, 2 fichiers de test. Aucune migration, aucun état
persistant touché.

## Critères de validation
- `interactions.test.ts` : nouveau cas 409 vert.
- `PostReactionService.test.ts` : nouveau cas ConflictError vert + ancien cas throw vert.

## Statut de complétion
- [x] RED tests écrits
- [x] GREEN implémenté
- [x] Validation suites gateway (`PostReactionService` + `interactions` : 174 verts ;
      `PostService`/`PostReactionHandler`/`error-format` : 159 verts ; `tsc --noEmit` OK)
- [x] Commit + push

## Améliorations futures
- Option A (swap réaction post/comment comme les messages) — nécessite décision produit.
- Étendre le retypage `ConflictError` au chemin comment si un 500 REST équivalent est exposé.
