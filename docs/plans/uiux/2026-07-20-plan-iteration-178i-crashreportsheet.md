# Plan — Iteration-178i — `CrashReportSheet` disclosure affordance + VoiceOver

**Date:** 2026-07-20
**Scope:** iOS only
**Working branch:** `claude/laughing-thompson-nan0ai`
**File:** `apps/ios/Meeshy/Features/Main/Components/CrashReportSheet.swift` (1 file)

## Target
`CrashReportSheet` — the debug/diagnostics sheet listing captured
`CrashDiagnostic` reports. Each report row is a tap-to-expand disclosure
(tap reveals a monospaced `details` block). Surfaced as a future candidate by
177i (`ReportMessageSheet`).

## Findings to address
1. **No visual disclosure affordance** — the row is tappable
   (`.onTapGesture`) but shows *no* chevron/indicator, so neither sighted nor
   VoiceOver users can tell it expands (discoverability / HIG gap).
2. **No VoiceOver grouping/semantics** — the header (`kindBadge` + relative
   timestamp + `summary`) is read as 2–3 disjoint elements with no `.isButton`
   trait, no hint, and no expanded/collapsed state value.
3. **Icon-only `ShareLink`** — `Image(systemName: "square.and.arrow.up")`
   toolbar item has no `.accessibilityLabel` (unlabeled button for VoiceOver).

## Fix (minimal, no logic change)
- Add a `chevron.down` / `chevron.right` disclosure indicator to the header
  `HStack` (native disclosure affordance, `.accessibilityHidden(true)` since
  state is exposed semantically).
- Make the tappable header its own combined accessibility element:
  `.accessibilityElement(children: .combine)` + `.accessibilityAddTraits(.isButton)`
  + `.accessibilityValue(expanded ? "…affichés" : "…masqués")` +
  `.accessibilityHint(…)`. Keep the monospaced `details` block **outside** the
  combined element so `textSelection(.enabled)` stays intact.
- Add `.accessibilityLabel` to the `ShareLink`.

All new strings via inline `String(localized:defaultValue:bundle:.main)`
(same pattern as the rest of the file — no catalog churn required).

## Verification
- Static review only (Linux container; build/VoiceOver run in CI `iOS Tests`).
- No test references `CrashReportSheet` (grep = 0). No logic / no palette /
  no layout change beyond the added chevron glyph.
