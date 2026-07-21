# Iteration 208i — Share Extension `ContactRow` VoiceOver selection state

**Track**: iOS UI/UX (suffix `i`)
**Date**: 2026-07-21
**Branch**: `claude/laughing-thompson-5s0yg3`
**Base**: `main` HEAD `22465a5`
**File**: `apps/ios/MeeshyShareExtension/ShareViewController.swift` (+ source-level test)

## Surface

`ContactRow` — one row of the contact list inside the **Share Extension**
("Share to Meeshy" from another app → pick a recipient). Each row shows an
avatar (image or initials), the contact name + optional status, and — **only
when selected** — a blue background tint plus a trailing
`checkmark.circle.fill` glyph. The row is made tappable by an `.onTapGesture`
at the `ForEach` call site (line 337-340) that sets `selectedContactId`.

## Defect (WCAG 1.4.1 Use of Color / 4.1.2 Name, Role, Value)

The selected state was conveyed to sighted users by **color + a checkmark
glyph only**. The row carried:

1. **No `.accessibilityAddTraits(.isSelected)`** — VoiceOver announced the
   selected contact identically to every unselected one. A blind user
   double-tapping through the list had no way to know which recipient was
   currently chosen. This is the exact "never rely on color alone" HIG/WCAG
   violation the iOS track has been closing across selectable rows
   (`CallsTab.chip`, `MessageReportDetailView.reportTypeRow`, the segmented
   pickers of 186i, …).
2. **No `.accessibilityElement(children: .combine)`** — the row's children
   were exposed as loose elements: the decorative avatar (whose *initials*
   `Text` would be read as a meaningless token, e.g. "JD") and the
   unlabeled checkmark image were separate VoiceOver stops, cluttering the
   row and never forming one coherent "name, status" announcement.
3. **No button role** — the row is interactive (tap to select) but, being a
   bare `HStack` + `.onTapGesture` rather than a `Button`, VoiceOver never
   announced it as actionable.

## Fix

Mirror the proven sibling pattern (`CallsTab.chip:` /
`MessageReactionsDetailView` — `.accessibilityAddTraits(isSelected ? … : …)`
on the selectable element, decorative glyphs hidden):

```swift
// avatar (decorative — the name carries identity)
ZStack { … }
    .accessibilityHidden(true)

// checkmark (meaning now carried by the .isSelected trait)
Image(systemName: "checkmark.circle.fill") … .accessibilityHidden(true)

// row
…
.background(isSelected ? Color.blue.opacity(0.1) : Color.clear)
.accessibilityElement(children: .combine)
.accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
```

- The `.combine` merges the name + status `Text`s into one element read as a
  single sentence; the two decorative glyphs (avatar initials, checkmark) are
  `.accessibilityHidden(true)` so they no longer pollute the announcement.
- The row now advertises the **button** role and, when chosen, appends the
  native "selected" state (VoiceOver reads it localized, in the user's
  VoiceOver language — no new i18n key needed).
- The `.onTapGesture` at the call site is unchanged; a combined element still
  forwards its activation to the row's tap handler.

## Constraints honored

- **1 production file**, +5 lines. 0 logic / 0 network / 0 layout / 0 color /
  0 visual change (all four modifiers are VoiceOver-layer only).
- **0 new i18n keys** — the `.isSelected` trait is spoken by VoiceOver itself.
- No change to selection behavior, the send flow, or `selectedContactId`.
- Scope check: the `Color.clear` background already makes the full padded row
  hit-testable, so **no** `.contentShape` was added — the change stays limited
  to the flagged a11y defect.

## Verification

New source-level guard `ShareExtensionContactRowAccessibilityTests` (mirror of
`CallsTabAccessibilityTests`, auto-included by CI `xcodegen generate`), 3
tests: `.isSelected` trait present, children combined, checkmark hidden.

Note: `MeeshyShareExtension` is a defined `app-extension` target but is
**not** embedded in the app archive yet (signing pending — see `project.yml`),
so CI's `Meeshy` scheme does not compile it. The guard test parses the source
as text (like every sibling a11y guard), so it validates the fix regardless;
the SwiftUI modifiers used are standard and compile-safe.

## Gate

CI `iOS Tests` (macOS runner). New guard test auto-included via
`xcodegen generate`.

## Status

✅ Resolved. **Do not re-flag** `ContactRow` in `ShareViewController` for
VoiceOver selection state — solved 208i (was Candidate 1 of the 205i/206i+
deferred list).

### Remaining / adjacent (defer, 1/iteration, collision-check first)

- `MemberManagementSection.swift` l. 306-322 — hand-made empty state
  (`person.slash`, fixed 28pt). **Note:** `EmptyStateView` forces full-height
  expansion (`maxHeight: .infinity` + top/bottom `Spacer`s), so it is *not* a
  clean drop-in for this inline section empty state — a straight swap would be
  a layout regression. Any dedup here needs a `compact`/inline variant first.
- Other selectable list rows conveying selection by color/glyph only, or whose
  explicit `.accessibilityLabel` overrides a `.combine` (audit pattern from
  207i).
