# Iteration 167 — Plan d'implémentation (2026-07-11)

## Objectifs
Appliquer l'invariant « max 1 réaction distincte par user par commentaire » sur le chemin
REST `PostCommentService.likeComment`, à parité avec le chemin socket
`CommentReactionService.addReaction` et le modèle canonique `ReactionService` (remplace).

## Modules affectés
- `services/gateway/src/services/PostCommentService.ts` — `likeComment` (prod).
- `services/gateway/src/__tests__/unit/services/PostCommentService.test.ts` — 3 tests (RED→GREEN).

## Phases
1. **RED** — Ajouter `describe('PostCommentService.likeComment')` : purge multi-emoji,
   idempotence same-emoji, comment absent. ✅
2. **GREEN** — Insérer `deleteMany({ where: { commentId, userId, emoji: { not: emoji } } })`
   avant l'`upsert` dans `likeComment`. ✅
3. **REFACTOR** — Documenter l'invariant + rationale « remplace / fallback sûr » en commentaire. ✅
4. **VALIDATION** — jest ciblé + suites voisines + tsc. ✅

## Dépendances
Aucune nouvelle. Réutilise `commentReaction.deleteMany` (Prisma) et `syncCommentLikeCounters`
existant.

## Risques estimés
Très faibles. Purge bornée au `(commentId, userId)` et aux emojis ≠ demandé ; no-op sur le cas
fallback ❤️/❤️. Aucun changement d'API/schéma/signature.

## Stratégie de rollback
Revert du commit unique. Fonction pure côté service, pas de migration ni d'état à défaire.

## Critères de validation
- 3 nouveaux tests verts (dont 1 RED-avant-fix).
- Suites `PostCommentService.test.ts` + `comments-like-delete.test.ts` + `comments.test.ts`
  vertes (106 tests) — **atteint**.
- Aucune nouvelle erreur tsc imputable à `PostCommentService.ts` — **atteint**
  (seul résidu `@meeshy/shared` non résolu par tsc, environnemental, pré-existant).

## Statut de complétion
✅ Terminé. Fix + tests + docs. Prêt à merger dans `main`.

## Suivi / améliorations futures
- Harmoniser la sémantique de switch d'emoji des commentaires (socket rejette vs REST remplace).
- Backlog web réaction cross-session (Participant ID vs User ID) — cross-couche, futur cycle.
