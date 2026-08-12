# Plan — Iteration 169i — ConversationPreferencesTab (iOS VoiceOver + design-system)

- **Date**: 2026-07-19
- **Branch**: `claude/laughing-thompson-yz1i24`
- **Base**: `main` HEAD `c216f23`
- **Scope**: iOS only — `apps/ios/Meeshy/Features/Main/Components/ConversationPreferencesTab.swift` (1 file)

## Surface
`ConversationPreferencesTab` — the per-conversation preferences form (custom name,
reaction, pin, category, tags, mute, mentions-only, archive/leave/delete). Fresh
surface: no prior UI/UX analysis, not in flight in any open PR (swarm max = 168i).

## Problems (VoiceOver / HIG)
1. **Unlabeled switches** — the 3 toggle rows (Pin / Muet / Mentions seulement) render
   `Toggle("", isOn:)` with `.labelsHidden()`. The title `Text` is a *sibling* element,
   not associated with the control, so VoiceOver announces the switch with **no label**
   ("switch, off"). Information is carried by an adjacent text, not the control itself.
   Meaning conveyed by proximity only → HIG violation.
2. **Unlabeled clear button** — the custom-name field's `xmark.circle.fill` button is a
   bare `Image` inside a `Button` with no `accessibilityLabel` → VoiceOver reads the raw
   symbol name / nothing actionable.
3. **Decorative chevron not hidden** — the reaction row's `chevron.right` disclosure glyph
   is combined into the Button's label, adding noise ("…, chevron right").
4. **Duplication** — the 3 toggle rows repeat the same `Toggle("") + labelsHidden + tint`
   boilerplate inline. Sibling screen `PrivacySettingsView` already factored this into a
   `privacyToggle` helper.

## Fix (convention-aligned, zero-regression)
Mirror the proven `PrivacySettingsView.privacyToggle` pattern (same `settingsRow`/
`settingsSection` builder family):

1. Extract `settingsToggleRow(icon:iconColor:title:tint:isEnabled:isOn:)` — wraps
   `settingsRow` + `Toggle` and applies `.accessibilityLabel(title)` on the toggle
   (labels the switch) + `.disabled(!isEnabled)` + row `.opacity` for the disabled state.
2. Replace the 3 inline toggle rows (Pin / Muet / Mentions) with the builder.
   Mentions passes `isEnabled: !isMuted` (preserves current disable+dim behavior).
3. Add `.accessibilityLabel` to the custom-name clear button.
4. `.accessibilityHidden(true)` on the reaction disclosure chevron (decorative).

## Non-goals / preserved
- Dynamic Type already solved: body text uses `MeeshyFont.relative`; the fixed `.system(size:14)`
  badge glyphs are 86i doctrine (fixed 28×28 frame + `accessibilityHidden`) — untouched.
- No logic / networking / layout / color changes. No new i18n keys (reuses existing
  `conversation.prefs.*` titles). No new tests (pure a11y attributes, no behavior change).

## Gate
CI `iOS Tests` (compile + XCTest). No ViewModel behavior touched.
