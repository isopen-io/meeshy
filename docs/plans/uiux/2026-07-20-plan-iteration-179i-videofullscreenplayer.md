# Plan — Iteration-179i — VoiceOver label for `VideoFullscreenPlayer` dismiss

**Date:** 2026-07-20
**Scope:** iOS only
**Working branch:** `claude/laughing-thompson-2h2ylu` (base `main` HEAD `3c4d772`)
**File:** `apps/ios/Meeshy/Features/Main/Views/VideoLegacySupport.swift`

## Objective
Fix the missing VoiceOver label on the **sole dismiss control** of the fullscreen
video player used for composer / conversation video previews. Without a label the
control reads as an unnamed button, effectively trapping VoiceOver users in the
fullscreen modal.

## Steps
1. [x] Confirm the canonical close-button idiom (`VoiceProfileWizardView`,
   `BubbleStandardLayout+Media`): frozen `.font(.system(size: 28))` chrome glyph +
   `.accessibilityLabel(String(localized: "common.close", …))`.
2. [x] Add `.accessibilityLabel(common.close)` + `.accessibilityHint(video.fullscreen.close-hint)`
   to the dismiss `Button`.
3. [x] Annotate the intentionally-frozen chrome-glyph font with the 82i doctrine
   comment so future Dynamic-Type passes skip it.
4. [x] Verify: no test references the view; both call sites unchanged; 0 logic, 0 API.
5. [ ] Commit, push, open PR. Gate = CI `ios-tests`.

## Constraints respected
- 1 file, 0 logic, 0 API change, 0 test churn.
- 1 reused i18n key (`common.close`) + 1 new inline-`defaultValue` key
  (`video.fullscreen.close-hint`) — no `.xcstrings` catalog edit.
- Font stays frozen (chrome control in a fixed tap frame) per doctrine 82i.
