# Plan — Itération 282 : `customDestinationLanguageCode` `.max(5)` → `.max(6)`

## Objectifs
Fermer le dixième site de la classe « borne de langue `.max(5)` qui rejette un code 639-3 région-taggé » ouverte à l'itération 266, sur le champ Prisme priorité-3 `customDestinationLanguage`.

## Modules affectés
- `packages/shared/utils/validation.ts` — schéma `customDestinationLanguageCode` (borne + doc-comment).
- `packages/shared/__tests__/validation.test.ts` — deux témoins (RED `bas-CM`→`bas`, garde 7-char).

## Phases
1. **RED** — ajouter le témoin `bas-CM` (6 chars) au bloc « language-code normalization at the write boundary ». Prouver l'échec (`too_big <=5`). ✅
2. **GREEN** — `.max(5)` → `.max(6)` ; doc-comment cite la raison (longueur max 639-3 + région) et la cause du miss (borne sur deux lignes). ✅
3. **Anti-régression** — garde 7-char (`abcd-CM`) toujours rejetée. ✅
4. **Validation** — `vitest run` complet shared + `tsc --noEmit`. ✅

## Dépendances
Aucune. Changement isolé dans le package `shared`, purement additif (élargissement de borne). Le type inféré reste `string` — aucun consommateur (gateway, web) ne recompile différemment.

## Risques estimés
Nul. Aucun code aujourd'hui accepté ne devient rejeté ; garde anti-sur-élargissement en place.

## Stratégie de rollback
`git revert` du commit — un seul fichier de prod, un seul de test.

## Critères de validation
- RED prouvé avant, GREEN après.
- Suite shared complète verte (2704 tests), `tsc` exit 0.

## Statut d'achèvement
**Livré.** RED→GREEN prouvé, suite verte, tsc vert.

## Améliorations futures
- **Méthode** : le grep de clôture d'une classe de bornes doit être multi-ligne (`.min(...)` et `.max(...)` peuvent se répartir sur plusieurs lignes). Un cliquet AST plutôt qu'un grep textuel fermerait la classe sans angle mort. Noté comme dette de méthode — à ouvrir en issue si la classe se rouvre une troisième fois.
