# Iteration-178i — Native `DisclosureGroup` + ShareLink label for `CrashReportSheet`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** HIG (native disclosure component) + Accessibility (VoiceOver) + Discoverability
**Files touched:** `apps/ios/Meeshy/Features/Main/Components/CrashReportSheet.swift`,
`apps/ios/Meeshy/Localizable.xcstrings` (1 new key, 5 locales, 0 new test)

## Component

`CrashReportSheet` is the sheet listing captured `CrashDiagnostic` reports
(surfaced from `CrashDiagnosticsManager` on next foreground). Each report is a
`Section` row showing a colored kind badge, a relative timestamp, a one-line
summary and — when the row is tapped — an expanded monospaced `details`
dump with `.textSelection(.enabled)`. A toolbar `ShareLink` exports all
reports as text; a Close button dismisses.

The sheet was already fully localized (`crash.reports.title`, `common.close`,
`kind.localizedLabel` per type) and used only semantic fonts
(`.caption2`/`.subheadline`) — Dynamic Type and i18n were sound. The gaps were
HIG (custom expand gesture reinventing a native component), discoverability,
and VoiceOver.

## Findings

**1. Custom tap-to-expand with no affordance and no VoiceOver semantics.**
Each row was a `VStack` carrying
`.contentShape(Rectangle()).onTapGesture { toggle expandedId }`:

- **No visual affordance** — nothing signalled the row was expandable (no
  chevron, no disclosure indicator). A user had no way to discover that
  tapping reveals the crash details. Discoverability failure.
- **VoiceOver saw plain text** — the `VStack` was not a button, so it was not
  announced as interactive, carried no expanded/collapsed state, and exposed
  no way to trigger the toggle. It was also unreachable by Full Keyboard
  Access and Switch Control (both rely on the accessibility button tree).
- **Reinvents a native component.** Apple ships `DisclosureGroup` for exactly
  this "tap a header to reveal detail" pattern, with the chevron, animation,
  and "expanded/collapsed" VoiceOver announcement built in. The custom gesture
  duplicated it worse. Violates the routine's "prefer native, minimize custom"
  and HIG.

**2. Icon-only `ShareLink` with no accessibility label.** The toolbar
`ShareLink(item:)` wrapped only a `square.and.arrow.up` `Image` with no
`.accessibilityLabel`, leaving VoiceOver without a meaningful name for the
export control. Same icon-only-control gap flagged for this file in 177i's
remaining list.

## Fix

**1. Replaced the `VStack` + `.onTapGesture` with a native `DisclosureGroup`**
(available iOS 14+, well under the iOS 16 app floor):

- `label:` retains the existing badge + timestamp + summary header verbatim.
- The content closure holds the `details` monospaced `Text`, keeping
  `.textSelection(.enabled)` (now cleanly separated from the tappable header,
  so selecting text no longer collapses the row as the old whole-`VStack`
  gesture did).
- A computed `expansionBinding(for:)` `Binding<Bool>` preserves the existing
  **single-open accordion**: its getter compares `expandedId == id`, its
  setter clears siblings (`expandedId = isExpanded ? id : nil`) inside the same
  `withAnimation(.spring(response: 0.3, dampingFraction: 0.8))` used before.

`DisclosureGroup` now provides, for free: the chevron affordance (fixes
discoverability), the "expanded"/"collapsed" VoiceOver button announcement and
state, keyboard/Switch Control reachability, and the standard disclosure
interaction users already recognize — replacing all the custom code.

**2. Added `.accessibilityLabel` to the `ShareLink`** via a new localized key
`crash.reports.share` (FR source "Partager les rapports", + en/es/de/pt-BR,
matching the sheet's 5-locale coverage). Registered in `Localizable.xcstrings`
adjacent to its sibling `crash.reports.title`.

## Rationale

Crash reports are a low-frequency, diagnostic surface, but the expand
interaction was invisible: sighted users could not tell rows were tappable,
and VoiceOver/keyboard users could not reach the details at all. Adopting the
native `DisclosureGroup` removes custom code while simultaneously fixing
discoverability, VoiceOver, and alternative-input support — the ideal
native-first trade the routine asks for. No colors, badge, export format, or
the Indigo identity changed.

## Verification

- **Static review:** `DisclosureGroup(isExpanded:content:label:)` is standard
  SwiftUI (iOS 14+) — no availability guard needed. The computed binding
  preserves the pre-existing single-open behavior exactly; the spring
  animation is unchanged.
- **No visual regression to the header:** badge, timestamp, and summary render
  identically inside the label; the only added chrome is the standard
  trailing disclosure chevron (the intended affordance).
- **No test churn:** no test references `CrashReportSheet`
  (grep across `MeeshyTests` / `MeeshyUITests` / `MeeshySDKTests` = 0).
- **i18n:** `Localizable.xcstrings` remains valid JSON; the added key mirrors
  the sibling entry's structure and locale set (fr/en/es/de/pt-BR).
- **CI gate:** `iOS Tests` (macOS runner) is the build/VoiceOver gate — this is
  a Linux container, so confirm `iOS Tests` is green on the PR before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `VideoFullscreenPlayer` (`VideoLegacySupport.swift`) — icon-only `xmark`
  dismiss button with no `.accessibilityLabel` + a fixed `.system(size: 28)`
  glyph (not Dynamic Type).
- `PeopleDiscoveryView` / `DiscoveryTab` (`ContactsShared.swift`) — hardcoded,
  unaccented French enum raw values used as both `Text` and
  `.accessibilityLabel`; localization candidate.

**Status: RESOLVED for `CrashReportSheet` native disclosure + ShareLink
accessibility label.**
