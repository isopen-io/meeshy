# Plan — Iteration 71i (2026-06-30) — iOS

## Objectif
Dynamic Type / accessibilité du flux de sécurité 2FA (`TwoFactorSetupView.swift` — 3 écrans :
setup, disable, backup-codes). Un seul fichier de production. Borné, épuré, sans collision avec
les PR en vol.

## Changements

### Dynamic Type — `.system(size:)` figé → `MeeshyFont.relative(...)`
`apps/ios/Meeshy/Features/Main/Views/TwoFactorSetupView.swift`
- **30 conversions** : tout `Text`/`TextField`/`SecureField` + petites icônes inline (12–13 pt)
  → `MeeshyFont.relative(size, weight:, design:)` (préserve weight + design, dont `.monospaced`
  pour le champ code 28 pt et les codes de secours 14 pt).
- **9 icônes héros décoratives (40/50/80 pt) gardées figées** — les replier vers `relative`
  les écraserait toutes sur `.largeTitle` (perte de hiérarchie). Décision documentée.
- `setup.otpauthUrl` non touché (déjà Dynamic Type via `.system(.subheadline, design:)`).

## Hors-scope (différé, ne pas re-flagger)
- Icônes héros décoratives ≥ 40 pt (hiérarchie visuelle).
- Glass / palette (autres lots).

## Vérification
- CI `ios-tests.yml` (compile Xcode 26.1.x + tests simu 18.2) = gate.
- Sweep typographique pur → pas de logique isolable → pas de nouveau test unitaire (parité 55i).
- Pas de build SwiftUI local (Linux).

## Merge
Après CI verte : merge dans `main`, supprimer la branche, mettre à jour `branch-tracking.md`.

## Status : ⏳ push + CI → merge main
