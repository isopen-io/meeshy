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
## Objectives
Fermer **F61** : dérive de frontière ASCII↔Unicode résiduelle dans `parseMentions`. Aligner la
frontière gauche du fallback `@username` sur `NAME_BOUNDARY_LEFT` (Unicode) déjà utilisée par le path
`@DisplayName`, de sorte qu'un `@handle` collé à une lettre accentuée/non-latine (adresse e-mail)
ne soit plus résolu comme une mention.

## Affected modules
- `packages/shared/utils/mention-parser.ts` (production, 1 ligne + JSDoc).
- `packages/shared/__tests__/mention-parser.test.ts` (1 test de régression).

## Implementation phases
1. **RED** — ajouter dans le bloc `résolution exacte (pas de préfixe)` un test :
   `parseMentions('écris à André@atabeth.com', participants)` ⇒ `[]` (+ variante cyrillique).
   Observé `['u1']` avant fix. ✅
2. **GREEN** — `const handleRegex = new RegExp(`${NAME_BOUNDARY_LEFT}@(\\w{1,30})`, 'gu');`. ✅
3. **JSDoc** — mettre à jour la description du point 2 (frontière Unicode, pas ASCII). ✅
4. **Validation** — suite shared complète + `tsc`. ✅

## Dependencies
Aucune. Réutilise une constante déjà présente dans le module.

## Estimated risks
Très faible. Comportement strictement plus restrictif (rejette des faux positifs). Aucun cas de
mention légitime affecté (frontière espace/début/ponctuation non-nom inchangée). Usernames restent
ASCII (`\w{1,30}` inchangé, flag `u` ne modifie pas `\w`).

## Rollback strategy
Revert du commit unique. Fichier isolé, aucun changement de contrat public ni de signature.

## Validation criteria
- [x] RED prouvé (`['u1']` → attendu `[]`).
- [x] `__tests__/mention-parser.test.ts` 26/26 verts après fix.
- [x] Suite `packages/shared` complète 1258/1258 verte.
- [x] `bun run build` shared : 0 erreur tsc.
- [x] Aucun fichier partagé avec la PR #1462 en vol.

## Completion status
**COMPLETE.** Fix implémenté, testé RED→GREEN, suite complète verte, build vert.

## Progress tracking
- it.90 → F52 (story caption source lang) ✅
- it.91 → réaction socket postType STORY/STATUS/REEL ✅
- it.92 → F51 (FirebaseNotificationService dead FCM) ✅
- it.93 → F56 (likeCount self-echo double-count) ✅
- it.94 → F55 (reels cache desync web edit/delete) ✅
- it.95 → F57 (`hasMentions` ASCII→Unicode) ✅
- it.96 → F58 (comment-reaction `postType` STATUS/REEL collapse) ✅ (PR #1465, session parallèle)
- **it.97 → F61 (`parseMentions` fallback `@username` ASCII→Unicode) ✅ (ce cycle)**

## Future improvements
Voir la section « Améliorations futures » de l'analyse it.97 : F51b, F56b, F59, F60, F62.
Priorité suivante suggérée : **F62** (case drift `resolveUserLanguage`) après confirmation qu'il est
live et non latent ; sinon **F59** (itération gateway comment-reaction dédiée, hors fichiers en
vol PR #1462).
