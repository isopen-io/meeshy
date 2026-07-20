# Plan — Iteration-176i — `LoadMoreRepliesCell`

**Date:** 2026-07-20 · **Scope:** iOS only · **Base:** `main` @ `128680f`
**Working branch:** `claude/laughing-thompson-vj02xz`

## Objective
Bring the comment thread "View N more replies" action cell up to native standard:
localization + correct pluralization, Dynamic Type, VoiceOver button semantics,
and a 44-pt HIG touch target — without changing its visual design or behavior.

## Steps
1. [x] Sync branch from latest `main`.
2. [x] Confirm `LoadMoreRepliesCell` is an interactive tap target and has no test references.
3. [x] Scale the label font with `UIFontMetrics` + `adjustsFontForContentSizeCategory`; `numberOfLines = 0`.
4. [x] Localize + pluralize the label via `String(localized:defaultValue:bundle:)`
       (`comment.replies.load-more-one` / `-other`, English inline defaults).
5. [x] Mark the cell `isAccessibilityElement` + `.button` trait + label; reset in `prepareForReuse`.
6. [x] Raise min content height `36` → `44`.
7. [x] Write analysis doc; update branch-tracking.
8. [ ] Commit, push, confirm `ios-tests` CI green.

## Risk
Minimal — one UIKit file, 0 logic change, 0 new deps, 0 test churn. Visible base
string unchanged for the plural case; the singular case fixes a grammar bug.
