# Iteration-178i — VoiceOver for `CrashReportSheet`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — icon-only share button + tap-to-expand rows
**File touched:** `apps/ios/Meeshy/Features/Main/Components/CrashReportSheet.swift`
(1 file, 0 logic change, 0 visual change, 0 new test)

## Component

`CrashReportSheet` is the sheet presented on foreground from `MeeshyApp.swift:146`
when `CrashDiagnosticsManager` has pending crash diagnostics to surface
(`nsException` / `crash` / `hang` / `cpuException` / `diskWriteException`). It
shows an `insetGrouped` `List` of report cards — each a colored severity badge
(`kindBadge`), a relative timestamp, a one-line summary, and a **tap-to-expand**
monospaced stack-trace detail. The toolbar carries a **Close** button and an
icon-only **ShareLink** exporting all reports as text.

The sheet was already sound on **Dynamic Type** (only semantic fonts:
`.caption2`, `.subheadline`, `.caption2.monospaced()` — no `.system(size:)`)
and on **localization** (title, close, and per-kind badge labels all go through
`String(localized:defaultValue:)`; `kind.localizedLabel` is the shared single
source of truth in `CrashDiagnosticsManager`). The remaining gap was purely
**VoiceOver**.

## Findings

1. **Tap-to-expand card was invisible to VoiceOver.** The card `VStack` carried
   `.contentShape(Rectangle()) + .onTapGesture { … }` to toggle the stack-trace
   details. A raw `.onTapGesture` on a non-`Button` container is **not exposed
   as an accessibility action** — a VoiceOver user could not discover that the
   row was interactive, could not trigger the expansion, and heard the badge,
   timestamp, and summary as **three unrelated stops** with no grouping and no
   `.isButton` trait. This is the same "invisible primary action behind a bare
   `.onTapGesture`" gap resolved on the now-playing cluster in 173i
   (`MiniAudioPlayerBar`).

2. **Icon-only `ShareLink` had no accessibility label.** The toolbar
   `ShareLink(item:) { Image(systemName: "square.and.arrow.up") }` shipped with
   no `.accessibilityLabel`, so VoiceOver announced the raw SF Symbol name
   ("square and arrow up") instead of the action. Same icon-only-control gap
   noted on `CrashReportSheet` in the 177i "remaining improvements" scan and
   previously fixed on other export controls.

## Fix

Scoped entirely to accessibility modifiers — **zero visual and zero logic
change**:

- **Card:** split the always-visible portion (badge row + summary) into an
  inner `VStack` and applied the canonical selectable/actionable-row pattern:
  `.accessibilityElement(children: .combine)` (one clean stop:
  "Crash, il y a 2 min, <summary>"), `.accessibilityAddTraits(.isButton)`, a
  **state-aware** `.accessibilityHint` (`crash.reports.expand.hint` "Afficher
  les détails" when collapsed / `crash.reports.collapse.hint` "Masquer les
  détails" when expanded — the changing hint conveys current state), and
  `.accessibilityAction { toggleExpansion(report.id) }`. The expanded
  stack-trace `Text` stays a **separate** element so its `.textSelection`
  (copy) remains usable and a long trace is not folded into the header label.
- **ShareLink:** added `.accessibilityLabel(crash.reports.share.a11yLabel
  "Partager les rapports")`.
- **Dedup:** extracted the one-way `expandedId` toggle into a private
  `toggleExpansion(_:)` shared verbatim by the touch `.onTapGesture` and the
  VoiceOver `.accessibilityAction`, so both activation paths stay 1:1 (same
  spring animation, same behavior) — mirrors the `openConversation` dedup in
  173i.

**3 new i18n keys**, inline `defaultValue` (French, the app's primary
Prisme language), **0 `.xcstrings` edit** (code-only, per the established
convention on these a11y strings): `crash.reports.expand.hint`,
`crash.reports.collapse.hint`, `crash.reports.share.a11yLabel`.

## Rationale

Crash reports surface at a fragile moment (right after the app recovered from a
crash/hang). A VoiceOver user must be able to (a) discover that a card expands
to reveal the technical detail, (b) know whether it is currently expanded, and
(c) export the reports — none of which the color/tap-only UI conveyed. The fix
adds the missing semantics without touching the layout, the severity palette,
the animation, or the export logic, and keeps the Indigo/semantic visual
identity intact.

## Verification

- **Static review:** `.accessibilityElement(children:.combine)`,
  `.accessibilityAddTraits(.isButton)`, `.accessibilityHint`,
  `.accessibilityAction`, and `.accessibilityLabel` are standard SwiftUI
  iOS 16.0+ APIs — app floor is iOS 16.0, no availability guard needed. The
  `let isExpanded = …` binding at the top of the `Section` ViewBuilder is valid
  (ViewBuilder permits local `let`). The combined-button + shared-action pattern
  has direct precedent in 173i/177i.
- **No visual/logic change:** only accessibility modifiers and a pure-refactor
  extraction of the existing toggle; the visible cards, badge colors, spring
  animation, expand behavior, Close, and ShareLink export are untouched.
- **No test churn:** no test references `CrashReportSheet` (grep across
  `MeeshyTests` / `MeeshyUITests` / `MeeshySDKTests` = 0). `CrashDiagnostic`
  and `kind.localizedLabel` are unchanged.
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build + VoiceOver run happens in CI. Confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `VideoFullscreenPlayer` (`VideoLegacySupport.swift:114-119`) — `xmark.circle.fill`
  dismiss button is icon-only with no `.accessibilityLabel` (the `.system(size: 28)`
  glyph is an intentional media-overlay control size per the 74i/86i doctrine —
  leave fixed). Small, self-contained a11y candidate.
- `PeopleDiscoveryView` / `DiscoveryTab` (`ContactsShared.swift:30-33`) —
  hardcoded, unaccented French enum raw values (`"Decouvrir"`, `"Demandes"`,
  `"Bloques"`) used as both visible `Text` and `.accessibilityLabel`; i18n
  candidate (⚠️ check `ContactsShared.swift` swarm contention before picking).

**Status: RESOLVED for `CrashReportSheet` VoiceOver (tap-to-expand rows +
icon-only ShareLink). Localization + Dynamic Type were already complete.**
