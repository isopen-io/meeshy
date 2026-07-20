# Plan — Iteration-176i — Localize load-error string in `ConversationEncryptionDetailSheet`

**Date:** 2026-07-20 · **Scope:** iOS only · **Area:** Localization (i18n)

## Goal
Remove the last hardcoded, unlocalized user-facing string in
`apps/ios/Meeshy/Features/Main/Components/ConversationEncryptionDetailSheet.swift`
so the encryption-status sheet is fully localization-ready.

## Steps
1. [x] Sync working branch `claude/laughing-thompson-wnfiis` to latest `main` (`115b262`).
2. [x] Scan swarm (open PRs, up to 175i) to pick a fresh, uncontended component → `ConversationEncryptionDetailSheet` (176i > all in-flight).
3. [x] Confirm the gap: `loadStatus()` line 250 assigns raw English `"Unable to read status: …"` to `errorMessage` (rendered in the error `Section`), while the file's other ~25 strings all use `String(localized:defaultValue:bundle:)`.
4. [x] Fix: wrap the assignment in the same idiom with an interpolated `defaultValue`; new key `conversation.encryption.detail.readStatusError`; leave `activate()` line 272 (system error string) untouched.
5. [x] Verify: no tests reference the component; single call site signature unchanged; interpolated-`defaultValue` idiom has 4 in-repo precedents.
6. [x] Document analysis + update `branch-tracking.md` pointer/table.
7. [x] Commit + push to `claude/laughing-thompson-wnfiis`.

## Constraints
- 1 file, 0 logic change, 0 visual change, 0 new test, 0 `.xcstrings` hand-edit.
- Build/VoiceOver validation runs in CI (`iOS Tests`, macOS runner) — Linux container here.

## Verification gate
`iOS Tests` green on the PR before merge.
