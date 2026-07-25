# Plan — Iteration 192 : garde futur/décalage-horloge dans `formatConversationDate`

## Objectifs
Corriger le rendu d'un timestamp futur (décalage d'horloge client sur frontière
de minuit) dans `apps/web/utils/date-format.ts` : afficher l'heure seule, jamais
un jour de semaine. Garder la branche de couverture par test.

## Modules affectés
- `apps/web/utils/date-format.ts` (`formatConversationDate`)
- `apps/web/__tests__/utils/date-format.test.ts` (1 test ajouté)

Aucun autre fichier. Consommateurs (`ConversationItem`, `ConversationsWidget`,
`CommunitiesWidget`) inchangés — bénéficient du fix transparentement.

## Phases d'implémentation
1. **RED** — ajouter un test : timestamp « demain 00:10 » → attendre `/^\d{2}:\d{2}$/`.
   Prouvé échouant (`"Mer. 00:10"`). ✅
2. **GREEN** — `if (diffDays === 0)` → `if (diffDays <= 0)` + commentaire
   d'intention. Suite verte 26/26. ✅
3. **Non-régression** — `__tests__/utils/` : 976 tests verts (hors échec
   préexistant `user-language-preferences.test.ts`, mock shared non buildé). ✅

## Dépendances
Aucune. `calendarDayDiff` (shared) inchangé — le fix consomme sa sortie négative
correctement.

## Risques estimés
Minimal. Élargissement de garde ; les dates passées empruntent des branches
identiques (prouvé : 25 tests passés inchangés).

## Stratégie de rollback
`git revert` du commit — 2 fichiers, aucune migration, aucun état persistant.

## Critères de validation
- `date-format.test.ts` : 26/26 vert.
- `__tests__/utils/` : 976 vert (hors préexistant environnemental).
- Comportement passé identique ; futur → heure seule.

## Statut de complétion
**COMPLET** — RED prouvé, GREEN vert, non-régression vérifiée.

## Suivi de progression
- [x] Analyse écrite (`2026-07-21-iteration-192-analyse.md`)
- [x] Test RED prouvé
- [x] Fix GREEN
- [x] Non-régression `__tests__/utils/`
- [x] Docs plan
- [ ] Commit + push + PR

## Améliorations futures (voir analyse §Future)
- `getLanguageInfo` fallback `region` inerte (sémantique).
- `getLanguageInfo` normalisation BCP-47 (bloqué par import circulaire — refactor).
- Parité sentinelle `'unknown'` iOS/Android.
