# Plan — Iteration-179i — `CrashReportSheet` VoiceOver

- **Source branch**: `main` (HEAD `ef25781`)
- **Working branch**: `claude/laughing-thompson-inlj3k`
- **Iteration**: 179i (strictly > 178i swarm in flight: #2097–#2103)
- **Scope**: iOS only — `apps/ios/Meeshy/Features/Main/Components/CrashReportSheet.swift`

## Steps
1. [x] Sync working branch to latest `main`.
2. [x] Confirm no open PR touches `CrashReportSheet` (`list_pull_requests`).
3. [x] Expandable row → combined `.isButton` element + state-aware hint.
4. [x] Icon-only `ShareLink` → `.accessibilityLabel`.
5. [x] Keep details `Text` a separate element (preserve `textSelection`).
6. [x] Add 3 inline `defaultValue` keys (0 xcstrings).
7. [x] Write analysis + plan docs, update `branch-tracking.md`.
8. [ ] Commit + push.

## Constraints honoured
- 0 Dynamic Type migration (fonts already semantic).
- 0 logic / 0 networking / 0 visual change / 0 test added.
- Gate = CI `iOS Tests`.
