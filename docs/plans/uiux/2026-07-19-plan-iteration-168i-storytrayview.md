# Plan — Iteration-168i — `StoryTrayView` i18n + VoiceOver

**Date:** 2026-07-19
**Scope:** iOS only — 1 file (`apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift`)
**Base:** `main` HEAD (`c216f23`)
**Branch:** `claude/laughing-thompson-8jgzit`
**Gate:** CI `iOS Tests`

## Why this surface

`StoryTrayView` (top-of-feed story tray) is a fresh surface — no prior UI/UX
analysis, no open PR in the current swarm (checked `list_pull_requests`:
2028→2045 all touch other files). Two genuine, low-risk gaps:

1. **i18n — 6 hardcoded French context-menu labels + 1 `"Moi"` fallback.**
   Every other `AvatarContextMenuItem(label:)` call site in the codebase wraps
   its label in `String(localized:defaultValue:)` (FeedCommentsSheet,
   FeedPostCard, PostDetailView, ThemedConversationRow…). Only `StoryTrayView`
   ships raw French literals: `"Voir les stories"`, `"Voir le profil"`,
   `"Voir ma story"`, `"Gérer mes stories"`, `"Ajouter une story"`,
   `"Changer mon mood"`, and the avatar name fallback `"Moi"`. These are
   user-facing (long-press context menu + avatar monogram/VoiceOver name).

2. **a11y — `StoryUploadOverlay` has zero accessibility.** The story-upload
   progress ring conveys 0→100 % **only** by the gradient trim geometry; the
   failed state **only** by a red ring + `exclamationmark.triangle` glyph.
   No `.accessibilityElement`, no label/value, no `.updatesFrequently`,
   violating "never rely only on color" (HIG) and leaving VoiceOver users with
   a bare `"42%"` fragment and no upload context.

## Changes (1 file, 0 logic, 0 test neuf)

### i18n
- Line 290 `"Voir les stories"` → new key `story.tray.menu.viewStories`
- Line 293 `"Voir le profil"` → new key `story.tray.menu.viewProfile`
- Line 419 `"Voir ma story"` → new key `story.tray.menu.viewMyStory`
- Line 423 `"Gérer mes stories"` → new key `story.tray.menu.manageStories`
- Line 428 `"Ajouter une story"` → **reuse** `story.tray.addStory`
- Line 433 `"Changer mon mood"` → **reuse** `story.tray.a11y.changeMood`
- Line 390 `"Moi"` fallback → **reuse** `story.tray.me`

All code-only (`String(localized:defaultValue:bundle:.main)`), Xcode
auto-extraction — **0 manual `.xcstrings` edit** (parité 163i/164i). 4 new keys.

### a11y
- Wrap `StoryUploadOverlay` ZStack in a single element:
  `.accessibilityElement(children: .ignore)` +
  state-aware `.accessibilityLabel` (uploading vs failed) +
  `.accessibilityValue(percent)` while uploading +
  `.accessibilityAddTraits(.updatesFrequently)` while uploading +
  `.accessibilityHint` (retry) + `.accessibilityAddTraits(.isButton)` when failed.
- 3 new `.a11y` code-only keys for the label/value/hint.

## Risk

Minimal. No logic/paging/upload flow touched, no palette change, no visual
change (labels render identically in `fr`; the a11y element is invisible).
Tests `StoryTrayMyStoryTapGuardTests` / `MyStoriesCreateStoryGuardTests`
reference `"Voir ma story"` only in **comments**, not assertions → no break.

## Verification
- CI `iOS Tests` (compile + phased suites).
