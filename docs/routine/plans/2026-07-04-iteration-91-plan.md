# Iteration 91 — Plan d'implémentation (2026-07-04)

## Objectifs
Aligner le chemin socket de notification de réaction sur le chemin REST : forwarder le vrai
`postType` + le contexte éphémère (`postPreview`/`postCreatedAt`/`postExpiresAt`) au lieu de hardcoder
`postType: 'POST'`.

## Modules affectés
- `services/gateway/src/socketio/handlers/PostReactionHandler.ts` (prod, 1 méthode).
- `services/gateway/src/__tests__/unit/socketio/PostReactionHandler.test.ts` (test, +1 cas).

## Phases d'implémentation
1. **RED** — ajouter `test_handleAddReaction_reactionOnStory_forwardsRealTypeAndEphemeralContext` :
   `findUnique` mocké renvoie `{ type: 'STORY', content, createdAt, expiresAt }` ; asserte que
   `createPostLikeNotification` reçoit `postType: 'STORY'` + les 3 champs éphémères. ✅ (échoue :
   reçoit `postType: 'POST'`).
2. **GREEN** — élargir le `select` (`type`/`content`/`createdAt`/`expiresAt`) et forwarder les 4
   champs en miroir de `routes/posts/interactions.ts:104-113`. ✅
3. **REFACTOR** — commentaire inline expliquant le miroir REST ; aucune autre extraction nécessaire.

## Dépendances
Aucune (mutation isolée, pas de nouvelle dépendance, pas de migration).

## Risques estimés
TRÈS FAIBLE. Comportement inchangé pour un POST. Champs éphémères `undefined`-safe.

## Stratégie de rollback
Revert du commit unique (1 fichier prod + 1 fichier test). Aucun état persistant modifié.

## Critères de validation
- [x] Test neuf RED→GREEN prouvé (stash de la prod → échoue ; pop → passe).
- [x] 2 suites `PostReactionHandler` : 63/63 verts.
- [x] `Reaction|interactions|NotificationService.reactionSpam|posts-engagement` : 671/671 verts.
- [x] `tsc --noEmit` : 0 nouvelle erreur.

## Statut de complétion
✅ COMPLET — implémenté, validé, prêt à merger.

## Suivi de progression
- [x] Analyse rédigée (`2026-07-04-iteration-91-analyse.md`).
- [x] Fix implémenté.
- [x] Tests RED→GREEN.
- [x] Régression suites voisines vérifiée.
- [x] Leçon 62 ajoutée.
- [ ] Commit + push + PR.

## Améliorations futures
- F55/F56/F57 (web reels desync, likeCount self-count, hasMentions Unicode) — cf. analyse.
- F51 (FirebaseNotificationService dead code).
