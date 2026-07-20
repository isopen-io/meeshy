# Iteration-185i — VoiceOver labels + selected state for `MessageLanguageDetailView`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — icon-only action buttons + selected-row state
**File touched:** `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageLanguageDetailView.swift` (1 file, 0 logic, 0 visual, 2 new a11y keys inline, 0 new test)

## Component

`MessageLanguageDetailView` is the **Langue** panel of `MessageMoreSheet` — the
single entry point of the Prisme Linguistique on iOS (see `apps/ios/CLAUDE.md`
§ *UX Translation Flow*). It lists every candidate language for a message as a
selectable row (color dot + flag + name + translation preview) and, when a row
is selected, reveals a secondary panel showing the chosen translation. From
here the user picks a preferred translation, re-translates, or dismisses the
secondary panel.

The view was already sound on **Dynamic Type** (only semantic fonts —
`.footnote`/`.subheadline`/`.caption`/`.caption2`) and largely **localized**
(`message-detail.translate`, `message-detail.original`, `translation.audio.error`
via `String(localized:defaultValue:bundle:)`). The entire remaining gap was
**VoiceOver**: the file contained **zero** `.accessibilityLabel` calls, and two
of its interactive controls are **icon-only buttons**.

## Findings

**Gap 1 — icon-only "close secondary translation" button (was lines 142–148).**
The button that collapses the selected-translation panel rendered only a bare
`Image(systemName: "xmark.circle.fill")` with no text child and no
`.accessibilityLabel`. VoiceOver announced it as an unlabeled "button" — a
non-voiced user could not know it dismisses the translation preview.

**Gap 2 — icon-only "re-translate" button (was lines 270–276).**
On a row that already has a translation, a nested
`Image(systemName: "arrow.clockwise")` button re-runs NLLB translation. Same
defect: no label → VoiceOver reads only "button", with no hint that it
re-translates the row.

**Gap 3 — selected row state signalled by color/glyph only.**
The language row `Button` conveyed its **selected** state through three purely
visual channels: the name text switches to the language accent color, a tinted
`checkmark.circle.fill` replaces the trailing chevron, and a faint background
fill appears. There was **no `.accessibilityAddTraits(.isSelected)`**, so a
VoiceOver user sweeping the list heard every language read identically — the
currently active translation was indistinguishable from the rest. This is the
same **WCAG 1.4.1 (Use of Color)** "state by color only" gap resolved on prior
selectable rows (144i, 149i, 155i, 163i, 176i, 177i).

## Fix

Three additive, doctrine-standard accessibility modifiers — no layout, logic,
color, or Indigo-identity change:

- `.accessibilityLabel("Fermer la traduction")` on the `xmark.circle.fill`
  close button (key `message-detail.a11y.close-translation`).
- `.accessibilityLabel("Retraduire")` on the `arrow.clockwise` re-translate
  button (key `message-detail.a11y.retranslate`).
- `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` on the language
  row `Button` — the active translation is now announced as "selected"
  (localized by iOS, **0 new key**), replacing the color/glyph-only signal.

Both new keys use **inline `String(localized:defaultValue:bundle:.main)`**,
matching the file's existing code-only key pattern (`message-detail.translate`,
`message-detail.original`). Xcode's string catalog auto-extracts them at build —
no manual `.xcstrings` edit is required (parity with 100i/104i/164i).

The trailing status glyphs (`checkmark.circle.fill` / `chevron.right`) were left
untouched: with the `.isSelected` trait now carrying the state semantically the
glyphs are harmless visual reinforcement, and hiding them would mean reaching
into the nested-button label subtree — out of scope for this surgical pass.

## Rationale

The Langue panel is the *only* place a Prisme Linguistique user explores and
commits to a translation; a VoiceOver user must be able to (a) know the two
icon buttons dismiss/re-translate and (b) confirm which language is currently
active before leaving the sheet. The text rows and Dynamic Type were already
correct — the fix exposes the two missing labels and the selected state
semantically without touching the visible layout or the translation flow.

## Verification

- **Static review:** `.accessibilityLabel`, `.accessibilityAddTraits(cond ? [.isSelected] : [])`
  are standard SwiftUI APIs available since iOS 15 (`.isSelected` trait) / iOS 16;
  the app floor is iOS 16.0 → no availability guard. The conditional-trait
  ternary mirrors 176i (`ContactsHubView`) and 177i (`ReportMessageSheet`).
- **No visual/logic change:** only accessibility modifiers were added; the
  visible rows, selection animation, haptic, secondary panel, and translate/
  re-translate network calls are untouched.
- **No test churn:** no test references `MessageLanguageDetailView` (grep across
  `MeeshyTests` / `MeeshyUITests` / `MeeshySDKTests` = 0). Only call sites are
  `MessageMoreSheet.swift` and `AudioFullscreenView.swift`, neither asserting on
  this view.
- **CI gate:** `iOS Tests` (macOS runner). This is a Linux container, so the
  build/VoiceOver run happens in CI — confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `StatusBubbleOverlay` — the mood-bubble reply region uses `.onTapGesture`
  with an `.accessibilityHint` but no `.accessibilityAddTraits(.isButton)`, so
  VoiceOver never announces it as actionable.
- `PostDetailView` / `FeedPostCard` — a tappable `Image(systemName: "translate")`
  with `.onTapGesture { showTranslationSheet = true }` and no
  `.accessibilityLabel` / no `.isButton` trait (defect duplicated across both
  files; large feed-adjacent surfaces).
- The nested re-translate `Button` inside the row `Button` label is a deeper
  structural oddity (nested interactive controls) — a dedicated iteration could
  promote it to a row `.accessibilityAction(named:)` for cleaner VoiceOver rotor
  reachability.

**Status: RESOLVED for `MessageLanguageDetailView` VoiceOver icon labels +
selected-row state. Dynamic Type + localization were already complete.**
