# Plan — Iteration 53i (2026-06-30)

## Objectif
iOS only. **Adoption Liquid Glass iOS 26 — lot 3** : surfaces à **stroke en dégradé accent**
(différées 52i), via la technique affinée **glass natif neutre + stroke dégradé en overlay**.
2 fichiers, « épuré ».

## Base
- Branche : `claude/upbeat-euler-q2nl32` (resync sur `main` HEAD `6a2a8f6`, post #1075/52i).

## Changements

### 1. `apps/ios/.../Components/StatusBubbleOverlay.swift` (app)
- [x] `bubbleContent` : `.background(RoundedRectangle.fill(.ultraThinMaterial).overlay(stroke).shadow)`
      → `.adaptiveGlass(in: RoundedRectangle(14, .continuous))` + `.overlay(stroke dégradé)` + `.shadow`.
- [x] `thoughtCircle` décoratifs laissés en `.ultraThinMaterial` (atomes minuscules).
- [x] Doc-comment inline.

### 2. `apps/ios/.../Components/ContactCardView.swift` (app)
- [x] `.background(RoundedRectangle.fill(.ultraThinMaterial).overlay(stroke))`
      → `.adaptiveGlass(in: RoundedRectangle(14, .continuous))` + `.overlay(stroke dégradé)`.
- [x] Résout le différé 52i (stroke préservé explicitement). Doc-comment inline.

## Vérification
- [x] `@_exported import MeeshyUI` → `adaptiveGlass` dispo sans import neuf.
- [x] Aucun test ne référence ces 2 composants. Aucune édition pbxproj (XcodeGen glob).
- [ ] CI `ios-tests.yml` verte (compile + tests simulateur).

## Merge
- [ ] PR → `main`, merge après CI verte. Supprimer la branche.
- [ ] `branch-tracking.md` : dernière itération iOS = 53i, base suivante = main post-merge.
</content>
