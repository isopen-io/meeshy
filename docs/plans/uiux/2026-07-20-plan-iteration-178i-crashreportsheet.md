# Plan — Iteration-178i — `CrashReportSheet` native disclosure + ShareLink label

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** HIG (native disclosure) + Accessibility (VoiceOver) + Discoverability
**Target file:** `apps/ios/Meeshy/Features/Main/Components/CrashReportSheet.swift`

## Problem

`CrashReportSheet` lists crash diagnostics as expandable rows. Two gaps:

1. **Custom tap-to-expand with no affordance.** Each row is a `VStack`
   carrying `.contentShape(Rectangle()).onTapGesture { toggle }`. There is
   **no visual hint** the row expands (no chevron), and VoiceOver treats the
   `VStack` as plain text — it is not announced as a button, has no
   expanded/collapsed state, and is not reachable by Full Keyboard Access or
   Switch Control. Reinvents a behavior Apple ships natively.

2. **Icon-only `ShareLink`.** The toolbar `ShareLink(item:)` wraps only a
   `square.and.arrow.up` Image with no `.accessibilityLabel` — VoiceOver has
   no meaningful name for the control.

## Fix

1. Replace the `VStack` + `.onTapGesture` with a native **`DisclosureGroup`**
   (iOS 14+, well under the iOS 16 floor):
   - `label:` holds the existing badge + timestamp + summary header.
   - content closure holds the `report.details` monospaced text, keeping
     `.textSelection(.enabled)`.
   - A per-row `Binding<Bool>` preserves the current **single-open accordion**
     (`expandedId`) — its setter clears siblings inside the same
     `withAnimation(.spring...)` as before.
   - DisclosureGroup natively provides the chevron affordance, the
     "expanded/collapsed" VoiceOver announcement, the `.isButton` semantics,
     and keyboard/Switch Control support — all for free, replacing the custom
     gesture.

2. Add `.accessibilityLabel` to the `ShareLink` (1 new localized key
   `crash.reports.share`, FR default "Partager les rapports").

## Non-goals

- No change to `CrashDiagnostic`, `kindBadge`, `formatAllReports`, colors,
  or the Indigo identity.
- No new test (no test references `CrashReportSheet`; grep = 0).

## Verification

- Static review: `DisclosureGroup(isExpanded:content:label:)` is standard
  SwiftUI, iOS 14+. Single-open accordion preserved via computed binding.
- `iOS Tests` (macOS CI) is the build/VoiceOver gate — confirm green on PR.
