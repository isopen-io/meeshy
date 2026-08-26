# Plan — Itération 257 : SSOT des formateurs de planification d'agent

## Objectifs

Éliminer la duplication littérale de quatre fonctions de présentation
(`formatTime`, `formatDuration`, `budgetColor`, `budgetGlow`) entre
`TriggerSchedulingModal.tsx` et `AgentScheduleTimeline.tsx`, en les extrayant vers
un module SSOT sibling, et unifier `formatDuration` sur sa variante gardée
(`ms <= 0 → '0min'`) — plus robuste pour les deltas signés que le timeline lui
passe.

## Modules affectés

- **Ajout** : `apps/web/components/admin/agent/schedule-format.ts`
- **Ajout** : `apps/web/__tests__/components/admin/agent/schedule-format.test.ts`
- **Modif** : `apps/web/components/admin/agent/AgentScheduleTimeline.tsx`
- **Modif** : `apps/web/components/admin/agent/TriggerSchedulingModal.tsx`

## Phases

1. **RED** — écrire la suite du module (7 tests) ; échoue (module absent).
2. **GREEN** — créer `schedule-format.ts` (4 exports + docstrings).
3. **REFACTOR** — rebrancher les deux composants sur l'import, retirer les
   définitions locales.
4. **VALIDATION** — jest ciblé (76 tests), tsc delta 0.

## Dépendances

Aucune. Purement interne à `apps/web/components/admin/agent/`.

## Risques estimés

- **Négligeable.** Fonctions pures déplacées sans changement de corps, hors
  l'unification de garde (borne un affichage négatif aberrant).

## Stratégie de rollback

Supprimer `schedule-format.ts` + son test, réinliner les quatre fonctions aux deux
sites.

## Critères de validation

- [x] RED prouvé (module introuvable).
- [x] GREEN : `schedule-format` 7/7.
- [x] Refactor : 76/76 sur les trois suites.
- [x] tsc web : delta 0 (1196 = 1196).
- [ ] ESLint : non exécutable localement (toolchain sandbox cassée) ; gate CI.
- [ ] CI verte.

## Statut de complétion

**Implémenté et validé localement** (jest + tsc). En attente CI.

## Suivi de progression

- Analyse : `docs/routine/analyses/2026-08-23-iteration-257-analyse.md`.
- Prochaines priorités : audit transverse des `formatDuration`/`formatTime` du web
  (signatures divergentes, pas interchangeables — audit dédié requis).
