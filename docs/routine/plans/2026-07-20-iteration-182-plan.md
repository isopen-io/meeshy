# Plan — Iteration 182 : brancher le garde de visibilité de `CommentReactionHandler`

## Objectifs
Fermer la frontière d'autorisation « interagir ⊆ voir » sur les réactions de
commentaires : brancher le garde `_canUserViewPost` (aujourd'hui code mort) dans
les trois handlers socket, en résolvant le post autoritatif depuis le `commentId`.

## Modules affectés
- `services/gateway/src/socketio/handlers/CommentReactionHandler.ts` (prod)
- `services/gateway/src/socketio/handlers/__tests__/CommentReactionHandler.test.ts` (tests)

Aucun autre fichier. `postVisibility.ts` (`canUserViewPost`) et le service de
réaction restent inchangés.

## Phases
1. **RED** — Ajouter dans le test :
   - `makePrisma` : `postComment.findUnique` renvoie par défaut un `post` visible
     (`{ authorId, visibility: 'PUBLIC', visibilityUserIds: [], deletedAt: null }`)
     en plus de `authorId`/`content` (le même mock sert le garde + la notif).
   - Référence au mock `canUserViewPost` via `require` pour le piloter par test.
   - Par handler (add/remove/sync) : test refus `Forbidden` (canUserViewPost→false,
     service non appelé) + test refus `Comment not found` (post absent/`deletedAt`).
2. **GREEN** — Implémenter :
   - Helper privé `_assertCommentPostViewable(commentId, userId)` →
     `{ allowed: true } | { allowed: false; error }`.
   - Câbler dans les 3 handlers après rate-limit, avant l'appel service.
3. **REFACTOR** — Vérifier qu'aucune duplication n'est introduite ; le helper
   centralise la résolution+garde (appelé 3×).

## Dépendances
Prérequis test CI : `prisma generate --generator client` + `shared build` (faits).

## Risques estimés
Faible. Seul un utilisateur non autorisé change de comportement (Forbidden). Les
happy-paths existants restent verts grâce au `post` visible par défaut dans le mock.

## Stratégie de rollback
Révoquer le commit : le garde étant additif et isolé à un fichier, aucun état
persistant ni migration. `git revert` suffit.

## Critères de validation
- `CommentReactionHandler.test.ts` vert (nouveaux + préexistants).
- `type-check` gateway : 0 nouvelle erreur.

## Statut de complétion
- [x] RED — tests de refus ajoutés (7 nouveaux : Forbidden + Comment not found ×3 handlers + résolution autoritative)
- [x] GREEN — helper `_assertCommentPostViewable` + câblage 3 handlers
- [x] Validation — `CommentReactionHandler.test.ts` **34/34** vert ; gateway `tsc --noEmit` exit 0 (0 erreur sur les fichiers touchés)
- [x] Commit + push

## Progress tracking
Terminé. `CommentReactionHandler.test.ts` : 27 préexistants + 7 nouveaux = 34/34.
`_canUserViewPost` (auparavant code mort) est désormais l'unique point d'appel du
garde, atteint par les trois handlers via `_assertCommentPostViewable`.
Note environnement : `bunx eslint` échoue (ESLint 10 vs config legacy `.eslintrc`
du repo) — mismatch d'outillage pré-existant, sans rapport avec le diff ; la CI
utilise sa toolchain épinglée.

## Améliorations futures
- Trancher le garde add/sync de `PostReactionHandler` (backlog analyse).
- Cap 200 de la recherche in-conversation (backlog analyse).
