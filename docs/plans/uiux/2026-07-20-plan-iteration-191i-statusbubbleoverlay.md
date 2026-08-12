# Plan — Iteration-191i — `StatusBubbleOverlay` VoiceOver reachability

**Date:** 2026-07-20
**Branch:** `claude/laughing-thompson-q2rrku` (base `main` HEAD `62f338f`)
**Scope:** iOS only — 1 file, 0 logic, 1 inline i18n key, 0 SDK, 0 new test

## Problem

`StatusBubbleOverlay` (mood pop-up) had three VoiceOver gaps, deferred by 184i
because the content nests interactive controls:

1. Reply = bare `.onTapGesture` → no VoiceOver action (WCAG 2.1.1).
2. Audio `ProgressView` → no `.accessibilityValue`.
3. ZStack overlay → no VoiceOver dismiss path.

`.combine` is unsafe here (nested audio + republish `Button`s → swallowed /
ambiguous activation).

## Approach (idiome 183i)

Collapse the bubble into one VoiceOver element; primary action = activation,
secondary controls = rotor actions.

- [x] `.accessibilityElement(children: .ignore)` on `bubbleContent`
- [x] `.accessibilityLabel` — composed content + timeAgo + via
- [x] `.accessibilityValue` — audio % via `Double.formatted(.percent…)` (0 key)
- [x] `.accessibilityAddTraits(.isButton)` gated on `onReplyTapped != nil`
- [x] `.accessibilityAction { replyTapped() }` — default activation = reply
- [x] `.accessibilityActions { … }` — Play/Stop (audio), Republish (other users)
- [x] `.accessibilityAction(.escape) { dismiss() }` on root ZStack
- [x] Remove now-inert inner audio-button `.accessibilityLabel`
- [x] 1 new inline key `status.bubble.audio.a11yLabel` (0 `.xcstrings`)

## Verification

- [x] No test references the view (grep = 0)
- [x] 0 PR contention (`search_pull_requests`)
- [x] APIs iOS 16.0+ (floor OK); `audioPlayer.progress:Double` confirmed
- [ ] CI `iOS Tests` green (macOS runner — Linux container defers build to CI)

## Git

1. [x] Restart branch from `main` HEAD (`62f338f`) — prior branch work already in main
2. [x] Commit on `claude/laughing-thompson-q2rrku`
3. [ ] Push `-u origin`
4. [ ] Open PR, subscribe to PR activity
5. [ ] Update `branch-tracking.md` after merge
