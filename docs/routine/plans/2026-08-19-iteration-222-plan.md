# Itération 222 — Plan : SSOT `replaceLiteral` + fix fuite `$` emails d'amitié

**Date** : 2026-08-19 · **Branche** : `claude/brave-archimedes-4rqsh2`

## Objectifs
1. Corriger la corruption `$`-substitution des intros d'emails « demande d'ami » / « ami accepté ».
2. Matérialiser le helper SSOT anti-`$` recommandé à l'itér. 221.

## Modules affectés
- `services/gateway/src/utils/string-replace.ts` (nouveau)
- `services/gateway/src/services/EmailService.ts` (import + 2 sites)
- `services/gateway/src/__tests__/unit/utils/string-replace.test.ts` (nouveau)
- `services/gateway/src/__tests__/unit/services/EmailService.test.ts` (+2 tests)

## Phases
1. **RED** — tests helper (`$&`/`$$`/`` $` ``/`$'`/`$n`, 1re occurrence, needle absent, valeur vide) +
   2 tests EmailService (nom avec `$` inséré verbatim, aucune fuite `{sender}`/`{accepter}`).
2. **GREEN** — `replaceLiteral = (h, n, v) => h.replace(n, () => v)` ; re-câblage L1198/L1211.
3. **VALIDATE** — helper 10/10, EmailService 82/82, `tsc` gateway 0 erreur.

## Dépendances
Prérequis parité locale : `bun install --ignore-scripts`, `prisma generate`, `@meeshy/shared` build.

## Risques estimés
Très faible (cf. analyse). Sémantique 1re-occurrence préservée ; seul le cas `$` change.

## Rollback
Reverter le commit : 1 fichier util + 2 lignes EmailService + tests. Aucune migration, aucun état.

## Critères de validation
- RED prouvé source non corrigée ; GREEN complet ; typecheck propre.

## Statut de complétion
- [x] Phase 1 RED (2 tests EmailService rouges prouvés)
- [x] Phase 2 GREEN (helper + re-câblage)
- [x] Phase 3 VALIDATE (92/92 suites ciblées, tsc 0)

## Progress tracking
Terminé — prêt pour commit/push/merge.

## Améliorations futures
- Migration flat-config ESLint → règle lint SSOT anti-`$`.
- Adoption `replaceLiteral` par `MessagingService`/`TrackingLinkService`.
