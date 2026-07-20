# Iteration-178i — Disclosure affordance + VoiceOver for `CrashReportSheet`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Discoverability (HIG disclosure) + Accessibility (VoiceOver)
**File touched:** `apps/ios/Meeshy/Features/Main/Components/CrashReportSheet.swift` (1 file, 0 logic, 0 new test)

## Component

`CrashReportSheet` is the diagnostics sheet presented from `MeeshyApp`
(`MeeshyApp.swift:146`) listing captured `CrashDiagnostic` reports. Each
report is a `Section` whose header (severity `kindBadge` + relative timestamp
+ `summary`) is tap-to-expand: tapping toggles a monospaced, text-selectable
`details` block. Surfaced as a future candidate by 177i (`ReportMessageSheet`).

The sheet was already **100 % localized** (inline
`String(localized:defaultValue:bundle:.main)` throughout) and uses **only
semantic fonts** (`.caption2`/`.subheadline`). Dynamic Type and i18n were
therefore already sound — the gaps were discoverability and VoiceOver.

## Findings

1. **No visual disclosure affordance.** The row was tappable
   (`.onTapGesture` on the whole `VStack`) but rendered **no chevron or any
   other indicator** that it expands. A sighted user had no cue the
   monospaced stack trace was one tap away — a discoverability / HIG
   disclosure-row gap.

2. **No VoiceOver semantics for the disclosure.** The tappable region was a
   plain `VStack` with an `.onTapGesture` — SwiftUI exposes such a region as
   its separate `Text` children (badge label, relative time, summary) with
   **no `.isButton` trait, no hint, and no expanded/collapsed state**. A
   VoiceOver user heard 2–3 disjoint fragments and had no signal the element
   was actionable or what state it was in — the same "interactive region
   modelled only as an `.onTapGesture`" gap resolved on prior rows
   (176i `LoadMoreRepliesCell`, 177i `ReportMessageSheet`).

3. **Icon-only `ShareLink`.** The toolbar `ShareLink` wrapped a bare
   `Image(systemName: "square.and.arrow.up")` with no `.accessibilityLabel`,
   so VoiceOver announced only "share, button" / an unlabeled control.

## Fix

Scoped entirely to the row builder and the toolbar item — no logic, palette,
or layout change beyond the added chevron glyph:

- **Disclosure chevron** — added `chevron.down` (expanded) / `chevron.right`
  (collapsed) trailing the header `HStack`, tinted `.tertiary`,
  `.accessibilityHidden(true)` (state is conveyed semantically, so the glyph
  is decorative to VoiceOver). This is the native HIG disclosure affordance.

- **Combined actionable header** — split the header (badge + timestamp +
  summary) into its own inner `VStack` carrying the `.onTapGesture` plus
  `.accessibilityElement(children: .combine)`, `.accessibilityAddTraits(.isButton)`,
  `.accessibilityValue(isExpanded ? "Détails affichés" : "Détails masqués")`,
  and `.accessibilityHint("Affiche ou masque les détails techniques")`.
  VoiceOver now reads one clean actionable element that announces its
  expanded/collapsed state (localized, **inline defaultValue** — no catalog
  churn). The monospaced `details` block stays **outside** this combined
  element so `.textSelection(.enabled)` remains fully functional (combining it
  would swallow the stack trace into the row label and break copy/selection).

- **Labeled `ShareLink`** — added
  `.accessibilityLabel("Partager les rapports")`.

## Rationale

Crash reports are consulted precisely when something is wrong; the ability to
expand a report and copy its stack trace must be discoverable both visually
(chevron) and non-visually (VoiceOver button + state). Extracting the tappable
header into its own combined element — rather than combining the entire card —
is the key correctness detail: it preserves text selection on the trace, which
is the whole point of expanding.

## Verification

- **Static review:** `.accessibilityElement(children:)`,
  `.accessibilityAddTraits(.isButton)`, `.accessibilityValue`,
  `.accessibilityHint`, and `.accessibilityLabel` are standard SwiftUI iOS
  16.0+ APIs (app floor is 16.0 — no availability guard). The `let isExpanded`
  local in the `@ViewBuilder` block is valid (result builders permit local
  bindings). Chevron symbols are core SF Symbols.
- **No logic/behaviour change:** the toggle, spring animation, badge, and
  share payload are untouched; only the tap-gesture host narrowed from the
  full card to the header (the `details` block was text-selectable, not a
  reliable collapse target, so no affordance is lost).
- **No test churn:** no test references `CrashReportSheet`
  (grep across `MeeshyTests`/`MeeshyUITests`/`MeeshySDKTests` = 0); the only
  non-definition references are `CrashDiagnosticsManager.swift` (a comment) and
  `MeeshyApp.swift` (the call site) — neither touched.
- **CI gate:** `iOS Tests` (macOS runner). This is a Linux container, so the
  build/VoiceOver run happens in CI — confirm `iOS Tests` is green before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `VideoFullscreenPlayer` (`VideoLegacySupport.swift:114-119`) — icon-only
  `xmark.circle.fill` dismiss `Button` with no `.accessibilityLabel` and a
  fixed `.font(.system(size: 28))` glyph (Dynamic Type freeze candidate per
  doctrine 82i).
- `PeopleDiscoveryView` / `DiscoveryTab` (`ContactsShared.swift`) — hardcoded,
  unaccented French enum raw values used as both visible `Text` and
  `.accessibilityLabel`; localization candidate (carried from 177i).

**Status: RESOLVED for `CrashReportSheet` disclosure affordance + VoiceOver.**
