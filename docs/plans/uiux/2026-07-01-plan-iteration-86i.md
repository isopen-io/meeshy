# Plan — Iteration 86i (2026-07-01)

## Objectif
Accessibilité `AboutView` (écran « À propos ») : **Dynamic Type** + **en-têtes VoiceOver**.
iOS exclusivement (suffixe `i`). Branche = `claude/upbeat-euler-riv8e5`, base = `main` HEAD.

## Diagnostic
- `AboutView.swift` : 16 sites `.font(.system(size:))` → l'écran ignore Dynamic Type (rupture
  règle a11y CLAUDE.md « never fixed font sizes for body text »).
- En-têtes de section (`sectionHeader`) sans trait `.isHeader` → pas navigables au rotor VoiceOver.
- i18n déjà complet (aucun littéral figé) ; couleurs = ladder décoratif de teintes de section
  (hors-scope palette).

## Étapes
1. [x] Explorer les surfaces iOS non prises (agent Explore) → `AboutView` retenu (stable, faible risque).
2. [x] Vérifier `MeeshyFont.relative` (signature + import) et l'absence de PR/itération sur `AboutView`.
3. [x] Migrer 15/16 sites `.system(size:)` → `MeeshyFont.relative(size, weight:, design:)` (weight/design préservés).
4. [x] Garder figé le glyphe `fieldIcon` (14pt dans badge fixe 28×28) — précédent 74i, documenté.
5. [x] Ajouter `.accessibilityElement(children: .combine)` + `.accessibilityLabel(title)` + `.accessibilityAddTraits(.isHeader)` sur `sectionHeader`.
6. [x] Rédiger analyse `2026-07-01-iteration-86i.md` + ce plan.
7. [ ] Commit + push branche + PR.
8. [ ] Attendre CI `iOS Tests` verte.
9. [ ] Merger dans `main` (squash) ; supprimer la branche mergée.
10. [ ] Mettre à jour `branch-tracking.md` (pointeur autoritaire iOS → 86i + ligne History).

## Risques / mitigations
- **Pas de compile locale** (SwiftUI/Linux) → gate = CI `ios-tests.yml`. Swap purement
  mécanique, `MeeshyFont` déjà consommé par de multiples vues app → risque compile ~nul.
- **Débordement glyphe badge** → évité en gardant `fieldIcon` figé.
- **Pas de snapshot AboutView** → aucun risque de baseline cassée.

## Hors-scope (différé, documenté dans l'analyse)
- Couleurs (ladder teintes section, logo `#1C1917`, checkmark `#4ADE80`→success avec vérif visuelle).
- `@ScaledMetric` sur le badge `fieldIcon`.
- `EffectsPickerView` Dynamic Type (candidat secondaire → 87i+).
