# Iteration-176i — VoiceOver selection traits for `StatusComposerView`

**Date:** 2026-07-19
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — selection state on the mood/visibility composer
**File touched:** `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift` (1 file, 0 logic, 0 new test, 0 new i18n key)

## Component

`StatusComposerView` is the sheet used to publish (and republish) a mood
status. It has two selection surfaces:

- **Emoji mood grid** (`emojiButton(_:)`, lines 127-161) — a 5-column
  `LazyVGrid` of tappable emoji. The chosen mood becomes the payload's
  `emoji` and gates the Publish button.
- **Visibility picker** (`visibilityPicker`, lines 238-286) — a horizontal
  capsule rail (`Public` / `Communautés` / `Contacts` / `Sauf…` /
  `Seulement…` / `Privé`) driving `selectedVisibility`.

The view was already fully localized (`String(localized:defaultValue:)`
everywhere) and Dynamic-Type-clean (`MeeshyFont.relative(…)` throughout).

## Finding

Both selection controls conveyed the **selected** state through **color and
shape only**, with nothing exposed to VoiceOver — a direct violation of the
routine's "never rely only on color to convey meaning" rule:

1. **Emoji mood button** (lines 138-158). Selection was rendered as an
   indigo fill (`indigo500.opacity(0.15)`), an `avatarRingGradient` stroke,
   and a `scaleEffect(1.1)`. The button carried **no** `.accessibilityAddTraits`
   / `.accessibilityValue`. VoiceOver announced each cell as just the emoji's
   native name ("grinning face", "loudly crying face"…) with no way to tell
   which mood was currently chosen — the selection was a pure color/geometry
   channel.

2. **Visibility capsule** (lines 257-265). The selected capsule was `white`
   text on `MeeshyColors.brandGradient`; the unselected ones were
   `theme.textSecondary` on `theme.inputBackground`. Again **no**
   `.isSelected` trait, so a VoiceOver user swiping the rail heard six
   identical "Public / Contacts / …" buttons with no indication of the active
   audience — conveyed exclusively by the indigo fill.

Additionally, the visibility capsule's leading SF Symbol
(`Image(systemName: vis.icon)`) had no accessibility label, so VoiceOver
would fall back to reading the raw symbol name alongside the already-explicit
text label — redundant noise.

## Fix

Applied the canonical Apple selection idiom (no visual change, no behavior
change):

- **Emoji button** — appended
  `.accessibilityAddTraits(selectedEmoji == emoji ? .isSelected : [])`. When a
  mood is active, VoiceOver now appends "Selected" to that cell; the emoji's
  native name stays the label (no `.accessibilityLabel` override, so the
  meaningful Unicode name is preserved).

- **Visibility capsule** — appended
  `.accessibilityAddTraits(selectedVisibility == vis ? .isSelected : [])` on
  the `Button`, and marked the decorative leading icon
  `.accessibilityHidden(true)` (the localized `vis.label` text already carries
  the meaning, so the symbol name is pure noise).

The `cond ? .isSelected : []` shape is the same empty-`AccessibilityTraits`
pattern already used across the iOS surface (e.g. 167i `UploadProgressBar`'s
`.accessibilityAddTraits(isUploading ? .updatesFrequently : [])`).

## Rationale

Selection state is exactly the "stateful control" case the accessibility
review scope calls out (`.accessibilityValue()` / selection traits for
controls). A VoiceOver user picking their mood and audience previously had no
audible confirmation of either choice — the single most important state on the
screen was invisible to them. `.isSelected` is the native, HIG-endorsed way to
surface it, and folding the redundant icon out of the announcement makes the
capsule read as one clean "Public, Selected" phrase. Zero visual change keeps
the Indigo brand identity and the composer's layout untouched.

## Verification

- **Static review:** `.accessibilityAddTraits(_:)` and
  `.accessibilityHidden(_:)` are standard SwiftUI iOS 13/14+ APIs; app floor is
  iOS 16.0, no availability guard needed. `.isSelected` is a member of
  `AccessibilityTraits`; `[]` is the empty option set — the ternary type-checks.
- **No new strings / no logic:** `PostVisibility.label` (localized) and the
  emoji payload are unchanged; publish/draft-recovery/audience-picker logic is
  untouched.
- **No test churn:** no test references `StatusComposerView` (grep across
  `MeeshyTests` / `MeeshyUITests` / `MeeshySDKTests` = 0).
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations)

- The character-count overlay (`Text("\(statusText.count)/122")`, line 186) is a
  raw interpolation — visible-only, terse-by-design, but a future pass could
  give it an `.accessibilityLabel` phrasing the remaining characters.
- `ReportMessageSheet` `reportTypeRow` and `MessageReportDetailView`
  `reportTypeRow` share the identical "selection is icon/color-only" gap
  (checkmark + tint, no `.isSelected`) — clean paired follow-ups.
- `ConversationEncryptionDetailSheet` line ~250 has one hardcoded English error
  literal (`"Unable to read status: …"`) that bypasses `String(localized:)`.

**Status: RESOLVED for `StatusComposerView` VoiceOver selection semantics.**
