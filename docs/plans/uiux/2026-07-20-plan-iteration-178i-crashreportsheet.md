# Plan — Iteration-178i — `CrashReportSheet` native disclosure Button + VoiceOver

**Date:** 2026-07-20 · **Scope:** iOS only · **Base:** `main` HEAD `fd1136c`
**Working branch:** `claude/laughing-thompson-ieqsfz`

## Objective
Give the crash-diagnostics sheet a native, VoiceOver- and keyboard-perceivable
disclosure control and a labelled share action, without altering visuals or
logic.

## Steps
1. Replace the row `.onTapGesture` (on the card `VStack`) with a native
   `Button` wrapping badge + timestamp + summary; `.buttonStyle(.plain)` +
   full-width `.contentShape(Rectangle())` to keep identical visuals and tap
   area. → `.isButton` trait + keyboard/VoiceOver actionability for free.
2. Move the expandable `details` `Text` outside the `Button` so
   `.textSelection(.enabled)` is preserved and tapping the trace no longer
   collapses the card.
3. Announce state via `.accessibilityValue` (expanded/collapsed) + a stable
   `.accessibilityHint` describing the toggle action.
4. Add `.accessibilityLabel` to the icon-only `ShareLink`.
5. 4 new code-only localization keys (French defaults), 0 `.xcstrings`.

## Non-goals
- No conversion to `DisclosureGroup` (would restyle the card / lose the badge
  header layout) — minimal native `Button` is the smaller correct move.
- No change to `CrashDiagnostic`, `CrashDiagnosticsManager`, or the export
  string format.

## Validation
- Grep confirms 0 tests reference `CrashReportSheet`.
- Compile + VoiceOver runs in CI (`iOS Tests`, macOS) — Linux container here.
- Merge only when `iOS Tests` is green.
