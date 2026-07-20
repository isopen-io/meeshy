# Iteration-178i — VoiceOver structure + native ShareLink label for `CrashReportSheet`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) + Localization (i18n) — crash-report diagnostics sheet (error state)
**File touched:** `apps/ios/Meeshy/Features/Main/Components/CrashReportSheet.swift` (1 file, 0 logic change, 0 new test)

## Component

`CrashReportSheet` is the diagnostics sheet presented from `MeeshyApp` when
`CrashDiagnosticsManager` has pending `CrashDiagnostic` records (NSException,
crash, hang, CPU/disk exception). Each row is a `List` section showing a severity
badge (`kindBadge`), a relative timestamp, a one-line summary, and — when the row
is tapped — the full technical `details` blob (monospaced, `.textSelection(.enabled)`
so the trace can be copied). A trailing `ShareLink` exports all reports as text.

It is a pure error-state surface: the only reason a user ever sees it is that the
app misbehaved, so it must be legible under VoiceOver and localization-ready.

## Findings

The row typography was already sound (semantic `.caption2` / `.subheadline`, all
Dynamic-Type-scaling), and the two chrome strings (`crash.reports.title`,
`common.close`) plus the badge label (`CrashDiagnostic.Kind.localizedLabel`) were
already localized. Severity is carried by **text**, not color alone — the badge
prints the localized kind. Three gaps remained:

1. **Icon-only `ShareLink` with no accessibility label (HIG).** The export button
   rendered only `Image(systemName: "square.and.arrow.up")`. VoiceOver announced
   the raw SF Symbol name ("share up"), giving no product meaning. Every icon-only
   control needs an explicit `.accessibilityLabel` (Apple HIG + apps/ios/CLAUDE.md
   accessibility rule).

2. **Expandable row exposed no VoiceOver affordance.** The whole `VStack` toggled
   `expandedId` via `.onTapGesture`, but carried **zero** accessibility structure.
   VoiceOver swept the row as three disconnected fragments (badge, relative time,
   summary) with:
   - no `.isButton` trait → nothing signalled the row was actionable;
   - no `.accessibilityHint` → the tap-to-expand behaviour was invisible;
   - no expanded/collapsed state → a VoiceOver user could not tell whether the
     details were showing;
   - no `.accessibilityAction` → double-tap did nothing (the tap gesture is not
     surfaced as an activation action for a fragmented element).

   Expand/collapse was conveyed **only** by the geometric appearance/disappearance
   of the details text — a channel a VoiceOver user cannot perceive.

3. **Details blob unlabeled.** When expanded, the monospaced trace was a bare,
   unlabeled `Text` — readable but with no identity to orient the listener.

## Fix

Idiomatic label/value/hint/action split, no visual or logic change:

- **Grouped the header** (badge + timestamp + summary) in its own inner `VStack`
  with `.accessibilityElement(children: .combine)` → one focusable element instead
  of three fragments.
- `.accessibilityAddTraits(.isButton)` → the row now reads as actionable.
- `.accessibilityValue(…)` → live "Développé" / "Réduit" state (localized keys
  `crash.report.expanded` / `crash.report.collapsed`).
- `.accessibilityHint(…)` → "Appuyez pour afficher ou masquer les détails
  techniques" (`crash.report.expand-hint`).
- `.accessibilityAction { toggleExpansion(report) }` → VoiceOver double-tap now
  mirrors the visual tap, driving the same state machine.
- Labeled the expanded details with `crash.report.details-label` ("Détails
  techniques"), kept **outside** the combined header so it stays a separate,
  selectable/readable element (preserving `.textSelection(.enabled)` copy of a
  single trace).
- `ShareLink` got `.accessibilityLabel` ("Partager les rapports",
  `crash.reports.share`).

Supporting refactor (no behavior change): extracted `isExpanded(_:)` and
`toggleExpansion(_:)` so the tap gesture and the accessibility action share one
animation path instead of duplicating the inline `withAnimation` closure.

Five new inline `String(localized:defaultValue:bundle:)` keys with French defaults
(`crash.reports.share`, `crash.report.expand-hint`, `crash.report.expanded`,
`crash.report.collapsed`, `crash.report.details-label`) — same inline-default
doctrine as the rest of the file (`crash.reports.title`, `common.close`) and prior
iterations (167i, 95i). No `.xcstrings` catalog edit.

## Rationale

Error/diagnostic surfaces are explicitly in the UX + accessibility review scope.
A crash-report sheet is by definition shown to a user already having a bad
experience; it must not compound that with an opaque VoiceOver read. Folding the
header into one `.isButton` element with a hint + expand/collapse value + default
action is the canonical Apple disclosure-affordance pattern, and makes the
expansion audible without touching the visual design (Indigo/Instant-App identity
preserved). Keeping the details a separate labeled element preserves the existing
`.textSelection` copy affordance for the trace.

## Verification

- **Static review:** all modifiers are standard SwiftUI iOS 14/16+ APIs
  (`accessibilityElement(children:)`, `accessibilityAddTraits`,
  `accessibilityValue`, `accessibilityHint`, `accessibilityAction(_:)`,
  `accessibilityLabel`). App floor is iOS 16.0, no availability guard needed.
  Interpolation-free `String(localized:defaultValue:bundle:)` has established
  precedent throughout this file and the codebase.
- **No test churn:** no test references the `CrashReportSheet` view (grep across
  `MeeshyTests` = 0; the only crash-related tests exercise
  `CrashDiagnosticsManager`, untouched). The single call site (`MeeshyApp`) passes
  `reports:` unchanged.
- **CI gate:** `ios-tests` (macOS runner) — this is a Linux container, so the
  build + VoiceOver run happen in CI. Confirm `ios-tests` is green on the PR
  before merge.

## Remaining improvements (future iterations)

- The tap-to-expand pattern could be migrated to a native `DisclosureGroup` for a
  free system disclosure chevron, but that changes the visual design (adds a
  chevron column) — deferred as a deliberate redesign, out of this iteration's
  "improve, don't redesign" scope.
- `AttachmentQuickLookPreview` (97 L, a11y:0) and `StatusComposerView` (285 L,
  a11y:0) remain open candidates surfaced during this scan.

**Status: RESOLVED for `CrashReportSheet` VoiceOver structure + ShareLink label + i18n.**
