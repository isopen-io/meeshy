# Plan — Iteration 52i (2026-06-30) — iOS Liquid Glass : dropdowns de suggestion flottants

## Objectif
Adopter l'atome `.adaptiveGlass` (Liquid Glass iOS 26 + fallback gracieux pré-26) sur la
famille UX « dropdown de suggestion flottant au-dessus du contenu », en continuation du
ladder Glass amorcé en 51i. Bornée : 2 surfaces, même atome, empreinte préservée.

## Périmètre (iOS exclusivement)
- `apps/ios/Meeshy/Features/Main/Components/MentionSuggestionPanel.swift`
- `apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift`

## Étapes
1. [x] Vérifier la clip-shape de `MentionSuggestionPanel` (demande explicite 51i) → monté
   flush au-dessus du composer, pleine largeur, sans coin arrondi → conserver l'empreinte
   via `Rectangle()`.
2. [x] `MentionSuggestionPanel:62` : `.background(.ultraThinMaterial)` →
   `.adaptiveGlass(in: Rectangle(), tint: Color(hex: accentColor).opacity(0.14))`.
3. [x] `LocationPickerView` dropdown résultats (L162-166) :
   `.background(RoundedRectangle.fill(.ultraThinMaterial).shadow)` →
   `.adaptiveGlass(in: RoundedRectangle(cornerRadius: 12), tint: Color(hex: accentColor).opacity(0.12))`
   + `.shadow(...)` (ombre préservée en aval, pattern `ContextActionMenu`).
4. [x] Vérifier imports (`MeeshyUI` expose `adaptiveGlass` + `Color(hex:)`) — OK pour les
   deux fichiers.
5. [ ] Commit + push branche `claude/upbeat-euler-mekcd1`.
6. [ ] CI `ios-tests.yml` verte (compile Xcode 26.1.x — seul gate fiable, pas de build Linux).
7. [ ] Merge dans `main`, mettre à jour `branch-tracking.md`, supprimer la branche.

## Vérification
- Pas de build local (Linux sans SwiftUI) → la CI iOS est le gate de compile.
- API publique `adaptiveGlass` inchangée ; aucun test SDK existant impacté.
- Empreinte/layout préservés (Rectangle pour le mention panel ; RoundedRect+shadow pour le
  location dropdown).

## Risques / mitigations
- Risque : régression visuelle teinte trop forte → opacités basses (0.14 / 0.12), discrètes.
- Risque : fallback hairline du Rectangle sur le mention panel → lit comme séparateur subtil
  contre le composer, acceptable.

## Non-objectifs (différés)
- `CallEffectsOverlay`, `GlobalSearchView` (lot glass suivant), cartes d'effets MARGINAL,
  ladder catégoriel, polices figées.
