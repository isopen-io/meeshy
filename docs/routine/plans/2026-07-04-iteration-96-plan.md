# Iteration 96 — Plan d'implémentation (2026-07-04)

## Objectifs
Unifier la notification de réaction-commentaire sur le contrat `postType` complet
(`NotificationPostKind`) déjà porté par la sœur réaction-post — fin du collapse REEL/STATUS → POST
(F58). Nettoyer le backlog stale (F53/F54 soldés en it.89 ; F57 inerte).

## Modules affectés
- `packages/shared/utils/notification-strings.ts` — table `COMMENT_CONTEXT` (i18n) + branche
  `reaction.commentVerbose`.
- `services/gateway/src/services/notifications/NotificationService.ts` —
  `createCommentReactionNotification` (signature + body + metadata).
- `services/gateway/src/socketio/handlers/CommentReactionHandler.ts` — forward `post.type`.
- Tests : `packages/shared/__tests__/utils/notification-strings.test.ts`,
  `services/gateway/src/__tests__/unit/services/NotificationService.i18n.test.ts`,
  `services/gateway/src/__tests__/unit/socketio/CommentReactionHandler.test.ts`.

## Phases
1. **RED shared** — 4 cas neufs (REEL/STATUS/en + précédence postType>isStory). ✅
2. **GREEN shared** — `COMMENT_CONTEXT` → `ObjMap` (5×8) ; `kind = postType ?? (isStory?…)`. ✅
3. **GREEN gateway** — `createCommentReactionNotification` contrat `postType`, sans collapse ;
   `CommentReactionHandler` forwarde `post?.type`. ✅
4. **RED→GREEN gateway** — 4 tests neufs (body+metadata REEL/STATUS, fallback POST, forward handler). ✅
5. **Validation** — vitest shared, jest gateway (suites réaction/notif), tsc gateway+shared. ✅
6. **Docs** — analyse + plan + lessons + todo. ✅

## Dépendances
Prisma client généré (`packages/shared` generator `client`) + `bun run build` shared (parité CI).

## Risques estimés
FAIBLE. `postType` optionnel (repli POST) ; `isStory` conservé en fallback → aucune régression des
tests existants ; aucune migration ; les clients gèrent déjà REEL/STATUS via la sœur post-reaction.

## Stratégie de rollback
Diff borné à 3 fichiers de prod + 3 fichiers de test. Revert du commit unique restaure le
comportement `isStory`.

## Critères de validation
Voir « Validation criteria » de l'analyse — tous [x].
- vitest `notification-strings` : 28/28.
- jest gateway (`CommentReaction|reactionSpam|storycomments|SocialNotificationPrecision|i18n`) :
  198 + 30 verts.
- `tsc --noEmit` gateway + shared : 0 erreur.

## Statut de complétion
**COMPLÉTÉ** — F58 soldé. Backlog nettoyé (F53/F54 retirés, F57 clos).

## Progress tracking
- [x] Analyse + plan écrits.
- [x] Implémentation shared + gateway.
- [x] Tests neufs verts, 0 régression.
- [x] Typecheck propre.
- [ ] Commit + push + (merge main).

## Améliorations futures
- F51b (docs notifications), F56b (likeCount absolu gateway), F59 (comment_like vs comment_reaction).
