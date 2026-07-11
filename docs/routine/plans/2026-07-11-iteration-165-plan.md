# Iteration 165 — Plan d'implémentation (2026-07-11)

## Objectifs
Corriger F124 : `ExpiredStoriesCleanupService` ne soft-delete jamais aucune story expirée à cause
du matcher MongoDB `deletedAt: null` (ne matche pas les documents où le champ est absent). Aligner
l'unique site divergent sur l'invariant centralisé `NOT_DELETED = { isSet: false }`.

## Modules affectés
- `services/gateway/src/services/ExpiredStoriesCleanupService.ts` (1 ligne prod + 1 import + commentaire)
- `services/gateway/src/__tests__/unit/ExpiredStoriesCleanupService.test.ts` (1 test de régression)

## Phases d'implémentation
1. **RED** — Ajouter un test qui asserte que le `where.deletedAt` du soft-delete `updateMany` vaut
   `{ isSet: false }` (et non `null`). Vérifier qu'il échoue contre le code buggé. ✅
2. **GREEN** — Importer `NOT_DELETED` depuis `./posts/postIncludes`, remplacer `deletedAt: null` par
   `deletedAt: NOT_DELETED`, ajouter le commentaire inline. ✅
3. **Validation** — Suite complète `ExpiredStoriesCleanupService` (10/10), `tsc --noEmit` propre. ✅

## Dépendances
Aucune. `NOT_DELETED` est déjà exporté et utilisé par tous les autres services Post.

## Risques estimés
Très faibles. Changement de comportement volontaire et souhaité (les stories expirées commencent à
être nettoyées). La passe hard-delete (`deletedAt: { not: null }`) reste correcte. Aucun changement
d'API ni de schéma.

## Stratégie de rollback
Revert du commit unique. Le service reprend son comportement no-op précédent (aucun nettoyage).

## Critères de validation
- Test RED échoue contre `deletedAt: null`, passe contre `deletedAt: NOT_DELETED`. ✅
- 10/10 tests `ExpiredStoriesCleanupService` verts. ✅
- Pas de nouvelle erreur `tsc`. ✅

## Statut de complétion
**COMPLET.** Fix + test livrés, validés localement (bun/jest parity).

## Suivi de progression
- [x] Analyse écrite (`2026-07-11-iteration-165-analyse.md`)
- [x] Test RED
- [x] Fix GREEN
- [x] Validation locale
- [x] Commit + push

## Améliorations futures
Voir la section « Suivis » de l'analyse : clé fantôme `{emoji:0}` dans l'optimistic unlike
(web hooks), garde `hasMore` manquante dans `useFeedQuery`, EXCEPT gate sans check d'amitié dans
`createStoryCommentNotificationsBatch`.
