# Iteration 124 — Plan d'implémentation (2026-07-07)

## Objectives
Corriger le bug de frontière (off-by-one) dans `TrackingLinkService.generateUniqueToken` : les 10
tentatives déclarées ne validaient que 9 candidats, jetant un 10ᵉ token potentiellement unique avec une
erreur spurious. Restaurer la sémantique « jusqu'à 10 candidats testés, erreur seulement après épuisement ».

## Affected modules
- `services/gateway/src/services/TrackingLinkService.ts` (fix)
- `services/gateway/src/__tests__/unit/services/TrackingLinkService.test.ts` (test de régression)

## Implementation phases
1. **RED** — Ajouter un test « 9 collisions puis 10ᵉ token libre → succès » ; prouver l'échec sur le code
   actuel (throw spurious). ✅
2. **GREEN** — Remplacer la boucle `do/while` (compteur incrémenté avant la vérification) par une boucle
   `for` à retour anticipé validant les 10 candidats. ✅
3. **REFACTOR** — Le `for` supprime aussi le compteur mutable et la variable `token` mutable (style
   immuable). ✅
4. **VALIDATION** — Suite complète du service + suites `tracking*`. ✅

## Dependencies
Aucune. Changement interne au service, aucun contrat public modifié.

## Estimated risks
Très faibles. Sémantique préservée ; tous les tests existants restent verts. Seul le comptage interne de
`findUnique` dans le cas d'échec total passe de 9 à 10 (non asserté par les tests existants).

## Rollback strategy
Revert du commit unique. Deux fichiers, aucune migration, aucun changement de schéma ou d'API.

## Validation criteria
- [x] Nouveau test RED→GREEN prouvé.
- [x] `TrackingLinkService.test.ts` : 72/72.
- [x] Suites `tracking*` : 200/200 (échecs de compilation TS pré-existants, sans lien, écartés).
- [x] Diff limité à 2 fichiers.

## Completion status
**COMPLETE** — implémenté, testé (RED/GREEN), validé, prêt à merger.

## Progress tracking
- [x] Analyse rédigée (`2026-07-07-iteration-124-analyse.md`)
- [x] Fix appliqué
- [x] Test de régression ajouté + RED prouvé
- [x] Suite verte
- [x] Commit + push

## Future improvements
Voir backlog analyse : F89 (duplicata mort `postReplySnapshot`), F90 (drift Unicode
`hasMentions`/`parseMentions`). Candidats disjoints pour une itération future.
