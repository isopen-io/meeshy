# Plan — Iteration 207i — `CallsTab` call-journal row VoiceOver label

**Base**: `main` HEAD `8792cb9` · **Branch**: `claude/laughing-thompson-hvvudd`

## Goal
Restore the call-history row's VoiceOver announcement so it restates everything the row shows
visually (call type, age, duration), not just name + direction. The explicit
`.accessibilityLabel` was overriding the `children: .combine` merge.

## Steps
1. ✅ Confirm SwiftUI semantics: explicit `.accessibilityLabel` replaces the combined-children
   text → time/duration/type were dropped.
2. ✅ Reuse existing keys `calls.type.audio` / `calls.type.video` / `calls.detail.duration`
   (already shipped by `CallDetailSheet`) → zero new i18n keys, cross-screen parity.
3. ✅ Add pure helper `rowAccessibilityLabel(name:)` composing
   `[name, direction, type, relativeTime, (duration)]`.
4. ✅ Swap `.accessibilityLabel("\(name), \(accessibilityDirection)")` →
   `.accessibilityLabel(rowAccessibilityLabel(name: name))`.
5. ✅ Add source-level test in `CallsTabAccessibilityTests` (matches file precedent).
6. Push branch, open PR, gate on CI `iOS Tests`.

## Constraints honored
- 1 Swift file + 1 test file. 0 visual, 0 logic, 0 network, 0 new i18n key.
- `.combine` scope preserved (keeps `CallRowDialButton` redial menu reachable — audit 2026-07-06/08).
- No collision: no open PR touches `CallsTab.swift`.
