# Iteration 97 — Plan d'implémentation (2026-07-04)

## Objectifs
Fermer **F59** : le type de notification `comment_reaction` (chemin socket) doit honorer la même
préférence utilisateur `commentLikeEnabled` que son sibling REST `comment_like`, éliminant un
contournement de l'opt-out utilisateur selon le transport.

## Modules affectés
- `services/gateway/src/services/notifications/NotificationService.ts` — méthode `isTypeEnabled`.
- `services/gateway/src/__tests__/unit/services/notifications/SocialNotificationPrecision.test.ts`
  — 2 tests neufs.

## Phases d'implémentation
1. **RED** — écrire le test « `createCommentReactionNotification` respecte `commentLikeEnabled:false`
   → aucune notif » + le pendant positif. Prouver l'échec sans le fix (notif émise). ✅
2. **GREEN** — ajouter `case 'comment_reaction':` mutualisé avec `comment_like` dans `isTypeEnabled`. ✅
3. **REFACTOR** — aucun (une ligne, aucune dette introduite). ✅

## Dépendances
- `packages/shared` build (`bun run build`) + `prisma generate --generator client` pour la parité
  de test/typecheck locale (prérequis CI documentés dans CLAUDE.md). ✅

## Risques estimés
FAIBLE — le changement restreint l'émission uniquement pour un opt-out explicite, déjà appliqué au
sibling REST. Aucun utilisateur au défaut n'est impacté (`?? true`). Pas de migration ni d'API
publique modifiée.

## Stratégie de rollback
Révert d'une seule ligne (`git revert` du commit) restaure le comportement `default:true`. Aucun
état persistant ni schéma touché.

## Critères de validation
- [x] Test `false` RED sans fix → GREEN avec fix.
- [x] Test `true`/défaut → notif émise.
- [x] `SocialNotificationPrecision` 19/19 ; suites notif (`NotificationService*`, `CommentReaction*`,
      `reactionNotify`) 516 verts, 0 régression.
- [x] `tsc --noEmit` gateway 0 erreur.

## Statut de complétion
**COMPLET** — implémenté, testé (RED→GREEN), typecheck vert. Prêt à pousser + PR.

## Suivi de progression
- [x] Analyse (docs/routine/analyses/2026-07-04-iteration-97-analyse.md)
- [x] Plan (ce fichier)
- [x] RED
- [x] GREEN
- [x] Validation locale
- [ ] Push + PR
- [ ] Merge main + suppression branche

## Améliorations futures
- **F51b** (LOW) docs `notifications/`.
- **F56b** (LOW) `likeCount` absolu sur `post:reaction-added/removed` non-heart.
- Gating produit des types `friend_new_*` / `message_edited` (nouveau champ de préférence requis).
