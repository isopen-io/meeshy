# Iteration-178i — VoiceOver selection state for `MessageReportDetailView`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — selection state not conveyed to non-sighted users
**File touched:** `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageReportDetailView.swift` (1 file, 0 logic, 0 new test, 0 new i18n key)

## Component

`MessageReportDetailView` is the message-report surface extracted from the
legacy `MessageDetailSheet.reportTabContent`. It renders one selectable
`reportTypeRow` per `ReportType` (`ForEach(ReportType.allCases)`), an optional
free-text detail field, and a destructive send button gated behind a
`.confirmationDialog`. Choosing a reason sets `selectedReportType`; the row
re-styles to show it is chosen.

## Findings

The screen was already fully localized (every string goes through
`String(localized:defaultValue:bundle:)`) and its confirmation flow is
guarded by `ConversationMenuSystemDesignGuardTests`. One accessibility gap
remained:

**Selected report reason conveyed by color + checkmark only.** In
`reportTypeRow` (lines 100–144) the chosen reason is signalled purely through
visual channels — the leading glyph and background tint switch to
`MeeshyColors.error`, and a `checkmark.circle.fill` appears on the trailing
edge. The row is a `Button` with no `.accessibilityAddTraits(.isSelected)`, so
VoiceOver announces each reason's label and description identically whether or
not it is the active choice. A non-sighted user selecting a reason gets no
confirmation of which one is active — a HIG violation ("never rely on color
alone to convey state"). Secondarily, the two decorative SF Symbols (the
leading `type.icon`, restated verbatim by the reason label, and the selection
`checkmark.circle.fill`) were swept into the button's accessibility element,
so VoiceOver read raw symbol names ("checkmark circle fill") as noise.

## Fix

Mirrored the doctrine already proven by the sibling file
`MessageReactionsDetailView.swift:101–104` (its `reactionFilterCapsule` uses
exactly this pattern with a justifying comment):

- `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` on the row
  `Button` — VoiceOver now speaks "selected" on the active reason. The empty
  array on the non-selected branch is a no-op, so untouched rows are unchanged.
- `.accessibilityHidden(true)` on the leading `type.icon` glyph — decorative,
  the reason label immediately restates its meaning.
- `.accessibilityHidden(true)` on the `checkmark.circle.fill` glyph — the
  selection meaning is now carried by the `.isSelected` trait, so the raw
  symbol name is removed from the announcement.

Net VoiceOver reading of the active row becomes "«reason label», «description»,
selected, button" instead of a color-only distinction buried in glyph noise.
No layout, no color, no behavior, no string change — the Indigo/error visual
identity and the confirmation flow are untouched.

## Rationale

"State conveyed by color only" is explicitly in the accessibility review
scope, and a moderation action (reporting a message) is exactly where a user
must be certain of their selection before the destructive confirmation dialog.
The `.isSelected` trait is the canonical Apple affordance for a chosen item in
a mutually-exclusive list; hiding the two decorative glyphs is the standard
companion cleanup (same shape as 164i `InviteFriendsSheet`, 175i, and the
sibling reactions view). One-line-per-concern, zero-risk, and the fix already
has an in-repo precedent proving the exact API.

## Verification

- **Static review:** `.accessibilityAddTraits(cond ? [.isSelected] : [])` and
  `.accessibilityHidden(true)` are standard SwiftUI iOS 16.0+ APIs (app floor
  is iOS 16.0, no availability guard needed). The `.isSelected`-via-ternary
  form is byte-for-byte the sibling `MessageReactionsDetailView.swift:104`
  precedent.
- **Guard test unaffected:** `ConversationMenuSystemDesignGuardTests
  .test_report_requestsConfirmation_beforeSubmit` asserts the file still
  contains `showReportConfirm = true`, the `.confirmationDialog(` +
  `isPresented: $showReportConfirm` wiring, and that `onReport?(` appears
  exactly once. This change adds only accessibility modifiers and comments —
  none of those tokens are touched, and the added comments contain no
  `onReport?(` substring, so the count stays 1.
- **No other test churn:** no test exercises `reportTypeRow` behavior; the
  view's public surface (`message`, `onReport`, `onDismiss`) is unchanged.
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations)

- `PeopleDiscoveryView` sub-tab selector conveys the active tab by color only
  (no `.isSelected` trait) — same defect class, next candidate.
- `BlockedTab.emptyState` is a hand-rolled empty-state `VStack` (icon + title)
  that native `ContentUnavailableView` covers — modest consistency win.

**Status: RESOLVED for `MessageReportDetailView` VoiceOver selection state.**
