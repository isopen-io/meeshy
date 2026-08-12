# Plan — Iteration-196i — `EditPostSheet` language-selector VoiceOver cleanup

**Date:** 2026-07-20
**Scope:** iOS only · Accessibility (VoiceOver)
**Target:** `apps/ios/Meeshy/Features/Main/Components/EditPostSheet.swift`

## Goal

Remove decorative-glyph VoiceOver noise from the language-selector disclosure row
in the post-edit sheet, so the compound `Button` announces only its purpose and
current value.

## Steps

1. [x] Sync working branch to latest `origin/main`.
2. [x] Confirm surface is not in an open PR (no `EditPostSheet` PR; `ThreadView`
       is taken by #2193 → avoided). Confirm iteration number 196i is free.
3. [x] Read `EditPostSheet`; rule out the l.318 `.system(size: 22)` "gap"
       (rigid 64×64 frame + already `accessibilityHidden`).
4. [x] Hide decorative `globe` (l.212) with `.accessibilityHidden(true)`.
5. [x] Hide decorative `chevron.right` (l.227) with `.accessibilityHidden(true)`.
6. [x] Verify 0 new i18n key (existing keys resolve via `defaultValue`).
7. [x] Write analysis + plan docs.
8. [ ] Commit and push to `claude/laughing-thompson-411t2j`.

## Risk / rollback

- Zero visual and zero behavioural change; `.accessibilityHidden` is iOS 13+.
- Trivially revertable (2-line diff). No test impact (no iOS test references the view).

## Constraints

- 1 file · +2 lines · 0 logic · 0 new key · 0 SDK change · 0 new test.
