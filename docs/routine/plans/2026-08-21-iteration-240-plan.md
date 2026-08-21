# Plan — Iteration 240 : tri « par colonne croissante » de `resolveRiverLivingLanes` (TS + miroir Swift)

## Objectifs
Restaurer le contrat documenté de `resolveRiverLivingLanes` (« par colonne croissante ») pour
corriger la navigation latérale de la Rivière dans le layout à colonnes partagées, et réaligner le
miroir Swift qui avait copié le défaut.

## Modules affectés
- `packages/shared/utils/river-lanes.ts` — `resolveRiverLivingLanes` (tri + docstring).
- `packages/shared/__tests__/river-lanes.test.ts` — +2 témoins (RED→GREEN).
- `apps/ios/Meeshy/Features/Main/Riviere/Core/RiverLaneResolver.swift` — `.sorted()` + 2 docstrings/commentaires.
- `apps/ios/MeeshyTests/Unit/Riviere/RiverLaneVectorTests.swift` — +1 XCTest packed.
- `docs/routine/{analyses,plans}/2026-08-21-iteration-240-*` — analyse + plan (rétablit le répertoire dans git).

## Phases
1. **RED (TS)** — 2 cas : ordre croissant des vivantes en colonnes partagées ; pas latéral sur la
   voisine immédiate. Prouvés rouges sur `main`. ✅
2. **GREEN (TS)** — `.sort((a, b) => a - b)` + docstring « tri PORTANT ». ✅
3. **Miroir Swift** — `.sorted()`, réécriture docstring `resolveRiverLivingLanes` + commentaire
   `resolveRiverStep`, +1 XCTest packed. ✅
4. **Docs routine** — analyse + plan. ✅
5. **Validation + push.** ⏳

## Dépendances
- Aucune. Changement interne à une loi pure, sans signature ni type modifié.

## Risques estimés
- **Faible.** Tri déterministe (colonnes vivantes distinctes par construction). Vecteurs
  inter-plateformes inchangés (vérifié). Swift non testable localement → risque limité à un `.sorted()`
  trivial + un XCTest calqué sur un test existant.

## Rollback
- Retirer `.sort()`/`.sorted()` + les 3 tests. Aucune migration, aucun état persistant touché.

## Critères de validation
- [x] `npx vitest run __tests__/river-lanes.test.ts` vert (66).
- [x] `npx vitest run` shared complet vert (2330), suites river vectorisées incluses (146).
- [x] `bun run build` (shared `tsc`) → 0 erreur.
- [x] Gateway `tsc --noEmit` → 0 nouvelle erreur (consommateur de `@meeshy/shared`).
- [ ] iOS CI (hors toolchain locale) — vert attendu.

## Statut de complétion
- Phases 1–4 : **faites**. Phase 5 : validation finale + commit/push en cours.

## Suivi de progression / améliorations futures
- Vecteur inter-plateforme packed pour `resolveRiverStep` (quand le générateur de vecteurs
  reviendra au dépôt).
- Miroir Android `RiverLaneResolver.kt` (phase 2) : naître trié.
