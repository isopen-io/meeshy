# Plan d'implémentation — Itération 222

**Analyse** : `docs/routine/analyses/2026-08-19-iteration-222-analyse.md`

## Objectifs
Clore le suivi laissé par l'itération 221 : éliminer la classe de bug `$`-substitution
(`String.prototype.replace` avec chaîne de remplacement contrôlée par les données) dans `EmailService`,
sur les deux seuls sites à valeur utilisateur (nom d'affichage expéditeur / accepteur). Parité stricte
avec `7b70bfa1` (messaging) et l'itération 221 (`TrackingLinkService`).

## Modules affectés
- `services/gateway/src/services/EmailService.ts`
  - `sendFriendRequestEmail` : `.replace('{sender}', data.senderName)`
  - `sendFriendAcceptedEmail` : `.replace('{accepter}', data.accepterName)`
- Tests : `services/gateway/src/__tests__/unit/services/EmailService.test.ts` (nouveau describe
  « $-sequence integrity in friend emails », 5 tests)

## Phases
1. **RED** — 5 tests : `$&` fuite du placeholder (`{sender}`/`{accepter}`), `$'` duplication de queue de
   phrase, `$$` avalement de `$`, +1 non-régression nom ordinaire.
   ✅ RED prouvé : 4 échecs sur code non patché, nom ordinaire vert.
2. **GREEN** — convertir les 2 `.replace('{token}', value)` en *function replacers* `() => value`. ✅
3. **REFACTOR** — aucun (changement minimal aligné sur l'itération 221) ; +2 commentaires explicatifs.

## Dépendances
Aucune. Fonctions pures, aucune nouvelle dépendance de build.

## Risques estimés
Très faible — replacers fonctionnels = réinsertion verbatim, sémantiques première-occurrence identiques ;
seules les entrées contenant `$` changent (corrompu → correct) ; noms sans `$` inchangés.

## Stratégie de rollback
Revert du commit unique (1 fichier source + 1 fichier de test). Aucune migration, aucun changement de
schéma/API.

## Critères de validation
- RED prouvé (source non patchée) : 4 échecs (`$&`×2, `$'`, `$$`) ; nom ordinaire vert.
- GREEN : 86/86 sur `EmailService.test.ts` (81 existants + 5 nouveaux), aucune régression.

## Statut de complétion
**COMPLET** — implémenté, testé (RED→GREEN), documenté. Prêt à merger.

## Suivi de progression
- [x] Analyse rédigée
- [x] Tests RED ajoutés + RED prouvé (4 échecs)
- [x] Implémentation GREEN (2 sites)
- [x] Suite EmailService verte (86/86)
- [ ] Commit + push + merge + delete branch

## Améliorations futures
- **Balayage `$`-substitution clos** pour les valeurs utilisateur (messaging + tracking + email).
- Règle lint interdisant `replace(x, <var string>)` → helper `replaceLiteral` centralisé (SSOT anti-`$`),
  pour transformer cette classe récurrente en garde structurelle plutôt qu'un correctif site par site.
