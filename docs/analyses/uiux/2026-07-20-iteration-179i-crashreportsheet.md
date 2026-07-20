# Iteration-179i — VoiceOver structure for `CrashReportSheet`

**Date**: 2026-07-20
**Surface**: `apps/ios/Meeshy/Features/Main/Components/CrashReportSheet.swift`
**Type**: Accessibility (VoiceOver) — purely a11y, no visual/logic change
**Branch**: `claude/laughing-thompson-inlj3k`

## Context

`CrashReportSheet` presents the pending `CrashDiagnostic` reports (kind badge +
relative timestamp + summary, with an expandable monospaced details block). Fresh
surface — no prior UI/UX analysis, no open PR touches it (verified via
`list_pull_requests`, 178i swarm in flight). Typography is **already 100 %
semantic** (`.caption2`, `.subheadline`, `.caption2.monospaced`) → **0 Dynamic
Type migration**, itération purely VoiceOver.

## Real gaps found

1. **Expandable row not exposed as interactive** — the report cluster used a bare
   `VStack + .contentShape(Rectangle()).onTapGesture` to toggle the details block.
   For VoiceOver this exposed the badge label, timestamp and summary as **3 separate
   stops**, none carrying the `.isButton` trait or any hint that a double-tap reveals
   details. A VoiceOver user had no way to know the row was interactive nor what
   activating it does (fails HIG "make interactive elements discoverable").

2. **Icon-only `ShareLink`** — the toolbar share affordance rendered a nude
   `Image(systemName: "square.and.arrow.up")` as its label, so VoiceOver announced
   only the raw symbol with no meaning ("never rely on icon alone").

## Fixes applied

1. Wrapped the always-visible cluster (badge + timestamp + summary) in its own
   inner `VStack` carrying the `.onTapGesture`, then
   `.accessibilityElement(children: .combine)` + `.accessibilityAddTraits(.isButton)`
   + a **state-aware** `.accessibilityHint` (`crash.reports.row.expand.a11y` /
   `crash.reports.row.collapse.a11y`). VoiceOver now reads **one** button stop
   ("Crash, 2 min ago, <summary>", hint "Double-tap to show details") and the tap
   gesture bridges to the default action. The details `Text` stays a **separate**
   element so `.textSelection(.enabled)` remains usable via the rotor (not flattened
   into the combined label).

2. Added `.accessibilityLabel("Share all crash reports", crash.reports.share.a11y)`
   on the `ShareLink`.

## Keys added (3, inline `defaultValue`, 0 xcstrings)

- `crash.reports.row.expand.a11y` → "Double-tap to show details"
- `crash.reports.row.collapse.a11y` → "Double-tap to hide details"
- `crash.reports.share.a11y` → "Share all crash reports"

## Non-goals / frozen

- No font changed (already semantic — Dynamic Type honoured).
- `kindBadge` already carries a **text** label (`kind.localizedLabel`), so severity
  is not color-only — left intact.
- No logic, no networking, no visual change, no test added.

## Verification

- 1 file touched. Diff is a11y-only.
- Gate = CI `iOS Tests` (VoiceOver structure not asserted by any existing suite;
  no CrashReportSheet test references exist).

## Status: ✅ addressed. ⚠️ Do not re-flag `CrashReportSheet` (VoiceOver soldé 179i;
Dynamic Type already complete before 179i).
