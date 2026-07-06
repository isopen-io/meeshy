# Iteration 102 — Plan d'implémentation (2026-07-05)

## Objectifs
Rendre `calendarDayDiff` (SSOT « jours calendaires » de `packages/shared`) immune aux transitions
DST, corrigeant le mislabel « Hier » → « Aujourd'hui » le lendemain d'un passage à l'heure d'été.

## Modules affectés
- `packages/shared/utils/calendar-date.ts` (source)
- `packages/shared/__tests__/utils/calendar-date.test.ts` (tests)
- Consommateurs bénéficiaires (inchangés) : `apps/web/utils/date-format.ts`,
  `apps/web/utils/presence-format.ts`.

## Phases
1. **RED** — reproduire le bug (standalone harness `TZ=America/New_York`) : ancienne formule
   `calendarDayDiff(8 mars, 9 mars) === 0`. ✅
2. **GREEN** — `localDayIndex(ms) = Math.round(Date.UTC(y,m,d)/DAY_MS)` ; `calendarDayDiff` =
   différence d'index. ✅
3. **Tests** — 3 cas DST (spring 23 h → 1, fall 25 h → 1, même jour de transition → 0). ✅
4. **Validation** — vitest ciblé + suite utils complète + `bun run build` + multi-TZ. ✅

## Dépendances
Aucune. `startOfLocalDayMs` conservé (consommateur `notification-helpers`).

## Risques estimés
Très faible : comportement identique hors DST (test d'équivalence legacy vert), corrigé aux
transitions. Aucune signature publique modifiée, aucune migration.

## Stratégie de rollback
Revert du commit unique (changement pur, additif/défensif).

## Critères de validation
- [x] `calendar-date.test.ts` 11/11 ; `__tests__/utils/` 124/124
- [x] `bun run build` shared : 0 erreur
- [x] Multi-TZ (UTC/Paris/NY/Sydney/Chatham) : nouveau == ancien hors DST, corrigé aux transitions

## Statut de complétion
**COMPLET.** Fix + tests + docs livrés. Prêt à merger.

## Suivi de progression
- it.100 : F60 (mentions à tiret) — mergé #1481.
- it.101 : F65/F66 (web utils truncate/format-number) — PR #1487 ouverte.
- **it.102 : F67 (DST calendarDayDiff) — cette itération.**

## Améliorations futures
- F67b : parité iOS `RelativeTimeFormatter` / `Calendar.startOfDay` (DST) — validation Swift requise.
- F51b, F56b, F60b : report (voir analyse it.102).
