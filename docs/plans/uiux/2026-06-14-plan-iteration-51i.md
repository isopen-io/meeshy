# Plan — Iteration 51i (2026-06-14)

## Objectif
iOS only. Adopter le Liquid Glass iOS 26 sur le menu d'actions long-press (interaction
cœur), corriger la fidélité du fallback `AdaptiveGlass` teinté, et supprimer du code mort.
Itération bornée, « logique épurée ».

## Base
- Branche : `claude/upbeat-euler-oc9dm6` (synchronisée sur `main` HEAD `6d08f805`).

## Changements

### 1. `packages/MeeshySDK/.../Compatibility/AdaptiveGlass.swift` (SDK)
- [x] `adaptiveGlassRegularFallback(tint:)` : empiler la teinte au-dessus de
      `.ultraThinMaterial` (le flou est le trait définissant le glass). API inchangée.
- [x] Doc-comment mis à jour.

### 2. `apps/ios/.../Views/ContextActionMenu.swift` (app)
- [x] Remplacer le trio material+gradient+strokeBorder par
      `.adaptiveGlass(in: Capsule(), tint: accent.opacity(0.18))`.
- [x] Conserver les 2 ombres d'élévation + le séparateur capsule + `estimatedSize`.
- [x] Doc-comment du `struct` mis à jour (Liquid Glass + atome partagé).

### 3. `apps/ios/.../Views/OverlayMenu.swift` (app) — dead code
- [x] Supprimer le fichier (jamais instancié ; FR durs + `.white` + boutons no-op).
- [x] Retirer les 4 références dans `Meeshy.xcodeproj/project.pbxproj`.

## Vérification
- [x] `grep` repo-wide : aucune instanciation `OverlayMenu(` restante ; aucune ref
      standalone dans le pbxproj (seules les refs `MessageOverlayMenu` subsistent).
- [ ] CI `ios-tests.yml` verte (compile + tests simulateur) — seule vérif de build possible
      (pas de build local SwiftUI sur Linux). Smoke test `CompatibilityLayerTests` couvre
      l'API surface inchangée d'`adaptiveGlass`.

## Merge
- [ ] PR → `main`, merge après CI verte. Supprimer la branche. Mettre à jour
      `branch-tracking.md` (Next iteration 52, base = main post-merge 51i).
