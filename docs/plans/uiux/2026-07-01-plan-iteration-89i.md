# Plan — Iteration 89i (2026-07-01)

## Objectif
Accessibilité `EffectsPickerView` (feuille « Effets du message ») : **Dynamic Type** +
**en-têtes VoiceOver** + **épuration palette** (rouge destructif → token). iOS exclusivement
(suffixe `i`). Branche = `claude/upbeat-euler-bx683k`, base = `main` HEAD `18fab5d5`.

## Diagnostic
- `EffectsPickerView.swift` : 9 sites `.font(.system(size:))` → la feuille ignore Dynamic Type
  (rupture règle a11y CLAUDE.md « never fixed font sizes for body text »).
- Titres de section (`effectSection`) sans trait `.isHeader` → pas navigables au rotor VoiceOver.
- Bouton « Tout effacer » (destructif) utilise `.red` système brut au lieu du token
  sémantique `MeeshyColors.error` (doctrine palette 78i).
- i18n déjà complet ; puces déjà `.accessibilityLabel` + `.isSelected` ; accent déterministe
  de conversation préservé (hors-scope palette).

## Étapes
1. [x] Vérifier les surfaces iOS non prises (`list_pull_requests`) → `EffectsPickerView` retenu
   (candidat secondaire listé par 86i, non pris, faible risque).
2. [x] Vérifier `MeeshyFont.relative` (signature + import) et `MeeshyColors.error` (token + import).
3. [x] Migrer 9/9 sites `.system(size:)` → `MeeshyFont.relative(size, weight:)` (weight préservé) —
   tous du texte-de-lecture / glyphes inline, aucun en cadre fixe → migration intégrale.
4. [x] Ajouter `.accessibilityAddTraits(.isHeader)` sur `Text(title)` du helper `effectSection`.
5. [x] Convergence `.red.opacity(0.8)` → `MeeshyColors.error.opacity(0.8)` sur « Tout effacer ».
6. [x] Rédiger analyse `2026-07-01-iteration-89i.md` + ce plan.
7. [ ] Commit + push branche + PR.
8. [ ] Attendre CI `iOS Tests` verte.
9. [ ] Merger dans `main` ; supprimer la branche mergée.
10. [ ] Mettre à jour `branch-tracking.md` (pointeur autoritaire iOS → 89i + ligne History).

## Risques / mitigations
- **Pas de compile locale** (SwiftUI/Linux) → gate = CI `ios-tests.yml`. Swap purement
  mécanique, `MeeshyFont`/`MeeshyColors` déjà consommés par de multiples vues app → risque
  compile ~nul.
- **Aucun glyphe en cadre fixe** dans ce fichier → pas de risque de débordement Dynamic Type.
- **Swap couleur** : `MeeshyColors.error` (#F87171) vs `.red` (#FF3B30) = léger adoucissement du
  ton, aligné charte, opacité 0.8 conservée → régression visuelle nulle en pratique.

## Hors-scope (différé, documenté dans l'analyse)
- Accent déterministe `Color(hex: accentColor)` (règle conversation, préservé).
- Gris de surface neutres `Color.gray.opacity` (audit dédié « surfaces neutres »).
- Autres grandes surfaces Dynamic Type (`StoryViewerView+Content`…) → 90i+.
