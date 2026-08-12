# Iteration-160i — MessageForwardDetailView VoiceOver a11y pass

**Date:** 2026-07-18
**Scope:** iOS only
**Component:** `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageForwardDetailView.swift`
**Type:** Accessibility (VoiceOver) — parity with the SSOT sibling `ForwardPickerSheet`

## Context

`MessageForwardDetailView` is the "Forward" tab embedded inside the message
detail sheet (`MessageDetailSheet`). It lets the user search their conversations
and forward the current message. It is a direct sibling of the `MessageDetail*`
a11y series already in flight (144i `MessageViewsDetailView`, 155i
`MessageReactionsDetailView`, 153i `MessageDetailSentimentTab`).

The standalone `ForwardPickerSheet` (the full-screen forward picker) already
carries a complete VoiceOver treatment with a stable set of i18n keys. The
embedded tab `MessageForwardDetailView` — extracted from the legacy
`MessageDetailSheet.forwardTabContent` — was left **without** that treatment,
producing an inconsistent experience between two views that do the exact same
job.

## Findings (before)

The file already uses semantic fonts (`.subheadline`, `.callout`, `.caption`,
`.footnote`, `.title2`) → **Dynamic Type is already correct**; the lone
`.system(size: 28)` is a decorative empty-state glyph, intentionally fixed. The
gaps were purely VoiceOver:

| # | Element | Issue | Severity |
|---|---------|-------|----------|
| 1 | Search `magnifyingglass` icon | Decorative, but exposed to VoiceOver as an unlabeled image | Low |
| 2 | Clear-search button (`xmark.circle.fill`) | Interactive control with **no** `accessibilityLabel` → announced as "button" only | Medium |
| 3 | Conversation row text (name / type / member count) | Three separate `Text` fragments read as three swipes instead of one summary | Medium |
| 4 | Send button (`paperplane.circle.fill`) | Primary action with **no** label → "button" only, target conversation not announced | High |
| 5 | Sent state (`checkmark.circle.fill`) | Status icon with no label → silent to VoiceOver | Medium |
| 6 | Sending state (`ProgressView`) | No label → silent to VoiceOver | Low |
| 7 | Empty state | Decorative icon exposed; container not combined | Low |

## Fix

Mirror `ForwardPickerSheet`'s a11y treatment **reusing its exact i18n keys**
(zero new keys — pure SSOT reuse):

- `common.clear-search` → clear-search button label (#2)
- `forward.send-a11y` ("Transférer à %@", interpolated with `conv.name`) → send button (#4)
- `forward.sent` ("Transféré") → sent checkmark (#5)
- `forward.sending` ("Envoi en cours") → sending spinner (#6)
- `.accessibilityHidden(true)` on the decorative search + empty-state glyphs (#1, #7)
- `.accessibilityElement(children: .combine)` on the row text block (#3) and the
  empty-state container (#7) → single coherent VoiceOver announcement

## Constraints respected

- **1 file, +8 lines, 0 logic change** — no behavior, networking, or layout touched.
- **0 new i18n keys** — every string already exists in `ForwardPickerSheet` (SSOT).
- **0 new tests** — annotation-only change, no new testable behavior.
- Dynamic Type left as-is (already semantic); the fixed decorative glyph is
  correctly frozen per the empty-state-illustration doctrine.

## Verification status

- Static review: diff matches the `ForwardPickerSheet.sendButton`/`conversationRow`
  reference one-for-one (only `conv.title` → `conv.name` differs, matching this
  view's non-optional name model). ✅
- `conv.name` confirmed valid & non-optional (already used at row title + search filter). ✅
- Swift compile / `ios-tests` CI: gated on the PR (no local macOS toolchain). ⏳

## Remaining / follow-ups

- Sibling `MessageEditsDetailView` and `MessageTranscriptionDetailView` are still
  untouched (`sys=1 rel=0 a11y=0`) — candidate for a future MessageDetail a11y iteration.
- `MessageDetailSheet.forwardTabContent` (the legacy inline copy at
  `MessageDetailSheet.swift:1836+`) carries the same gap; if it is still live it
  should receive the identical treatment (or be deleted in favour of this extracted view).
