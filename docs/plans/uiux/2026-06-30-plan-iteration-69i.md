# Plan — Iteration 69i (2026-06-30)

## Objectif
Continuer le ladder d'adoption iOS 26 Liquid Glass sur les **toolbars/headers de contrôle
flottant interactif au-dessus du contenu** restants (continuation 51i → 52i → 68i → 69i).
**iOS exclusivement.**

## Branche
- Développement : `claude/upbeat-euler-qbf015` (réinitialisée depuis `origin/main` @ #1083).
- Merge dans `main` après CI `ios-tests.yml` verte. Voir `branch-tracking.md`.

## Changements (3 fichiers prod + 1 test)
1. `apps/ios/Meeshy/Features/Main/Views/CallEffectsOverlay.swift`
   - `secondaryToolbar` : `.background(.ultraThinMaterial).clipShape(Capsule())`
     → `.adaptiveGlass(in: Capsule())`. Verre neutre (pas d'accent en scope appel).
2. `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift`
   - en-tête de recherche in-conversation (`searchBar`) :
     `.background(RoundedRectangle(16).fill(.ultraThinMaterial).shadow)`
     → `.adaptiveGlass(in: RoundedRectangle(cornerRadius: 16), tint: Color(hex: accentColor).opacity(0.12))`
       + `.shadow` en aval (pattern établi).
3. `packages/MeeshySDK/Tests/MeeshyUITests/Compatibility/CompatibilityLayerTests.swift`
   - Smoke test : ajouter un cas `Capsule()` (forme non couverte jusqu'ici).

## Vérification
- [x] Imports OK (`CallEffectsOverlay` importe `MeeshyUI` ; `ConversationView+MessageRow`
      importe `MeeshyUI`).
- [x] `accentColor` en scope dans l'extension `ConversationView` (utilisé lignes 96/105…).
- [x] Pattern shadow-après-glass conforme à `ContextActionMenu`/`LocationPickerView`.
- [x] Forme `Capsule()` ajoutée au smoke test.
- [ ] CI `ios-tests.yml` verte (compile Xcode 26.1.x + tests simu 18.2).

## Doctrine respectée (exclusions documentées)
- `searchResultsBanner` (bannière non-interactive) : exclu (verre = chrome interactif).
- Champ de saisie interne (fond plat opaque) : exclu (anti verre-sur-verre).
- `AudioEffectsPanel`/`VideoFiltersPanel` (cartes stateful in-scroll) : MARGINAL, hors scope.

## Suite (différés)
- `MessageOverlayMenu` (lot dédié, `AdaptiveGlassContainer`).
- `ContactCardView` palette (`#2ECC71`/`#3498DB` → `MeeshyColors.success`/`.info`).
- Ladder catégoriel arc-en-ciel ; grandes surfaces polices figées.

## Status : ⏳ développement terminé — push + CI ; merge après CI verte.
