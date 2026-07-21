# Plan — Iteration 208i (KeypadTab search-result row VoiceOver label)

## Goal
Restore the `@username` and online-presence facts to the VoiceOver label of the Keypad
search-result row, which the explicit `.accessibilityLabel(name)` was overriding.

## Steps
1. ✅ Reset working branch `claude/laughing-thompson-sejzgy` from latest `origin/main`
   (207i merged via #2226).
2. ✅ Confirm anti-pattern via grep (`children: .combine` + overriding `.accessibilityLabel`).
3. ✅ Verify 0 collision (`search_pull_requests … KeypadTab` = 0).
4. ✅ Add pure helper `resultRowAccessibilityLabel(for:name:)` mirroring `NewConversationView`
   (185i); reuse `contacts.list.online.lower` (0 new key); offline silent.
5. ✅ Swap `.accessibilityLabel(name)` → helper call.
6. ✅ Analysis + plan + tracking pointer.
7. ⏳ Commit, push, open PR. Gate = CI `iOS Tests`.

## Constraints honoured
- 1 file, 0 logic / 0 network / 0 visual / 0 new i18n key / 0 new test.
- `.combine` scope kept; `dialMenu` sibling + `.accessibilityHint` preserved.

## Base
`main` HEAD `22465a5` (Merge PR #2214).
