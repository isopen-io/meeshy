# Iteration-178i — i18n + VoiceOver + Dynamic Type for `CategoryPickerView`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Localization (i18n) + Accessibility (VoiceOver, WCAG 1.4.1) + Dynamic Type
**File touched:** `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerView.swift`
(1 file, 0 logic, 0 new test)

## Component

`CategoryPickerView` is the conversation-category selector/creator — a compact
inline list (SDK `PreferenceService`) rendered in conversation preference
surfaces. Each row is a tappable category; a footer row toggles an inline
"create category" field (name TextField + confirm button). It was one of the
few un-polished MeeshyUI primitives: no `String(localized:)`, no
`.accessibilityLabel`, and all sizing via fixed `.font(.system(size:))`.

## Findings

Three distinct gap classes, all low-risk (additive, no behavior change):

1. **Three hardcoded, unlocalized French string literals.** The TextField
   placeholder `"Nom de la catégorie"` (line 54) and the `Text("Nouvelle
   catégorie")` button (line 76) shipped raw French, bypassing the MeeshyUI
   `String(localized:defaultValue:bundle:.module)` idiom used everywhere else in
   the target (e.g. `ConversationSettingsView`). No key, no fallback structure.

2. **Icon-only confirm button, mute to VoiceOver.** The create-confirm button
   (lines 58–63) was a bare `checkmark.circle.fill` SF Symbol with no
   `.accessibilityLabel`. VoiceOver announced "button" with no name — a user
   could not tell what it did.

3. **Selected state conveyed by color/icon only (WCAG 1.4.1).** The selected
   category row was marked *only* by a trailing blue `checkmark` glyph inside the
   row `Button`. VoiceOver never announced the row as "selected" — the state was
   a pure visual channel.

Secondary: all seven `.font(.system(size: 14/15))` were fixed-point (no Dynamic
Type scaling). None sit in a fixed-size frame, so all are mechanically
migratable.

## Fix

- **i18n (3 strings, code-only `defaultValue`, 0 xcstrings):**
  - `category.picker.new.placeholder` → "Nom de la catégorie" (TextField)
  - `category.picker.new.button` → "Nouvelle catégorie" (footer button)
  - `category.picker.create.a11y` → "Créer la catégorie" (new confirm a11y label)
  All via `String(localized: …, defaultValue: …, bundle: .module)` — the
  established MeeshyUI SPM-resource idiom. Runtime falls back to the French
  `defaultValue`; Xcode auto-extracts the keys into `Localizable.xcstrings` on
  the next local build (doctrine 164i — no manual 28k-line catalog edit).

- **VoiceOver:**
  - `.accessibilityLabel("Créer la catégorie")` on the confirm button.
  - `.accessibilityAddTraits(selectedCategoryId == category.id ? .isSelected : [])`
    on each category row — the selected state is now announced ("selected",
    localized by iOS, 0 extra key), fixing WCAG 1.4.1.
  - `.accessibilityHidden(true)` on the 4 decorative glyphs (`folder.fill`,
    `checkmark`, `folder.badge.plus`, `plus.circle.fill`) so VoiceOver reads each
    control by its text/label, not the icon.

- **Dynamic Type:** 7 `.font(.system(size: 14/15[, weight:]))` →
  `MeeshyFont.relative(14/15[, weight:])` (weight preserved). Icons and their
  sibling labels now scale in lockstep with the user's text-size setting.

## Rationale

Localization, VoiceOver, and Dynamic Type are all explicitly in scope. This
primitive gates conversation organization — a user relying on VoiceOver
previously could neither name the confirm button nor perceive which category was
active, and a raw French placeholder blocked localization of every surface that
embeds the picker. Every fix is additive: no logic, layout, color, or animation
change (Indigo `#3B82F6` accents preserved verbatim), so snapshots are
unaffected.

## Verification

- **Static review:** all modifiers are standard SwiftUI iOS 16.0+ APIs
  (`accessibilityLabel`, `accessibilityAddTraits`, `accessibilityHidden`).
  `MeeshyFont.relative` and `bundle: .module` + `String(localized:defaultValue:)`
  all have direct precedent in the same target (`ChatBubble`, `SwipeableRow`,
  `ConversationSettingsView`). App floor iOS 16.0 → no availability guard.
- **No test churn:** no test references `CategoryPickerView` (grep across
  `MeeshySDKTests` / `MeeshyUITests` / `MeeshyTests` = 0). No public API changed
  (`init(selectedCategoryId:)` unchanged); `PreferenceService` calls untouched.
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations)

- `CategoryPickerField.swift` (sibling, ~204 lines) has the same French-literal
  gap (`Text("Créer \"\(query)\"")`, `"Retirer la catégorie …"`) — its buttons
  already carry labels, so a localization-only pass. Open candidate.
- `TagInputField.swift` — every user-facing string (incl. a11y labels) is raw
  French; buttons already labelled → clean localization-only candidate.

**Status: RESOLVED for `CategoryPickerView` i18n + VoiceOver + Dynamic Type.**
