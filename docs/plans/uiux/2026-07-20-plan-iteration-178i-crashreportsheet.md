# Plan — Iteration-178i — `CrashReportSheet` VoiceOver + i18n

**Date:** 2026-07-20 · **Scope:** iOS only · **Base:** `main` HEAD `f7a5195`
**Working branch:** `claude/laughing-thompson-8599wo`

## Target
`apps/ios/Meeshy/Features/Main/Components/CrashReportSheet.swift` — crash-report
diagnostics sheet (error state). Selected after confirming zero contention: no open
PR or tracking entry references it; its two 167i sibling candidates
(`LinkPreviewCard`, `LoadMoreRepliesCell`) are already claimed by other sessions
(#2071/#2047, #2069/#2056).

## Problem
- Icon-only `ShareLink` has no `.accessibilityLabel` → VoiceOver reads the SF
  Symbol name (HIG violation).
- Tap-to-expand crash row has no VoiceOver affordance: fragmented into 3 elements,
  no `.isButton` trait, no hint, no expanded/collapsed state, no action. Expansion
  conveyed only by geometry.
- Expanded details blob unlabeled.

## Steps
1. Group header (badge + timestamp + summary) in an inner `VStack`;
   `.accessibilityElement(children: .combine)` + `.isButton` +
   `.accessibilityValue` (expanded/collapsed) + `.accessibilityHint` +
   `.accessibilityAction { toggle }`.
2. Label the expanded details `Text` (kept outside the combined element to preserve
   `.textSelection`).
3. Add `.accessibilityLabel` to the `ShareLink`.
4. Extract `isExpanded(_:)` / `toggleExpansion(_:)` so tap gesture + a11y action
   share one animation path.
5. Add 5 inline-default localization keys (`crash.reports.share`,
   `crash.report.expand-hint`, `crash.report.expanded`, `crash.report.collapsed`,
   `crash.report.details-label`) — French defaults, no `.xcstrings` edit.

## Constraints
- No visual change, no logic change, no new test (no test references the view).
- Standard iOS 16+ SwiftUI APIs only.
- Gate: CI `ios-tests` (runs on macOS; build/VoiceOver validated there).

## Verification
- Static: modifier availability, precedent for inline `String(localized:)`.
- No test churn: grep for `CrashReportSheet` in tests = 0.
- CI `ios-tests` must be green before merge.
