# Plan itération 163 — Réactiver la suppression de légende REST (AJV body schema)

## Objectives
Rendre la fonctionnalité « edit à contenu vide sur message avec pièces jointes »
réellement fonctionnelle sur le chemin REST `PUT /conversations/:id/messages/:messageId`,
en corrigeant le schéma AJV `schema.body` qui la court-circuitait avant le handler.

## Affected modules
- `services/gateway/src/routes/conversations/messages-advanced.ts` (route edit)
- `services/gateway/src/__tests__/unit/routes/edit-message-body-schema.test.ts` (nouveau)

## Implementation phases
1. **Extraction + fix** — sortir le schéma AJV du body dans
   `export const editMessageBodyJsonSchema`, remplacer `minLength: 1` par
   `maxLength: 10000` (miroir de `EditMessageBodySchema` Zod), référencer la
   constante dans `schema.body`. ✅
2. **Régression fidèle** — nouveau test inject sur un vrai Fastify utilisant la
   constante exportée : contenu vide accepté (200), > 10 000 rejeté (400), = 10 000
   accepté (200), clé `content` manquante rejetée (400). ✅
3. **Non-régression** — `conversation-messages-advanced` (101/101) + `tsc`. ✅

## Dependencies
Aucune. S'appuie sur le fix handler déjà livré par #1803.

## Estimated risks
Faible — retrait d'une contrainte min, borne max + `required` conservés, garde
`hasAttachments` du handler inchangé.

## Rollback strategy
Revert du commit : restaurer `minLength: 1` inline et supprimer le test. Aucune
migration, aucun état persistant touché.

## Validation criteria
- RED vérifié (minLength:1 → 2 cas en échec).
- GREEN : 5/5 nouveau test, 101/101 suite existante, tsc propre.

## Completion status
- [x] Phase 1 — extraction + fix
- [x] Phase 2 — test inject de régression
- [x] Phase 3 — non-régression + typecheck
- [x] Docs analyse + plan
- [ ] Commit + push branche `claude/brave-archimedes-lvnleg`

## Progress tracking
Itération 163. Départ : `main` @ `5541e8c`. Cible : parité REST/socket caption removal.

## Future improvements
- Nettoyer les `CommentReaction` orphelines dans `PostCommentService.deleteComment`
  (appeler `deleteCommentReactions` sur le sous-arbre soft-deleted).
- Auditer les autres routes dont le `schema.body` AJV et le re-parse Zod interne
  divergent (risque de branches mortes similaires).
# Iteration 163 — Plan d'implémentation (2026-07-10)

## Objectifs
Fermer la fuite de confidentialité F123 : `createStoryCommentNotificationsBatch` doit filtrer les
buckets fan-out (thread + amis) selon la visibilité du post commenté, exactement comme le broadcast
temps réel et `createFriendContentNotificationsBatch`.

## Modules affectés
- `services/gateway/src/services/notifications/NotificationService.ts`
  (`createStoryCommentNotificationsBatch`).
- `services/gateway/src/routes/posts/comments.ts` (call site du fan-out).
- `services/gateway/src/__tests__/unit/services/NotificationService.storycomments.test.ts` (tests).

## Phases d'implémentation
1. **RED** — 6 tests visibilité (ONLY allow/deny, EXCEPT, PRIVATE, ONLY gate thread bucket,
   COMMUNITY co-members, default backward-compat). Ajout du mock `communityMember`.
2. **GREEN** —
   - Ajout params `visibility?: string` / `visibilityUserIds?: string[]` (défaut PUBLIC / []).
   - Prédicat `canSeePost` miroir de `SocialEventsHandler.getVisibilityFilteredRecipients`.
   - Dérivation `friendAudience` (COMMUNITY ⇒ co-membres ; sinon `friendIds.filter(canSeePost)`)
     et `engagedAudience` (`previousCommenterIds.filter(canSeePost)`).
   - Boucles buckets 2 & 3 itèrent les audiences filtrées ; `langs` recalculé sur ces audiences.
   - Call site : passer `post.visibility ?? 'PUBLIC'` et `post.visibilityUserIds ?? []`.
3. **REFACTOR** — aucun (logique déjà minimale et alignée sur le sibling).

## Dépendances
`getCommunityCoMemberIds` (`../posts/communityVisibility`) — déjà importé.

## Risques estimés
Faible. Rétro-compatible (défaut PUBLIC ⇒ pas de filtrage). Pas de migration, contrat inchangé.

## Stratégie de rollback
Revert du commit (3 fichiers, additif). Aucun état persistant modifié.

## Critères de validation
- RED vérifié (5/6 nouveaux tests échouent sans le filtre).
- GREEN : 66/66 storycomments, 85/85 avec SocialNotificationPrecision, 40/40 route commentaire.
- `tsc --noEmit` : 0 erreur (après build de `packages/shared`).

## Statut de complétion
✅ Complété — implémenté, testé (RED→GREEN), typecheck propre.

## Suivi de progression
- [x] Analyse rédigée (`2026-07-10-iteration-163-analyse.md`).
- [x] Tests RED ajoutés + prouvés.
- [x] Fix GREEN implémenté.
- [x] Typecheck + suites de tests verts.
- [ ] Commit + push + PR.

## Améliorations futures (backlog issu de ce cycle)
- **web** — `computeStoryDurationMs` : lire `t.text ?? t.content` (alias legacy) — bug réel non masqué.
- **web** — `resolveContentRoute` : `friend_story_comment` → `/story` (latent, masqué par metadata).
- **gateway** — `PostCommentService.likeComment` : appliquer le max-1 réaction/user du path socket.
