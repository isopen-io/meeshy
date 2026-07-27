# Itération 219 — Plan : canonicalisation du format DND `HH:MM`

**Analyse** : `docs/routine/analyses/2026-07-27-iteration-219-analyse.md`

## Objectifs
1. Rendre `isWithinDnd` robuste à une borne non zero-paddée (défense pure, couvre le stock hérité).
2. Faire converger les quatre write-boundaries sur la regex canonique `HH:MM` (SSOT).

## Modules affectés
- `packages/shared/utils/notification-dnd.ts` (helper `padWallClock` + application aux bornes)
- `packages/shared/utils/validation.ts` (`NotificationPreferenceSchemas.update`, l.1515-1516)
- `packages/shared/__tests__/utils/notification-dnd.test.ts` (+3 tests)
- `packages/shared/__tests__/validation.test.ts` (+4 tests, import `NotificationPreferenceSchemas`)

## Phases d'implémentation
1. **RED** — tests des deux gaps (schéma accepte `"9:00"`, `isWithinDnd` casse sur `"9:00"`).
2. **GREEN** — `padWallClock` + application ; resserrage regex `validation.ts`.
3. **Validation** — suite `packages/shared` complète + `tsc --noEmit`.

## Dépendances
Aucune (fonctions pures, aucune nouvelle dépendance de build).

## Risques estimés
Très faible — voir Risk assessment de l'analyse. Padding idempotent, resserrage rejette une
forme qu'aucun consommateur n'exigeait, trois sites la rejetaient déjà.

## Stratégie de rollback
Revert du commit unique. Aucune migration, aucune écriture de schéma en base.

## Critères de validation
- `update` rejette `"9:00"`/`"8:30"`/`"24:00"`, accepte `"09:00"`/`"23:59"`.
- `isWithinDnd` : `"9:00"`–`"17:00"` diurne correct (03:00→false, 10:00→true, 18:00→false) ;
  overnight à borne 1-chiffre correct ; offset + double borne 1-chiffre correct.
- `packages/shared` : 1427 tests verts ; `tsc --noEmit` 0 erreur.

## Statut de complétion
✅ **Complété** — RED prouvé (5 tests rouges), GREEN vert, suite complète 1427/1427 verte,
type-check clean.

## Suivi de progression
- [x] RED : 5 tests rouges (2 schéma + 3 DND)
- [x] GREEN : `padWallClock` + application aux deux bornes
- [x] GREEN : regex `validation.ts` canonique
- [x] Suite `packages/shared` 48 fichiers / 1427 tests verts
- [x] `tsc --noEmit` 0 erreur
- [x] Commit + push

## Améliorations futures
- Migration idempotente des `dndStartTime`/`dndEndTime` historiques `"H:MM"` → `"HH:MM"`.
- Truncation grapheme-safe dans `SecuritySanitizer.truncate` (P3 séparé).
