# Plan — Iteration 69i (2026-06-30)

## Objectif
iOS only. Poursuivre l'adoption native iOS 26 Liquid Glass sur le **chrome de contrôle/info
flottant au-dessus du flux vidéo d'appel** (badge de durée, panneau transcript live, toolbar
d'effets). Famille UX unique « chrome-over-content », itération bornée « logique épurée »,
continuité directe de 51i/52i/68i. Solde le candidat GOOD `CallEffectsOverlay:79` listé par 52i.

## Base
- Branche : `claude/upbeat-euler-jawy6h` (resynchronisée sur `main` HEAD `23837bf`, post-68i/52i mergés #1083/#1080).

## Changements

### 1. `apps/ios/.../Views/CallView.swift` (app)
- [x] Badge de durée (L681) : `.background(.ultraThinMaterial).clipShape(Capsule())`
      → `.adaptiveGlass(in: Capsule()).clipShape(Capsule())` (clip conservé).
- [x] Panneau transcript live (L951) : `.background(.ultraThinMaterial).clipShape(RoundedRectangle(12))`
      → `.adaptiveGlass(in: RoundedRectangle(cornerRadius: 12)).clipShape(RoundedRectangle(12))`.

### 2. `apps/ios/.../Views/CallEffectsOverlay.swift` (app)
- [x] Toolbar d'effets (L79) : `.background(.ultraThinMaterial).clipShape(Capsule())`
      → `.adaptiveGlass(in: Capsule()).clipShape(Capsule())`.

### 3. `packages/MeeshySDK/Tests/.../CompatibilityLayerTests.swift` (SDK)
- [x] Étendre `test_adaptiveGlass_appliesToAnyView_*` : couvrir `Capsule` (forme des sites
      69i) en plus de `Circle`/`RoundedRectangle`/`Rectangle`.

## Vérification
- [x] `grep` : seuls les 3 sites de chrome flottant d'appel convertis ; les fonds de contenu
      (`AudioEffectsPanel`/`VideoFiltersPanel`) et les `.ultraThinMaterial` hors-domaine
      laissés intacts. `clipShape` conservé partout (empreinte identique). Imports `MeeshyUI`
      déjà présents (CallView L5, CallEffectsOverlay L3).
- [ ] CI `ios-tests.yml` verte (compile + tests simulateur) — seule vérif de build. Smoke
      test étendu couvre la surface API `Capsule`.

## Merge
- [ ] Push `claude/upbeat-euler-jawy6h`, PR → `main`, merge après CI verte. Supprimer la
      branche. Mettre à jour `branch-tracking.md` (base 70i = main post-merge 69i).
