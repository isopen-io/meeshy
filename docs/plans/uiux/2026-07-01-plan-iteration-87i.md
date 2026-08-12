# Plan — Iteration 87i (2026-07-01)

## Objectif
Accessibilité `EffectsPickerView` (sheet « Effets du message ») : **Dynamic Type** (9 polices
figées) + **1 swap palette** (`.red` destructif → `MeeshyColors.error`). iOS exclusivement
(suffixe `i`). Branche = `claude/upbeat-euler-riv8e5`, base = `main` HEAD `0b9ade13`.

## Diagnostic
- 9 sites `.font(.system(size:))` figés → ignore Dynamic Type (rupture règle a11y CLAUDE.md).
- Bouton « Tout effacer » : `.red.opacity(0.8)` = rouge système hors-charte → token destructif `MeeshyColors.error` (SSOT 78i).
- i18n + traits VoiceOver `.isSelected` déjà complets ; tous les conteneurs sont flexibles (aucun glyphe à figer).

## Étapes
1. [x] 86i (AboutView) mergé dans `main` via PR #1209 (consolidation #1212) → resync branche sur `main` HEAD.
2. [x] Lire `EffectsPickerView.swift`, confirmer 9 sites police + 1 `.red`, absence de PR concurrente.
3. [x] Migrer 9/9 `.system(size:)` → `MeeshyFont.relative(size, weight:)` (weight préservé).
4. [x] Swap `.red.opacity(0.8)` → `MeeshyColors.error.opacity(0.8)`.
5. [x] Rédiger analyse `2026-07-01-iteration-87i.md` + ce plan.
6. [x] Mettre à jour `branch-tracking.md` (86i mergé + pointeur 87i + ligne History).
7. [ ] Commit + push branche + PR.
8. [ ] Attendre CI `iOS Tests` verte → merger dans `main` (squash) ; supprimer la branche.
9. [ ] Démarrer 88i.

## Risques / mitigations
- **Pas de compile locale** (SwiftUI/Linux) → gate = CI `ios-tests.yml`. Swap mécanique,
  `MeeshyFont`/`MeeshyColors` déjà consommés partout → risque compile ~nul.
- **Aucun frame fixe** → pas de risque de débordement glyphe ; tout scale proprement.
- **Pas de snapshot** sur cette sheet → aucune baseline cassée.

## Hors-scope (différé, documenté dans l'analyse)
- Accent de sélection paramétré (`Color(hex: accentColor)`), neutres `.gray`/`.secondary`.
- Checkmark `#4ADE80` (AboutView) → success avec vérif visuelle (88i+).
