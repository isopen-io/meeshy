# Iteration-178i — Native disclosure Button + VoiceOver for `CrashReportSheet`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) + native-component adoption — crash-report disclosure rows & share action
**File touched:** `apps/ios/Meeshy/Features/Main/Components/CrashReportSheet.swift` (1 file, 0 logic, 4 new keys code-only, 0 `.xcstrings`, 0 new test)

## Component

`CrashReportSheet` is the diagnostics sheet presented from `MeeshyApp.swift:146`
(`crashReportsToShow`) when the app has pending `CrashDiagnostic` records
(NSException, crash, hang, CPU/disk exceptions captured by
`CrashDiagnosticsManager`). It renders each report as an inset-grouped
`Section` with a colored kind badge, a relative timestamp, a one-line summary,
and — when the row is tapped — an expandable monospaced `details` block with
`.textSelection(.enabled)`. The toolbar carries a **Fermer** button and an
icon-only **ShareLink** exporting all reports as text.

The sheet was already **localized** (title, close) and used **only semantic
fonts** (`.caption2` / `.subheadline` / `.caption2.monospaced`) — Dynamic Type
and the bulk of i18n were already sound. The gaps were interaction semantics
and VoiceOver, on two controls.

## Findings

**1. Disclosure row was a `.onTapGesture` on a `VStack` — invisible to
VoiceOver and the keyboard.** The expand/collapse affordance was a raw
`.contentShape(Rectangle()).onTapGesture { … }` on the whole card `VStack`.
Three defects:

- **Not a control.** VoiceOver read the badge + timestamp + summary as loose,
  non-actionable text with **no `.isButton` trait** — a VoiceOver or
  full-keyboard-access user could not discover that the row toggles details,
  nor activate it. This reinvents a tap behavior that a native `Button`
  provides for free (routine principle: *avoid reinventing SwiftUI behaviors*).
- **No state signal.** Expanded vs. collapsed was conveyed **only** by the
  visual presence/absence of the details text — a WCAG 4.1.2 (Name/Role/Value)
  gap for the toggle's state.
- **Tap target swallowed the details.** The gesture sat on the *entire* VStack
  including the expanded `details` block, so tapping the monospaced text (which
  advertises `.textSelection(.enabled)`) collapsed the card instead of letting
  the user place a selection cursor — the two affordances fought each other.

**2. Icon-only `ShareLink` with no `.accessibilityLabel`.** The
`square.and.arrow.up` glyph in the leading toolbar slot exposed no explicit
label; VoiceOver fell back to a generic/undefined announcement for a
destructive-adjacent export action. Same class of gap resolved for icon-only
controls in prior iterations.

## Fix

Applied the canonical Apple pattern — *use the native control that already
encodes the behavior*, scoped to this one file:

- **Replaced the `.onTapGesture` disclosure with a real `Button`.** The badge +
  timestamp + summary now live inside a `Button { toggle } label: { … }` with
  `.buttonStyle(.plain)` (identical visuals, no button chrome) and
  `.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())`
  to preserve the full-width tap target. A SwiftUI `Button` **auto-merges its
  label subtree into one accessibility element and adds `.isButton`** — so
  VoiceOver now reads a single actionable stop and full-keyboard-access can
  focus/activate it, for free.
- **Moved the `details` block *outside* the `Button`.** Text selection on the
  monospaced crash trace is preserved and no longer collapses the card on tap —
  the two affordances are now cleanly separated.
- **Announced expand/collapse state** via `.accessibilityValue` — « Détails
  affichés » when expanded, « Détails masqués » when collapsed — plus a stable
  `.accessibilityHint` (« Double-tapez pour afficher ou masquer les détails du
  rapport »). Value carries the *state*, hint carries the *action*, per Apple's
  Name/Role/Value guidance.
- **Labelled the `ShareLink`** with `.accessibilityLabel` (« Partager les
  rapports »).

Four new keys, all `String(localized:defaultValue:bundle:)` code-only (0
`.xcstrings` churn), matching the file's established idiom and the app's
French-default convention (`common.close` → « Fermer »):

- `crash.reports.details.expanded` → « Détails affichés »
- `crash.reports.details.collapsed` → « Détails masqués »
- `crash.reports.details.hint` → « Double-tapez pour afficher ou masquer les détails du rapport »
- `crash.reports.share` → « Partager les rapports »

## Rationale

A crash-report review is a rare but high-signal support flow; a VoiceOver or
keyboard user must be able to (a) discover that rows expand, (b) know whether a
row is currently expanded, and (c) reach the share action by name. The visuals,
Dynamic Type, and existing localization were already correct — the deficit was
purely interaction semantics. Swapping the ad-hoc gesture for a native `Button`
resolves role, state actionability, and the details/selection conflict in one
move, without touching layout, color, the animation, or the export logic.

## Verification

- **Static review:** `Button`, `.buttonStyle(.plain)`, `.contentShape`,
  `.accessibilityValue/Hint/Label`, and `String(localized:defaultValue:bundle:)`
  are standard SwiftUI iOS 16.0+ APIs (app floor iOS 16.0 — no availability
  guard). `.buttonStyle(.plain)` inside a `List` `Section` renders the label
  with no default button tint/chrome — visuals unchanged.
- **No visual/logic change:** the fix adds a native control wrapper + a11y
  modifiers; the badge, timestamp, summary, spring animation, expanded details,
  text selection, and `formatAllReports()` export are untouched.
- **No test churn:** no test references `CrashReportSheet` (grep across
  `MeeshyTests` / `MeeshyUITests` / `MeeshySDK*` = 0). `CrashDiagnostic` /
  `Kind.localizedLabel` mappings are unchanged.
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  compile/VoiceOver run happens in CI. Confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `VideoFullscreenPlayer` (`VideoLegacySupport.swift`) — icon-only `xmark`
  dismiss button with no `.accessibilityLabel` + a fixed `.system(size: 28)`
  glyph (not Dynamic-Type aware). Still open (noted 177i).
- `StatusComposerView` — character counter `\(count)/122` not formatted
  locale-aware (bare interpolation, no `.formatted()`).
- `PeopleDiscoveryView` / `DiscoveryTab` (`ContactsShared.swift`) — hardcoded
  unaccented French enum raw values used as both `Text` and
  `.accessibilityLabel` (localization candidate; noted 177i).

**Status: RESOLVED for `CrashReportSheet` disclosure role/state + share label.**
