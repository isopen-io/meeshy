# Plan — Iteration 52i (2026-06-30)

## Objectif
iOS only. **Adoption native iOS 26 Liquid Glass — lot 2** sur deux surfaces flottantes
neutres et content-agnostic, via l'atome SDK `adaptiveGlass`. Itération bornée, « épurée » :
2 fichiers, swaps 1:1 fidèles, aucune surcharge ajoutée.

## Base
- Branche : `claude/upbeat-euler-q2nl32` (resynchronisée sur `main` HEAD `19682db`, post #1072).

## Changements

### 1. `apps/ios/.../Components/MentionSuggestionPanel.swift` (app)
- [x] `.background(.ultraThinMaterial)` → `.adaptiveGlass(in: Rectangle())` (neutre, pas de
      teinte — chrome OS comme la QuickType bar). Clip-shape vérifiée : aucune → `Rectangle()`.
- [x] Doc-comment inline.

### 2. `apps/ios/.../Components/MiniAudioPlayerBar.swift` (app)
- [x] `.background(.ultraThinMaterial)` → `.adaptiveGlass(in: Capsule())` avant le
      `.clipShape(Capsule())` existant (1:1 avec `FloatingCallPillView`).
- [x] Doc-comment inline (HIG glass-in-glass).

## Vérification
- [x] Les deux fichiers importent déjà `MeeshyUI` (où vit `adaptiveGlass`).
- [x] Aucune édition `project.pbxproj` (XcodeGen globbe les `.swift`).
- [x] `MiniAudioPlayerBarTests` comportemental (visibilité/taps/routing) → inchangé.
- [ ] CI `ios-tests.yml` verte (compile + tests simulateur).

## Merge
- [ ] PR → `main`, merge après CI verte. Supprimer la branche.
- [ ] `branch-tracking.md` : dernière itération iOS = 52i, base suivante = main post-merge.
</content>
