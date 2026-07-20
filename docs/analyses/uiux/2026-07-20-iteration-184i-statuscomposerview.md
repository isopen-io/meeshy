# Iteration-184i — VoiceOver selected-state for `StatusComposerView` pickers

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — mood-emoji picker + visibility-audience picker
**File touched:** `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift` (1 file, 0 logic, 0 new key, 0 SDK change, 0 new test)

## Component

`StatusComposerView` is the sheet used to publish a **mood/status** (« Comment tu
te sens ? »). It has two selectable controls:

1. **Mood-emoji grid** (`emojiButton`, l.127-160) — a `LazyVGrid` of emoji
   `Button`s; picking one arms the publish button (single-select, tap-again
   deselects).
2. **Visibility picker** (`visibilityPicker`, l.238-267) — a horizontal
   scroll of audience chips (`PostVisibility.composerSelectableCases` — Public /
   Communautés / Contacts / Sauf… / Seulement…) driving who sees the mood.

The file was already **otherwise polished**: every visible string via
`String(localized:)`, `MeeshyFont.relative(...)` used everywhere (Dynamic Type
sound), the toolbar close button labelled, and — critically — the chip labels
(`vis.label`) already resolve to `String(localized:)` values in the SDK
(`packages/MeeshySDK/Sources/MeeshyUI/Story/PostVisibility.swift:35-44`), so
**no i18n and no SDK change** were needed. The entire remaining gap was
VoiceOver selected-state.

## Findings

Both selectable controls conveyed their **selected** state through purely
visual channels and nothing semantic:

- **Emoji button** (l.144-158): selection = background fill
  (`indigo500.opacity(0.15)`) + a gradient border ring (`avatarRingGradient`) +
  `.scaleEffect(1.1)`. No `.accessibilityAddTraits(.isSelected)`.
- **Visibility chip** (l.257-264): selection = foreground color (`.white` vs
  `theme.textSecondary`) + background fill (`brandGradient` vs
  `inputBackground`). No `.accessibilityAddTraits(.isSelected)`.

A VoiceOver user sweeping either control heard every option read identically —
the armed mood and the chosen audience were **indistinguishable** from the
others. This is a **WCAG 1.4.1 (Use of Color)** failure and the exact
"state signalled by color/icon/scale only" gap resolved on prior selectable
rows (144i tab bar, 149i `ChangePasswordView` checklist, 155i
`MessageReactionsDetailView` capsules, 163i `AudioCarouselView`, 176i
`ContactsHubView` tab bar, 177i `ReportMessageSheet` radios).

## Fix

Applied the canonical Apple selectable-control pattern, one additive modifier
per control:

- `.accessibilityAddTraits(selectedEmoji == emoji ? [.isSelected] : [])` on the
  emoji `Button` — the armed mood is now announced as "selected" (localized by
  iOS, **0 new key**).
- `.accessibilityAddTraits(selectedVisibility == vis ? [.isSelected] : [])` on
  the visibility chip `Button` — the chosen audience is now announced as
  "selected".

No `.accessibilityLabel` override and no `.accessibilityElement(children:)` were
needed: each control is a plain `Button { } label: { HStack/Text }` with **no
nested buttons**, so SwiftUI already aggregates the label subtree into one
element with the `.isButton` trait and derives a correct label (the emoji's
spoken name for the grid; `vis.label` — including the live "(3)" audience count
when present — for the chip). Forcing `.combine` would fight that default; the
minimal, correct move is adding only the state trait. The conditional-trait
ternary mirrors 155i / 176i / 177i.

## Rationale

Publishing a mood is a frequent, expressive action, and the audience picker is
a **privacy-relevant** control — a VoiceOver user must be able to confirm both
*which* mood is armed and *who* will see it before tapping Publier. The labels
and Dynamic Type were already correct; the only missing signal was the selected
state, which the fix now exposes semantically without touching layout, color,
animation, logic, or the Indigo visual identity.

## Verification

- **Static review:** `.accessibilityAddTraits(cond ? [.isSelected] : [])` is a
  standard SwiftUI iOS 16.0+ API with heavy precedent in this codebase. App
  floor is iOS 16.0 — no availability guard needed.
- **No visual/logic change:** the fix adds only accessibility modifiers; the
  visible chips, emoji grid, selection animations, haptics, audience sheet, and
  publish flow are untouched. Sighted tap behavior and the nested audience
  `.sheet` are unaffected (accessibility modifiers don't alter hit-testing).
- **No test churn:** no test references `StatusComposerView` (grep across
  `MeeshyTests` / `MeeshyUITests` / `MeeshySDKTests` = 0). `PostVisibility.label`
  mappings are unchanged.
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `StatusBubbleOverlay` — the reply affordance is a bare `.onTapGesture` on the
  bubble content (no `.isButton`/action for VoiceOver), and the audio
  `ProgressView` has no `.accessibilityValue`. **Deferred:** the content nests
  both an audio play/stop `Button` and a conditional republish `Button`, so a
  correct combine/named-action fix is non-trivial and warrants its own focused
  iteration.
- `ConversationDashboardView` `periodPicker` — `ChartPeriod.all = "Tout"`
  (hardcoded French rendered via `Text(period.rawValue)`) + color/weight-only
  selection with no `.isSelected` trait (i18n + a11y candidate; large file).
- `AudioFullscreenView` — playback-speed pills and `languagePill` carry
  color-only selection with no `.isSelected` trait and no `.accessibilityLabel`
  (large file).

**Status: RESOLVED for `StatusComposerView` VoiceOver selected-state.**
