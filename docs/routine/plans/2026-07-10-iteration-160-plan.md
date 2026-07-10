# Iteration 160 — Plan d'implémentation (2026-07-10)

## Objectifs
Empêcher la rétrogradation du watch-time (`PostView.duration`) sur ré-ouverture
d'un post / story. Conserver le **max** de la durée observée pour un `PostView`
singleton `(postId, userId)`.

## Modules affectés
- `services/gateway/src/services/PostService.ts` — `recordView`, branche
  `existing` (production).
- `services/gateway/src/__tests__/posts-view-idempotence.test.ts` — couverture de
  la branche `existing` (jusque-là non exercée).

## Phases
1. **RED** — étendre `buildPrisma` (le mock `postView.findUnique` expose
   `duration`), ajouter 3 tests purs :
   - ré-ouverture plus courte → aucune écriture (durée préservée) ;
   - ré-ouverture plus longue → `update` avec la nouvelle durée ;
   - durée existante `null` → traitée comme 0, enregistre la nouvelle.
   Vérifier que le test « plus courte » échoue contre le code non corrigé.
2. **GREEN** — dans la branche `existing`, calculer
   `nextDuration = Math.max(existing.duration ?? 0, safeDuration)` et n'émettre
   l'`update` que si `nextDuration !== existing.duration`.
3. **REFACTOR** — commentaire liant le champ au signal reco/monétisation
   (`PostFeedService`) pour prévenir une régression future.

## Dépendances
Aucune. `findUnique` (l.1018) retourne déjà la ligne complète (pas de `select`),
donc `existing.duration` est disponible sans requête supplémentaire.

## Risques estimés
Faible. Cas courant (première vue = la plus longue) inchangé côté valeur, et une
écriture DB redondante en moins. Aucun impact schéma / contrat / réponse.

## Stratégie de rollback
Revert du commit (diff 3 lignes prod + tests). Aucune migration.

## Critères de validation
- `posts-view-idempotence.test.ts` 6/6 (GREEN), échec ciblé sans le fix (RED).
- Suites `posts` : 45/45 (930 tests) vertes.
- `tsc --noEmit` : aucune nouvelle erreur sur les fichiers touchés.

## Statut de complétion
✅ **Terminé** — fix + tests en place, RED/GREEN vérifiés, suites `posts` vertes.

## Suivi de progression
- [x] RED (test « plus courte » échoue sans le fix)
- [x] GREEN (fix `Math.max` + guard no-write)
- [x] Suites `posts` 45/45
- [x] Analyse + plan documentés

## Améliorations futures
- Pagination `hasMore` off-by-one (`utils/pagination.ts:51`) — probe `limit + 1`.
- Sort lexicographique `conversations/stats.ts:86` — confirmer le zero-padding
  amont.
- Deletes socket ne décrémentent aucun stat (`MessageHandler.handleMessageDelete`)
  — déjà noté par l'itération 159 (PR #1781).
