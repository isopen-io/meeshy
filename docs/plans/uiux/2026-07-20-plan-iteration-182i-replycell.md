# Plan — Iteration-182i (iOS)

**Date:** 2026-07-20
**Branch:** `claude/laughing-thompson-i5vrp1` (from `main` HEAD `5f44f0c`)
**Scope:** iOS only — Accessibility (Dynamic Type + VoiceOver)
**Target:** `apps/ios/Meeshy/Features/Main/Views/Cells/ReplyCell.swift`

## Problem

`ReplyCell` (the indented reply row rendered in a deployed comment thread —
`CommentListViewController` reply-cell registration) carried the exact deficit
flagged as the follow-up to 176i (`LoadMoreRepliesCell`):

1. **No Dynamic Type** — three labels pinned to `.systemFont(ofSize: 13/14/11)`.
   Text stayed fixed while the rest of the app scaled with the user's preferred
   content size (WCAG 1.4.4 / accessibility-larger-text).
2. **No VoiceOver structure** — the cell was not an accessibility element, so
   VoiceOver swept the author name, body and relative time as three disconnected
   fragments with no identity ("who / what / when").
3. **Single-line name truncation** — `nameLabel`/`timestampLabel` kept the
   default `numberOfLines = 1`; at large Dynamic Type sizes a long display name
   would clip.

## Fix

- Wrap each font in `UIFontMetrics(forTextStyle:).scaledFont(for:)` preserving
  the exact default point sizes (13 semibold / 14 / 11) → **0 visual change at
  default size**, full scaling at every larger size; `adjustsFontForContentSizeCategory = true`
  on all three labels.
- `numberOfLines = 0` on name + timestamp (content already 0) for no clipping.
- `isAccessibilityElement = true` + composed `accessibilityLabel`
  ("{name}, reply. {content}. {time}") via a testable static helper, using
  `String(localized:defaultValue:bundle:)` so VoiceOver reads one coherent
  element. Cleared in `prepareForReuse` (also now clears `timestampLabel` — was
  leaking a stale timestamp across reuse).

## Steps

1. [x] Sync working branch from latest `main` (HEAD `5f44f0c`).
2. [x] Confirm target free of collision (`list_pull_requests` — no open PR
   touches `ReplyCell`; highest number in flight is 181i → this is **182i**).
3. [x] Apply Dynamic Type (UIFontMetrics) to the 3 labels.
4. [x] Make the cell one VoiceOver element with a composed label.
5. [x] Clear timestamp + a11y label on reuse.
6. [x] Write analysis doc + update `branch-tracking.md`.
7. [ ] Commit + push; open PR; confirm `iOS Tests` green.

## Constraints honored

- 1 file, 0 logic change (`configure(with:depth:)` contract unchanged).
- 0 new test (no test references the cell — grep = 0).
- 1 new i18n key `comments.reply.a11yLabel` inline `defaultValue` (no `.xcstrings` edit).
- 0 visual change at default Dynamic Type; Indigo/localization untouched.

## Gate

CI `iOS Tests` (macOS runner) — build + VoiceOver run happens in CI (Linux
container here).
