# Plan — Iteration-179i — `VideoFullscreenPlayer` dismiss control

**Date:** 2026-07-20 · **Scope:** iOS only · **Branch:** `claude/laughing-thompson-s4zrll`

## Objective

Close the two accessibility defects on the sole control of
`VideoFullscreenPlayer` (fullscreen composer-preview player): an icon-only
`xmark.circle.fill` dismiss button with **no VoiceOver label** and a **frozen**
`.system(size: 28)` glyph in a padding-only (non-framed) layout.

## Why this surface

- Flagged as a deferred candidate by 177i's tracking note.
- Not touched by any open PR (verified via `list_pull_requests`; the three
  in-flight 178i PRs — #2098/#2099/#2100 — cover ShareLinksView, DiscoverTab,
  EmailVerificationView; none touch `VideoLegacySupport`).
- Direct sibling precedent already in the codebase: `ReportUserView.swift:49-53`
  labels an identical padded `xmark.circle.fill` dismiss and scales it via
  `MeeshyFont.relative(24)`.

## Steps

1. [x] Sync `claude/laughing-thompson-s4zrll` to latest `origin/main`.
2. [x] `.font(.system(size: 28))` → `.font(MeeshyFont.relative(28))` on the
   dismiss glyph (Dynamic Type; no fixed frame → no clipping).
3. [x] Add `.accessibilityLabel(String(localized: "common.close", defaultValue:
   "Fermer", bundle: .main))` on the dismiss `Button` (reuse existing key).
4. [x] Write analysis (`docs/analyses/uiux/…-179i-videofullscreenplayer.md`).
5. [x] Write this plan.
6. [ ] Commit + push to designated branch.
7. [ ] CI gate: `iOS Tests` green.

## Constraints honored

- 1 file, 0 logic, 0 network, **0 new i18n key**, 0 new test.
- No visual change at default text size (28pt resolves identically).
- `MeeshyUI` already imported → no new import.
- Iteration number **179i** chosen strictly > highest in-flight (178i).

## Review

`VideoFullscreenPlayer` dismiss control brought to parity with `ReportUserView`:
VoiceOver-labeled and Dynamic-Type-scaling. No other control exists on the
screen; the AVPlayer/orientation/backdrop paths are untouched.
