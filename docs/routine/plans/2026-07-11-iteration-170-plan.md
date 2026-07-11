# Iteration 170 — Plan d'implémentation (F129)

## Objectifs
Dériver l'état « liké » d'un commentaire de sa propre donnée réactive (`currentUserReactions`) au
lieu d'un `Set` externe jamais peuplé. Fixe le re-like infini (Reels) et le cœur creux permanent
(détail post). Consolide « hearted-by-me » en une source unique réutilisée par posts, reels et
commentaires.

## Modules affectés
- `apps/web/lib/reactions.ts` (nouveau) — `HEART_EMOJI` + `isHeartLikedByMe()` purs.
- `apps/web/components/v2/CommentList.tsx` — dérivation `isLiked`.
- `apps/web/components/v2/CommentThread.tsx` — dérivation `isLiked` (replies).
- `apps/web/components/feed/ReelsFeedScreen.tsx` — `isReelLiked` via helper (dédup).
- `apps/web/app/feeds/post/[postId]/page.tsx` — inline hearted → helper (dédup).
- `apps/web/hooks/queries/use-comment-mutations.ts` — `HEART_EMOJI` importé du helper (dédup).

## Phases
1. **RED** — `apps/web/__tests__/lib/reactions.test.ts` (helper) + régression `CommentList`
   (onUnlike quand le commentaire porte ❤️). Vérifier l'échec.
2. **GREEN** — créer `lib/reactions.ts` ; dériver `isLiked` dans `CommentList`/`CommentThread`.
3. **REFACTOR/dédup** — brancher `ReelsFeedScreen`, détail post, et la const de mutation sur le
   helper. Vérifier verts + `tsc`.

## Dépendances
Aucune nouvelle dépendance. Le helper est pur (pas de React/query).

## Risques estimés
Faible — override `likedCommentIds` conservé (union), contrats mutation/socket inchangés.

## Stratégie de rollback
Révert du commit ; les composants retombent sur le `Set` vide (comportement pré-fix).

## Critères de validation
- Suites `reactions`, `comment-components`, `comment-thread` vertes.
- `tsc --noEmit` propre sur les fichiers touchés.
- Aucune régression des tests de mutation de commentaires.

## Statut de complétion
- [x] Phase 1 RED — `reactions.test.ts` (suite absente) + `CommentList` « onUnlike au heart » échoue.
- [x] Phase 2 GREEN — `lib/reactions.ts` créé ; `isLiked` dérivé dans `CommentList`/`CommentThread`.
- [x] Phase 3 dédup — `ReelsFeedScreen.isReelLiked`, inline détail post, const `HEART_EMOJI` de
      `use-comment-mutations` branchés sur le helper. Bonus : suppression du typo pré-existant
      `_postId` dans `CommentThread` (1 erreur tsc en moins).
- [x] Validation — 54/54 tests verts (reactions, comment-components, comment-thread,
      story-viewer-comments, use-comment-mutations) ; `tsc --noEmit` propre sur les 6 fichiers
      production touchés (erreurs restantes = pré-existantes, fichiers `__tests__/*` non touchés).

## Améliorations futures
- Supprimer le prop `likedCommentIds` (câblage mort) une fois le helper adopté partout.
