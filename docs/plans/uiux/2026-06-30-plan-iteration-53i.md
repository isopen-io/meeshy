# Plan — Iteration 53i (2026-06-30)

## Objectif
iOS only. **Adoption native iOS 26 Liquid Glass — lot 3** sur les **3 surfaces flottantes
sœurs de la couche `CallEffectsOverlay`** (effets pendant un appel), via l'atome SDK
`adaptiveGlass`. Itération bornée, « épurée » : 3 swaps 1:1 fidèles, aucune surcharge.

## Base
- Branche : `claude/upbeat-euler-8qmu0h` (resynchronisée sur `main` HEAD `a11d271`, post #1076/#1079).

## Changements

### 1. `apps/ios/.../Views/AudioEffectsPanel.swift` (app)
- [x] `.background(.ultraThinMaterial)` → `.adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg))`
      avant le `.clipShape(...)` existant. Neutre (chrome OS). Doc-comment inline.

### 2. `apps/ios/.../Views/VideoFiltersPanel.swift` (app)
- [x] Idem panneau parent. **`VideoFilterControlView` imbriqué laissé en `.ultraThinMaterial`**
      (matériau-sur-verre HIG ; jamais verre-dans-verre). Doc-comment inline.

### 3. `apps/ios/.../Views/CallEffectsOverlay.swift` (app — `secondaryToolbar`)
- [x] `.background(.ultraThinMaterial)` → `.adaptiveGlass(in: Capsule())` avant le
      `.clipShape(Capsule())` existant (1:1 `FloatingCallPillView`/`MiniAudioPlayerBar`).
      Doc-comment inline.

## Vérification
- [x] Les 3 fichiers importent déjà `MeeshyUI` (où vit `adaptiveGlass`).
- [x] Aucune édition `project.pbxproj` (XcodeGen globbe les `.swift`).
- [x] `VideoFilterControlView` n'est utilisé qu'au sein de `VideoFiltersPanel` (grep) →
      pas de régression de migration partielle.
- [x] 0 `ultraThinMaterial` résiduel hors commentaires dans les 3 fichiers.
- [ ] CI `ios-tests.yml` verte (compile + tests simulateur).

## Merge
- [ ] PR → `main`, merge après CI verte. Supprimer la branche.
- [ ] `branch-tracking.md` : dernière itération iOS = 53i, base suivante = main post-merge.
