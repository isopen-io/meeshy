# Plan — Iteration-159i — `AttachmentLoadingTile` VoiceOver grouping

**Date:** 2026-07-18 · **Track:** iOS (suffix `i`) · **Base:** `main` HEAD `f489355`
**Working branch:** `claude/laughing-thompson-chfipj`

## Goal
Group `AttachmentLoadingTile` into a single VoiceOver element that announces the
media kind + preparation stage, and expose Cancel as a rotor action — without
touching layout, logic, or the frozen Dynamic-Type glyphs.

## Steps
- [x] Sync branch with latest `main` (`f489355`).
- [x] Confirm component is not claimed by any open iOS PR (#1966–#2008).
- [x] Extract `kindLabel` from `label` (reuse for on-tile caption + a11y label).
- [x] Add `accessibilityStageValue` (full-phrase stage) + `isPreparing` helpers.
- [x] Apply `.accessibilityElement(children: .ignore)` + label/value/traits on the tile.
- [x] Expose Cancel via `.accessibilityActions` (only when `onCancel` present).
- [x] Drop the now-redundant a11y on the visible 18pt cancel button.
- [x] Write analysis doc + this plan.
- [ ] Commit, push, open PR, confirm `ios-tests` green.

## Constraints honoured
- 1 file, 0 logic change, 0 new test, no `.xcstrings` catalog edit (inline defaults).
- iOS 16.0 floor: all APIs iOS 16.0+, no availability guard.
- No conflict with open PRs (component untouched by #1966–#2008).

## Verification
CI `ios-tests` (macOS) is the build/VoiceOver gate — Linux container cannot build iOS.
