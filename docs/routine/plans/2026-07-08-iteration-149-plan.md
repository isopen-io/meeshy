# Iteration 149 — Plan d'implémentation (2026-07-08)

## Objectives
Corriger F116 : le re-fetch de broadcast du `POST /posts/:postId/view` omet le viewer, ce qui
applique le filtre de visibilité PUBLIC-seul et supprime l'événement `story:viewed` temps-réel
pour toutes les stories non-PUBLIC.

## Affected modules
- `services/gateway/src/routes/posts/interactions.ts` (1 ligne source).
- `services/gateway/src/__tests__/unit/routes/posts/interactions.test.ts` (test de régression).

## Implementation phases
1. **RED** — Ajouter un test asserting `getPostById` appelé avec `(POST_ID, USER_ID)` sur
   `POST /posts/:id/view` d'une story. Échoue sur le code courant (`getPostById(postId)` sans viewer).
2. **GREEN** — `interactions.ts`: `getPostById(postId)` → `getPostById(postId, viewerId)`.
3. **REFACTOR** — Commentaire expliquant l'alignement viewer avec `recordView`.

## Dependencies
Aucune. `viewerId` déjà en scope (`interactions.ts:258`).

## Estimated risks
Très faibles. Comportement PUBLIC / self-view inchangé. Voir Risk assessment de l'analyse.

## Rollback strategy
Revert du commit unique. Aucune migration, aucun changement de schéma/signature.

## Validation criteria
- [x] Test de régression ajouté (assert viewer passé à `getPostById`).
- [ ] `bun run test` de la suite `interactions.test.ts` verte localement.
- [ ] CI verte après push.

## Completion status
- [x] Analyse rédigée (`docs/routine/analyses/2026-07-08-iteration-149-analyse.md`).
- [x] Fix source appliqué.
- [x] Test de régression ajouté.
- [ ] Validation locale (bloquée sur `bun install` du monorepo — en cours).
- [ ] Push + PR.

## Progress tracking
- Fan-out Explore (gateway + web) → F116 retenu, F67 écarté (déjà tranché iter 101).

## Future improvements
- **F116b** (perf) : éliminer le double-fetch sur `POST /view` en faisant retourner à `recordView`
  le minimum (type/authorId/viewCount). Refactor de signature — itération dédiée.
