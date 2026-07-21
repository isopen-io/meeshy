# Plan — Iteration-197i — VoiceOver structure for `CommentAttachmentsTray`

**Scope:** iOS only · Accessibility (VoiceOver) · 1 file · 0 logic · 0 new i18n key · 0 SDK · 0 new test

## Context / swarm
- iOS `laughing-thompson` swarm is saturated — open PRs from 175i→196i (#2175–#2205).
  Number **197i** chosen strictly > highest in flight (196i).
- Target `CommentMediaView.swift` verified free of contention
  (`search_pull_requests … CommentMediaView` → only ThreadView #2193 which merely
  *lists* it as a future candidate; no open PR touches the file).

## Base
- Branch `claude/laughing-thompson-u1cnuc`, base `origin/main` HEAD `7f85463`.

## Problem
`CommentAttachmentsTray` (staged comment-attachment chips, shared by
`FeedCommentsSheet` / `PostDetailView` / `StoryViewerView+Canvas`) exposed:
1. *N* identical « Retirer la pièce jointe » remove buttons (indistinguishable in
   VoiceOver with >1 staged attachment) — WCAG 1.3.1 / 4.1.2.
2. Decorative type-icon read as noise.
3. Icon / name / remove split into 3 disconnected VoiceOver stops per chip.

## Fix (idiom 183i / 194i)
1. Hide the decorative type-icon (`.accessibilityHidden(true)`).
2. Hide the inner remove `Button` (`.accessibilityHidden(true)`), drop its dead label.
3. `.accessibilityElement(children: .combine)` on the chip → one element labelled
   by the attachment name.
4. `.accessibilityAction(named:)` « Retirer la pièce jointe » (reuses existing
   inline key `composer.a11y.removeAttachment` — 0 new key) scoped to the chip.
5. Extract `remove(_ attachment:)` so sighted tap + rotor action share one code
   path (haptic + `withAnimation` `onRemove` + temp-file cleanup).

## Constraints
- 0 visual / 0 logic / 0 behaviour change (semantic a11y layer + pure refactor).
- 0 new i18n key, 0 SDK change, 0 new test.
- All APIs iOS 14/16+ (app floor 16) — no availability guard.

## Verification
- Gate = CI `iOS Tests` (macOS runner) — build authority (Linux-authored).
- 0 tests reference the components (grep = 0); 3 callers unaffected.

## Deliverables
- `apps/ios/Meeshy/Features/Main/Views/CommentMediaView.swift` (+6 net)
- `docs/analyses/uiux/2026-07-20-iteration-197i-commentattachmentstray.md`
- `docs/plans/uiux/2026-07-20-plan-iteration-197i-commentattachmentstray.md`
- `docs/plans/uiux/branch-tracking.md` (pointer update)
