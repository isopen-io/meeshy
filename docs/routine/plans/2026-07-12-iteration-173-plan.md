# Iteration 173 — Plan : corriger `uniqueClicks` filtré par date

## Objectifs
Rendre `TrackingLinkService.getTrackingLinkStats` cohérent lorsqu'un filtre de
date est appliqué : `uniqueClicks` doit refléter la fenêtre, pas le compteur
all-time stocké.

## Modules affectés
- `services/gateway/src/services/TrackingLinkService.ts` (`getTrackingLinkStats`)
- `services/gateway/src/__tests__/unit/services/TrackingLinkService.test.ts`
  (nouveau test de régression)

## Phases d'implémentation
1. **RED** — Ajouter un test combinant filtre de date + `uniqueClicks` stocké
   élevé ; asserter `uniqueClicks === 1` et `uniqueClicks ≤ totalClicks`.
2. **GREEN** — Brancher `uniqueClicks` sur le set recalculé quand
   `startDate || endDate` est présent ; conserver le compteur stocké sinon.
3. **REFACTOR** — Aucun (le correctif est déjà minimal et lisible).

## Dépendances
Aucune (méthode pure côté service, aucun changement de contrat REST/Socket).

## Risques estimés
- Faible. Le seul comportement modifié est la branche filtrée, jusque-là
  incohérente. Le chemin non filtré (utilisé par `/posts/:id/share` et le
  dashboard sans dates) est inchangé.
- Rollback : revert du commit unique.

## Stratégie de rollback
`git revert` du commit — le changement est atomique (1 méthode + 1 test).

## Critères de validation
- [x] RED reproduit (reçoit 40 au lieu de 1).
- [x] GREEN : `TrackingLinkService` 74/74.
- [x] Non-régression : suites `tracking` 12/12 (244 tests).
- [x] `tsc --noEmit` sans nouvelle erreur sur le fichier touché.

## Statut de complétion
✅ Terminé — implémenté, testé, documenté.

## Suivi de progression
- Bug identifié via audit ciblé de la surface TypeScript testable (gateway).
- Correctif TDD appliqué, validé localement sous bun/jest.

## Améliorations futures
- Envisager d'exposer une seule voie de calcul d'unicité (le compteur stocké
  est une optimisation de cohérence pour le all-time ; le recalcul reste la
  source de vérité pour toute fenêtre). Documenter cette dualité dans
  `services/gateway/decisions.md` si d'autres endpoints filtrés apparaissent.
- Le recalcul `max(IPs, fingerprints)` reste une heuristique d'unicité ; une
  future itération pourrait unifier IP+fingerprint en une clé composite unique.
