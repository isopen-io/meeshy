# Plan — Iteration-169i — `MessageEditsDetailView` i18n + VoiceOver

**Base:** `main` @ `97e34d6` · **Branch:** `claude/laughing-thompson-c1tn4n`
**Scope:** iOS only · 1 file · 0 logic · 0 new test

## Goal
Bring the message edit-history detail tab to parity with its already-fixed
siblings in `MessageDetail/`: localize its remaining hardcoded French strings
and give VoiceOver a coherent, non-color-dependent reading.

## Steps
1. [x] Reset working branch to latest `origin/main`.
2. [x] Locate a component with both i18n and a11y gaps (subagent sweep) →
   `MessageEditsDetailView.swift` (156 lines, no tests).
3. [x] Localize the 5 literal sites via `String(localized:defaultValue:bundle:)`
   under the `message-detail.edits.*` namespace.
4. [x] Add VoiceOver structure:
   - rows → `.accessibilityElement(children: .ignore)` + label (identity) +
     value (timestamp + content); hide the color-only bar.
   - banner → `.accessibilityElement(children: .combine)` + `.isHeader`; hide
     the redundant count badge.
5. [x] Verify: no test/SDK references; catalog convention is inline-only.
6. [x] Write analysis + plan docs; update branch-tracking.
7. [ ] Commit, push, open PR.

## Non-goals
- No behavior/logic change; French output is byte-identical (defaultValues).
- No extraction of the duplicated `timelineBanner`/`emptyStateView` helpers
  (only two consumers; deferred per SDK-purity grain test).
- No `.xcstrings` hand-edit (Xcode auto-extracts at build time).
