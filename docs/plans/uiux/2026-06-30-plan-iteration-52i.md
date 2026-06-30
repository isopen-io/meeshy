# Plan — Iteration 52i (2026-06-30)

## Objectif
iOS exclusivement. Poursuivre l'adoption native iOS 26 **Liquid Glass** sur les dernières
surfaces flottantes content-agnostic restées en `.ultraThinMaterial` brut. Solde 2 des
candidats différés en 51i. Diff minimal, atome SDK existant, zéro nouvelle API.

## Changements
1. **`apps/ios/Meeshy/Features/Main/Components/MiniAudioPlayerBar.swift`**
   - `.background(.ultraThinMaterial)` → `.adaptiveGlass(in: Capsule())` (clip Capsule conservé).
   - Mirroir exact de `FloatingCallPillView`. Capsule neutre, sans teinte.
2. **`apps/ios/Meeshy/Features/Main/Components/MentionSuggestionPanel.swift`**
   - `.background(.ultraThinMaterial)` → `.adaptiveGlass(in: Rectangle())`.
   - Bande d'autocomplétion plein-largeur au-dessus du composer. Sans teinte.

## Hors-scope (volontaire — épuration)
- `MessageOverlayMenu.panelBackground` (bottom-sheet avec voile + dégradés : conversion plus
  lourde, lot dédié ultérieur).
- `ContactCardView` / `LocationPickerView` / `UniversalComposerBar` : lots bornés suivants.

## Vérification
- Pas de build local (SwiftUI/UIKit absent sur Linux) → **CI `ios-tests.yml`** = gate.
- `adaptiveGlass<S: Shape>(in:)` accepte `Rectangle()`/`Capsule()` (contrainte `Shape`).
- Tests `MiniAudioPlayerBarTests` (comportement, pas material) → restent verts.
- API `AdaptiveGlass` inchangée → aucun test SDK neuf.

## Suivi
- Merge dans `main` après CI verte (protocole branch-tracking).
- Mettre à jour `docs/plans/uiux/branch-tracking.md` : itération iOS 51i → **52i**.
