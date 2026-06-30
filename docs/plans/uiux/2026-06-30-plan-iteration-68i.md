# Plan — Iteration 68i (2026-06-30)

## Objectif
iOS only. Poursuivre l'adoption native iOS 26 Liquid Glass sur le chrome de contrôle
flottant restant (champ de recherche global + autocomplétion de mention), épurer l'a11y
du skeleton de mention. Itération bornée, « logique épurée », continuité directe de 51i.

## Base
- Branche : `claude/upbeat-euler-ozhysc` (resynchronisée sur `main` HEAD `eee8f29`, post-67w).

## Changements

### 1. `apps/ios/.../Components/MentionSuggestionPanel.swift` (app)
- [x] `.background(.ultraThinMaterial)` → `.adaptiveGlass(in: Rectangle())` (après sizing).
- [x] `mentionSkeletonRows` → `.accessibilityHidden(true)` (décoratif) + doc-comment.

### 2. `apps/ios/.../Views/GlobalSearchView.swift` (app)
- [x] Champ de recherche : `.background(RoundedRectangle.fill(.ultraThinMaterial).overlay(stroke))`
      → `.adaptiveGlass(in: RoundedRectangle(cornerRadius: 20))` + `.overlay(stroke)` (liséré
      dégradé marque conservé).
- [x] Cartes de résultats / recherches récentes : **inchangées** (fonds de contenu, pas du
      chrome — conforme doctrine Liquid Glass).

### 3. `packages/MeeshySDK/Tests/.../CompatibilityLayerTests.swift` (SDK)
- [x] Étendre `test_adaptiveGlass_appliesToAnyView_*` : couvrir `RoundedRectangle` et
      `Rectangle` (formes des sites d'adoption 68i) en plus de `Circle`.

## Vérification
- [x] `grep` : seuls les 2 sites de chrome convertis ; les 4 `.ultraThinMaterial` de contenu
      de `GlobalSearchView` laissés intacts.
- [ ] CI `ios-tests.yml` verte (compile + tests simulateur) — seule vérif de build (pas de
      build SwiftUI local sur Linux). Smoke test étendu couvre l'API surface.

## Merge
- [ ] Push `claude/upbeat-euler-ozhysc`, PR → `main`, merge après CI verte. Supprimer la
      branche. Mettre à jour `branch-tracking.md` (base 69i = main post-merge 68i).
