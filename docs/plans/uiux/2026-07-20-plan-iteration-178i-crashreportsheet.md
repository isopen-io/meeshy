# Plan — Iteration-178i (iOS)

**Date:** 2026-07-20
**Branch:** `claude/laughing-thompson-ado1ko` (from `main` HEAD `d6a3a3a`)
**Scope:** iOS only — Accessibility (VoiceOver)
**Target:** `apps/ios/Meeshy/Features/Main/Components/CrashReportSheet.swift`

## Problem

`CrashReportSheet` (shown on foreground when crash diagnostics are pending)
had two VoiceOver gaps: (1) the tap-to-expand report cards used a bare
`.onTapGesture` on a non-`Button` `VStack` → the expand action was invisible
to VoiceOver and the badge/date/summary scattered into three unrelated stops;
(2) the toolbar `ShareLink` was icon-only (`square.and.arrow.up`) with no
`.accessibilityLabel`. Dynamic Type + localization were already complete
(only semantic fonts; all strings localized).

## Steps

1. [x] Reset assigned branch to latest `main` (HEAD `d6a3a3a`; prior work
   fully merged, tree identical).
2. [x] Confirm target free of collision (177i scan already surfaced
   `CrashReportSheet` as a fresh 178i candidate; no test references it; 177i
   is the highest number merged → this is **178i**).
3. [x] Split card header (badge + summary) into a combined `.isButton` element
   with state-aware `.accessibilityHint` (expand/collapse) + `.accessibilityAction`.
4. [x] Keep expanded stack-trace `Text` as a separate element (preserve
   `.textSelection`).
5. [x] Add `.accessibilityLabel` to the icon-only `ShareLink`.
6. [x] Extract shared `toggleExpansion(_:)` (dedup tap gesture + VoiceOver action).
7. [x] Write analysis doc `2026-07-20-iteration-178i-crashreportsheet.md`.
8. [x] Update `branch-tracking.md`.
9. [ ] Commit + push; confirm `iOS Tests` green.

## Constraints honored

- 1 file, 0 logic change, 0 visual change, 0 new test.
- 3 new i18n keys, inline `defaultValue` (French), 0 `.xcstrings` edit.
- No `.accessibilityElement(children:.combine)` over the details text (keeps
  copy/selection usable, avoids folding a long trace into the header label).
- Indigo/semantic identity, Dynamic Type (already semantic), localization
  (already complete) untouched.

## Gate

CI `iOS Tests` (macOS runner) — build + VoiceOver run happens in CI (Linux
container here).
