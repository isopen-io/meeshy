# Iteration 163 — Plan d'implémentation (2026-07-10)

## Objectifs
Corriger F126 : `formatContentPublishedAt` doit classer aujourd'hui / hier / au-delà par jour
calendaire local DST-safe (`calendarDayDiff`), au lieu d'une soustraction fixe de 86 400 000 ms.

## Modules affectés
- `apps/web/utils/notification-helpers.ts` (implémentation)
- `apps/web/__tests__/utils/notification-helpers.test.ts` (test)

## Phases
1. **Refactor** — remplacer `startOfLocalDayMs(now) − 86400000` par
   `calendarDayDiff(date, now)` ; branches `=== 0` (aujourd'hui) / `=== 1` (hier).
2. **Nettoyage import** — retirer `startOfLocalDayMs` de l'import (devenu inutilisé).
3. **Test** — ajouter un cas déterministe (fake timers) verrouillant le découpage jour-calendaire.

## Dépendances
`calendarDayDiff` déjà exporté et importé (SSOT `packages/shared/utils/calendar-date.ts`),
déjà couvert par des tests DST 23 h / 25 h.

## Risques estimés
Très faibles — changement local, délégation à une SSOT testée.

## Stratégie de rollback
`git revert` du commit unique ; aucune migration, aucun schéma, aucun contrat réseau touché.

## Critères de validation
- `notification-helpers.test.ts` : 79/79 verts (avant : 78, +1 nouveau cas).
- `tsc --noEmit` : aucune nouvelle erreur sur les fichiers touchés (les erreurs pré-existantes
  `z-index-validator`, `push-token.service`, `connection.service` sont hors périmètre).
- Diff minimal : 5 lignes d'implémentation, 1 import réduit.

## Statut
**Terminé** — implémenté, testé (79/79), analysé. Prêt à pousser sur
`claude/brave-archimedes-uhh8cq`.

## Améliorations futures
- Auditer les autres consommateurs de `date-format.ts` / `presence-format.ts` pour vérifier
  qu'aucun ne réimplémente encore l'arithmétique jour-calendaire hors SSOT.
