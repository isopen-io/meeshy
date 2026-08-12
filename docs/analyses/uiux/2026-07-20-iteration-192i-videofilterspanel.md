# Iteration-192i — VoiceOver selected state for `VideoFiltersPanel` preset pills

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — in-call filter-preset selection
**Files touched:**
- `apps/ios/Meeshy/Features/Main/Views/VideoFiltersPanel.swift` (production, 2 additive modifiers)
- `apps/ios/MeeshyTests/Unit/Services/CallManagerAudioSessionTests.swift` (+1 source-guard test)

## Component

`VideoFiltersPanel` is the in-call video-effects panel, mounted live by
`CallEffectsOverlay(callManager:)` during a video call. Its `presetSelector` is
a horizontal scroll of preset pills — **Naturel / Chaud / Froid / Vif / Doux**
(`VideoFilterPreset.allCases`) — above the color-grading sliders
(`VideoFilterControlView`) and the blur/skin toggles.

The panel had already received a **partial** VoiceOver pass: the two advanced
`Toggle`s and two `Slider`s all carry explicit `.accessibilityLabel` /
`.accessibilityValue`, guarded by a dedicated `VideoFiltersPanelAccessibilityTests`
source-guard class. That pass **skipped the preset pills** — the exact gap
resolved here.

## Findings

**Gap 1 — selected preset signalled by color only (WCAG 1.4.1).**
`presetChip(_:)` (lines 77–104) is a `Button` whose label is
`Text(presetLabel(preset))`, so VoiceOver reads the preset *name* — but the
**active** preset is expressed through three purely visual channels and nothing
else:

- `.foregroundColor(isActive ? MeeshyColors.indigo500 : .secondary)`
- `.background(Capsule().fill(isActive ? indigo500.opacity(0.15) : …))`
- `.overlay(Capsule().stroke(isActive ? indigo500.opacity(0.4) : .clear, …))`

There was **no `.accessibilityAddTraits(.isSelected)`**, so a VoiceOver user
sweeping the row heard every preset read identically — the currently applied
filter was indistinguishable from the rest. This is the same "state by color
only" gap resolved on prior selectable rows (144i, 149i, 155i, 163i, 176i,
177i, 185i) and matches the swarm's own segmented-picker doctrine.

**Gap 2 — decorative header glyph announced.**
The header's `Image(systemName: "camera.filters")` (lines 43–45) is purely
decorative (the adjacent `Text` "Filtres vidéo" carries the meaning) but was not
`.accessibilityHidden(true)`, so VoiceOver announced the SF-Symbol name
("camera filters") redundantly before the title.

## Fix

Two additive, doctrine-standard modifiers — no layout, logic, color, or Indigo
identity change:

- `.accessibilityAddTraits(isActive ? [.isSelected] : [])` on the preset chip
  `Button` — the applied preset is now announced as "selected" (localized by
  iOS, **0 new key**), replacing the color-only signal. `isActive` was already
  in scope (`let isActive = activePreset == preset`).
- `.accessibilityHidden(true)` on the decorative `camera.filters` header glyph.

Mirrors the in-repo reference pattern `EffectsPickerView.EffectChip`
(`.accessibilityLabel(...)` + `.accessibilityAddTraits(isSelected ? .isSelected : [])`).

## Test

Extended the existing `VideoFiltersPanelAccessibilityTests` class with
`test_presetChip_conveysSelectedState_viaAccessibilityTrait()` — a source-guard
(identical style to the sibling toggle/slider guards) that asserts the
`presetChip` builder contains `.accessibilityAddTraits(` + `.isSelected`,
preventing a future regression that drops the trait.

## Rationale

Applying a video filter mid-call is a live, reversible action; a VoiceOver user
must be able to confirm which preset is currently applied before moving on. The
pill names and Dynamic Type were already correct — the fix exposes the selected
state semantically and removes the decorative glyph noise, without touching the
visible layout or the filter logic.

## Verification

- **Static review:** `.accessibilityAddTraits(cond ? [.isSelected] : [])` and
  `.accessibilityHidden(true)` are standard SwiftUI APIs (iOS 15+ `.isSelected`
  trait); app floor iOS 16.0 → no availability guard. The conditional-trait
  ternary mirrors 176i / 177i / 185i.
- **No visual/logic change:** only accessibility modifiers were added; the
  visible pills, tint/fill, selection behavior, and filter config are untouched.
- **Test churn:** +1 source-guard test in the existing
  `VideoFiltersPanelAccessibilityTests` class; no other test references the view.
- **No collision:** open PR #2161 (189i) edits the sibling
  `VideoFilterControlView.swift` (a different file) and its own analysis lists
  `VideoFiltersPanel` `presetSelector` as a *remaining* candidate — confirming
  this surface was unclaimed.
- **CI gate:** `iOS Tests` (macOS runner). This is a Linux container, so the
  build/VoiceOver run happens in CI — confirm `iOS Tests` is green before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `SiriTipsView` (`Features/Intents/MeeshyAppIntents.swift:397,407`) — hardcoded
  English `Text("Try asking Siri:")` + tip phrases, not `String(localized:)`
  (i18n candidate; verify the view is mounted first).
- `StatusBarView` (`Features/Main/Views/StatusBarView.swift:40-43`) — error-retry
  pill uses `.onTapGesture` with `.combine` but no `.accessibilityAddTraits(.isButton)`
  (already catalogued in `ACCESSIBILITY_AUDIT.md` §6.5).

**Status: RESOLVED for `VideoFiltersPanel` preset-pill selected state + header
glyph. Toggles/sliders were already labelled (prior pass); localization and
Dynamic Type were already complete.**
