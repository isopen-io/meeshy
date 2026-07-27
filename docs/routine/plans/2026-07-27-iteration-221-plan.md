# Plan d'implémentation — Itération 221

**Analyse** : `docs/routine/analyses/2026-07-27-iteration-221-analyse.md`

## Objectifs
Éliminer la classe de bug `$`-substitution (`String.prototype.replace` avec replacement string
contrôlé par les données) dans `TrackingLinkService`, en parité stricte avec le correctif
`processLinksInContent` (`7b70bfa1`). Rendre le contenu fidèle bout en bout sur le chemin de tracking.

## Modules affectés
- `services/gateway/src/services/TrackingLinkService.ts`
  - `processExplicitLinksInContent` : 5 `.replace` (ÉTAPE 2/3 succès + repli d'erreur, ÉTAPE 4 restore)
  - `processMessageLinks` : 1 `.replace` (réécriture URL brute)
- Tests : `services/gateway/src/__tests__/unit/services/TrackingLinkService.dollarSequences.test.ts` (nouveau)

## Phases
1. **RED** — 5 tests : restauration markdown `$&` (fuite sentinelle), `$$` (avale `$`), `` $` ``+`$'`
   (mutilation), lien plain (non-régression), repli d'erreur `[[url]]` à `$` sur mint échoué.
   ✅ RED prouvé : 4 échecs sur code non patché, lien plain vert.
2. **GREEN** — convertir les 6 `.replace` dynamiques en *function replacers* `() => value`. ✅
3. **REFACTOR** — aucun (changement minimal aligné sur `7b70bfa1`) ; +2 commentaires explicatifs.

## Dépendances
Aucune. Fonctions pures, aucune nouvelle dépendance de build.

## Risques estimés
Très faible — replacers fonctionnels = réinsertion verbatim, sémantiques première-occurrence identiques ;
seules les entrées contenant `$` changent (corrompu → correct) ; token-based inchangé.

## Stratégie de rollback
Revert du commit unique (1 fichier source + 1 fichier de test). Aucune migration, aucun changement de
schéma/API.

## Critères de validation
- RED prouvé via `git stash` de la source (4 échecs, plain vert).
- GREEN : 5/5 nouvelle suite ; tracking suites (content-links, resolve, share, posts-content,
  TrackingLinkService) + callers (MessageProcessor, links-messages, posts-share) sans régression.

## Statut de complétion
**COMPLET** — implémenté, testé (RED→GREEN), documenté. Prêt à merger.

## Suivi de progression
- [x] Analyse rédigée
- [x] Tests RED ajoutés + RED prouvé (4 échecs)
- [x] Implémentation GREEN (6 sites)
- [x] Suites tracking + callers vertes (218 tests ciblés)
- [x] CHANGELOG
- [ ] Commit + push + merge + delete branch

## Améliorations futures
- Audit léger `EmailService` (`.replace('{token}', value)` avec valeurs à `$` possibles).
- Règle lint interdisant `replace(x, <var string>)` → helper `replaceLiteral` centralisé (SSOT anti-`$`).
