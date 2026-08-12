# Iteration-191i — VoiceOver-reachable delete + heading for `GlobalSearchView` recent searches

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — recent-searches section of global search
**File touched:** `apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift`
(1 Swift file, 0 logic change, 0 new i18n key, 0 SDK change, 0 new test)

## Component

`GlobalSearchView` is the full-screen global search surface (messages /
conversations / users tabs). Its **recent-searches** block (`recentSearchesSection`,
l.290-341) shows a "Recherches récentes" header + a "Effacer" (clear-all) button,
then a list of `recentSearchRow(query)` rows. Each row is tap-to-re-run-the-search
and carries a trailing **`xmark` delete button** that removes that single entry.

The file was otherwise already well-polished: back / clear / search-field buttons
labelled, decorative icons `.accessibilityHidden(true)`, every string via
`String(localized:)`, fonts `MeeshyFont.relative(...)` (the two residual
`.system(size:)` are deliberately-frozen numeric count badges with doctrine
comments), and the tab selector already carries `.isSelected` (per 186i #2143).

## Findings

Two VoiceOver gaps in the recent-searches section:

1. **Per-row delete was unreachable via VoiceOver (real defect).**
   `recentSearchRow` wraps the whole row in
   `.accessibilityElement(children: .combine)` + `.accessibilityAddTraits(.isButton)`
   so the row reads as one "re-run this search" button (its `.onTapGesture`
   restores the query). But `.combine` **collapses the nested delete `Button`
   into the single combined element** — its action is not preserved as a separate
   VoiceOver element. A VoiceOver user could re-run a recent search but **could
   not delete an individual entry**: the only way to prune the recents list
   (short of "Effacer" wiping *all* of them) was inaccessible. This is the exact
   "secondary action nested inside a combined/tappable row → swallowed →
   unreachable" pattern resolved in 183i (`CommunityLinksView` copy action).

2. **Section header not exposed to the rotor.** The "Recherches récentes" title
   (l.305) is a visual heading but carried no `.isHeader` trait, so it was absent
   from VoiceOver's Headings rotor — the standard fast-navigation affordance for
   jumping to a section.

## Fix

Applied the canonical Apple secondary-action pattern (183i doctrine), all
additive / SSOT:

- Extracted `removeRecentSearch(_:)` as the single source of truth for the delete
  (the `withAnimation` + `viewModel.removeRecentSearch` + haptic previously inline
  in the button). Both the visible button and the new rotor action call it —
  mirrors 183i's `copyJoinLink(_:)`.
- Marked the visible `xmark` `Button` `.accessibilityHidden(true)` (kept for
  touch; its label would otherwise be dead weight inside the combined element).
- Re-exposed delete on the row via
  `.accessibilityAction(named: Text(<localized "Supprimer…">)) { removeRecentSearch(query) }`
  — reachable from the VoiceOver **Actions** rotor. Reuses the existing
  `accessibility.remove_recent_search` string (**0 new key**).
- Added `.accessibilityAddTraits(.isHeader)` to the "Recherches récentes" title so
  it appears in the Headings rotor.

The row's explicit `.accessibilityLabel` ("Recherche récente: {query}") already
overrides the combined children labels, so hiding the inner button does not change
the spoken label; it only removes a dead redundant element and lets the rotor
action carry the delete verb.

## Rationale

Recent searches are a lightweight convenience list users prune routinely; leaving
delete VoiceOver-only-via-wipe-everything is a genuine reachability regression for
a common micro-interaction. The rotor-action route preserves the row's primary
"re-run" gesture while restoring the secondary "delete" affordance — exactly how
Apple's own list rows expose swipe/secondary actions to VoiceOver. No layout,
color, animation, haptics, or logic changed; the sighted tap behaviors (re-run,
delete) are byte-identical.

## Verification

- **Static review:** `.accessibilityAction(named:_:)` (Text overload),
  `.accessibilityAddTraits(.isHeader)`, and `.accessibilityHidden` are all
  iOS 14/15/16+ APIs (app floor = iOS 16.0) with heavy precedent here — no
  availability guard. Braces balanced; the extracted `removeRecentSearch(_:)` is a
  faithful move of the former inline body.
- **No logic change:** delete and re-run go through the same `viewModel` calls as
  before; the ViewModel is untouched.
- **Test churn:** the only test referencing this surface is
  `GlobalSearchViewModelTests` (ViewModel behavior — untouched). No source-guard
  test added: consistent with the swarm precedent for pure-additive VoiceOver
  metadata (183i/184i/185i #2137 all shipped 0 new test — SwiftUI accessibility
  traits/actions aren't observable through XCTest without a UI-test harness).
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  compile + VoiceOver run happen in CI. Confirm `iOS Tests` is green before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `GlobalSearchView` results lists (`messagesResultsList` / `conversationsResultsList`
  / `usersResultsList`) are flat under the tab selector — no per-tab result-count
  announced to VoiceOver when switching tabs (candidate: `.accessibilityValue` /
  live-region count).
- `StatusBubbleOverlay` — reply affordance is a bare `.onTapGesture` with a dead
  container `.accessibilityHint` and no `.isButton`/action; the content nests both
  an audio play/stop `Button` and a conditional republish `Button`, so a correct
  fix (per-region reply button that preserves the nested buttons) is non-trivial
  and warrants its own focused iteration.

**Status: RESOLVED for `GlobalSearchView` recent-searches VoiceOver delete reachability + section heading.**
