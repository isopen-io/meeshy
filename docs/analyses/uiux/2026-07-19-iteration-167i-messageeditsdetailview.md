# Iteration-167i — MessageEditsDetailView VoiceOver a11y pass

**Date:** 2026-07-19
**Scope:** iOS only
**Component:** `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageEditsDetailView.swift`
**Type:** Accessibility (VoiceOver) — parity with the MessageDetail a11y series

## Context

`MessageEditsDetailView` is the "Edits" tab embedded inside the message detail
sheet (`MessageDetailSheet`). It renders the edit history of a message: a
timeline banner, the current (post-edit) version, and each prior revision, plus
an empty state when the message was never edited. Revisions are injected via
`editRevisions` (no network state).

It is a direct sibling of the `MessageDetail*` a11y series already merged/in
flight: 144i `MessageViewsDetailView`, 153i `MessageDetailSentimentTab`, 155i
`MessageReactionsDetailView`, 160i `MessageForwardDetailView`, 166i
`MessageTranscriptionDetailView`. The 160i doc explicitly named
`MessageEditsDetailView` as still untouched (`sys=1 rel=0 a11y=0`) and a
candidate for a future MessageDetail a11y iteration. This is that iteration.

## Findings (before)

The file uses semantic fonts throughout (`.caption2`, `.subheadline`,
`.footnote`, `.system(.caption, ...)`) → **Dynamic Type is already correct**.
The lone `.system(size: 28)` is the decorative empty-state glyph, intentionally
frozen per the empty-state-illustration doctrine (84i/86i). The gaps were purely
VoiceOver:

| # | Element | Issue | Severity |
|---|---------|-------|----------|
| 1 | Timeline banner icon (`pencil.and.list.clipboard`) | Decorative, exposed to VoiceOver as an unlabeled image | Low |
| 2 | Timeline banner text (`text` + `detail`) | Two separate `Text` fragments read as two swipes instead of one summary | Medium |
| 3 | Count badge (monospaced capsule) | Duplicates the count already spoken in `detail` ("3 versions precedentes" + "3") → double announcement | Low |
| 4 | Revision row (header + timestamp + content) | Three separate `Text` fragments read as three swipes instead of one coherent revision announcement | Medium |
| 5 | Empty-state glyph (`pencil.slash`) | Decorative, exposed to VoiceOver as an unlabeled image | Low |
| 6 | Empty-state container | Not combined | Low |

## Fix

Mirror the sibling doctrine (160i/166i) — pure VoiceOver annotation, **0 new
i18n keys** (combine reads the already-visible strings):

- `.accessibilityHidden(true)` on the banner icon (#1), the count badge (#3 —
  its value is already conveyed by `detail`), and the empty-state glyph (#5).
- `.accessibilityElement(children: .combine)` on the timeline banner (#2), each
  revision row (#4), and the empty-state container (#6) → one coherent VoiceOver
  announcement per block (e.g. "ACTUEL, 14:32, <content>").

## Constraints respected

- **1 file, +6 lines, 0 logic change** — no behavior, networking, sorting, or
  layout touched.
- **0 new i18n keys** — combine surfaces the existing (hardcoded) strings; no
  new labels introduced. (Residual hardcoded FR strings — "Historique",
  "Actuel", "Version N" — remain a separate i18n lot, out of this a11y scope.)
- **0 new tests** — annotation-only change, no new testable behavior (parity
  with 144i/153i/155i/160i/166i).
- Dynamic Type left as-is (already semantic); the fixed decorative empty-state
  glyph is correctly frozen per the empty-state-illustration doctrine.

## Verification status

- Static review: diff matches the `MessageForwardDetailView` (160i) reference
  pattern — hidden decorative glyphs + combined text blocks, no logic. ✅
- Count badge hidden to avoid a double announcement with `detail`. ✅
- Swift compile / `iOS Tests` CI: gated on the PR (no local macOS toolchain). ⏳

## Remaining / follow-ups

- The MessageDetail a11y series is now essentially complete across its tabs
  (Views/Reactions/Sentiment/Forward/Transcription/Edits). Future MessageDetail
  work would be an i18n lot for the residual hardcoded strings in this view.
- Broader pivot per the tracking doc: low-hanging Dynamic Type is exhausted;
  candidates are hardcoded-string i18n, native-component adoption, and
  design-system dedup.
