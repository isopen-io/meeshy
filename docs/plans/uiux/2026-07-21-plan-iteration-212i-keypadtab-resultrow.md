# Plan — Iteration-212i — KeypadTab result-row VoiceOver label

**Base**: `main` HEAD `8ba64bb40` · **Branch**: `claude/laughing-thompson-sejzgy`

## Goal
Restore `@username` + online-presence status to VoiceOver on the Keypad
search-result row, matching the sighted view (WCAG 1.1.1 / 1.4.1).

## Steps
1. [x] Confirm defect on `main`: `resultRow` uses `children: .combine` then
       `.accessibilityLabel(name)` (line 165–166) → username/online dropped.
2. [x] Confirm no swarm collision: 0 open PR touching `KeypadTab.swift`.
3. [x] Add pure helper `resultRowAccessibilityLabel(for:name:)` reusing the
       existing `contacts.list.online.lower` key; offline silent.
4. [x] Point `.accessibilityLabel` at the helper; keep `.combine` + hint.
5. [x] Document analysis + plan; prepend 212i authoritative tracking pointer.
6. [ ] Push branch; open PR; gate on CI `iOS Tests`.

## Non-goals / constraints
- No new i18n key, no test file (mirror of shipped 185i idiom; Linux host cannot
  run XCTest — CI `iOS Tests` is the gate).
- No visual/layout/logic/network change.

## Next tracks (213i+)
Other rows where an explicit `.accessibilityLabel` overrides a `children: .combine`
and omits a visible fact — audit `grep -n 'children: .combine'` followed by
`.accessibilityLabel(` ≤3 lines. Verify swarm collision via `search_pull_requests`
first.
