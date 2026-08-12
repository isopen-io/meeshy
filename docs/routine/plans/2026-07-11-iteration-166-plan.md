# Iteration 166 — Plan d'implémentation (2026-07-11)

## Objectifs
Corriger `resolveContentRoute` (`apps/web/utils/notification-helpers.ts`) pour router
`friend_story_comment` — et toute variante de type story dont le préfixe n'est pas `story_` — vers
`/story` au lieu de `/post`, en remplaçant `startsWith('story')` par `includes('story')`.

## Modules affectés
- `apps/web/utils/notification-helpers.ts` — fonction `resolveContentRoute` (1 ligne de prod +
  commentaire d'intention).
- `apps/web/__tests__/utils/notification-helpers.test.ts` — 3 tests ajoutés au `describe`
  `getNotificationLink - cibles sociales`.

## Phases d'implémentation
1. **RED** — Ajouter le test « `friend_story_comment` sans metadata → `/story/s3#comment-c3` »
   (échec attendu : `/post/s3#comment-c3`) + tests de non-régression `story_new_comment` et
   `story_thread_reply`.
2. **GREEN** — Remplacer `type === FRIEND_NEW_STORY || type.startsWith('story')` par
   `type.includes('story')`. Réexécuter → vert.
3. **REFACTOR** — La condition explicite `FRIEND_NEW_STORY` devient redondante
   (`'friend_new_story'.includes('story')`) et est supprimée dans le même geste.

## Dépendances
Aucune. Fonction pure, pas de nouvelle dépendance.

## Risques estimés
Très faibles. Aucun type de l'enum ne contient `story` sans être une story → pas de sur-match.
Branches metadata et mood évaluées avant, priorité inchangée.

## Stratégie de rollback
Revert du commit unique. Aucune migration, aucun état persistant impacté.

## Critères de validation
- `npx jest __tests__/utils/notification-helpers.test.ts` → 84/84 vert.
- `npx jest __tests__/hooks/queries/use-notifications-manager-rq.test.tsx` → 3/3 vert.

## Statut de complétion
✅ Implémenté et validé (81+3 = 84 tests verts ; consumer 3/3 vert).

## Suivi progression
- [x] RED — 3 tests ajoutés
- [x] GREEN — `includes('story')`
- [x] REFACTOR — suppression de la condition redondante
- [x] Validation locale (jest)

## Améliorations futures
- Réaction cross-session (Participant ID vs User ID) — enrichir `ReactionUpdateEventData.userId`.
- `PostCommentService.likeComment` REST — appliquer l'invariant max-1-réaction du path socket.
