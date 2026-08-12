# Iteration-167i — Localization + VoiceOver for `UploadProgressBar`

**Date:** 2026-07-19
**Scope:** iOS only
**Area:** Localization (i18n) + Accessibility (VoiceOver) — attachment upload progress feedback
**File touched:** `apps/ios/Meeshy/Features/Main/Components/UploadProgressBar.swift` (1 file, 0 logic, 0 new test)

## Component

`UploadProgressBar` is the inline progress card shown while attachments upload
through the TUS queue. It renders across three surfaces from a single
`UploadQueueProgress` value (SDK `TusUploadManager`):
- Conversation composer — `ConversationView+Composer.swift:427`
- Feed post composer — `FeedView+Attachments.swift:758`
- Feed root — `FeedView.swift:1305`

It shows an animated up-arrow, the current file name, a monospaced percentage,
a gradient fill bar, an `N/M fichiers` counter, and a `uploaded / total` byte
readout.

## Findings

The bar was already sound on Dynamic Type (percentage, files counter and byte
readout all use `MeeshyFont.relative(…)`). Two gaps remained:

1. **Hardcoded, unlocalized French string.** The files counter read
   `Text("\(progress.completedFiles)/\(progress.totalFiles) fichiers")` — the
   only string in the file bypassing the codebase's inline
   `String(localized:defaultValue:bundle:)` idiom. Every other user-facing
   string component in this tree is localization-ready; this one shipped a raw
   `"fichiers"` literal.

2. **Zero accessibility on a progress indicator.** The view had no
   `.accessibilityElement` / `.accessibilityLabel` / `.accessibilityValue`.
   VoiceOver swept it as disconnected fragments — the decorative up-arrow, the
   truncated file name, `"42%"`, `"2/5 fichiers"`, and `"410 KB / 850 KB"` —
   with no single element carrying the upload state, and no `.updatesFrequently`
   trait, so the 0 → 100 % progression was never surfaced. Progress was
   conveyed **only** by the gradient fill width (a color/geometry channel a
   VoiceOver user cannot perceive).

## Fix

Applied the idiomatic Apple label/value split (same shape as 159i
`AttachmentLoadingTile`) and localized the remaining string:

- `.accessibilityElement(children: .ignore)` — collapses the fragmented
  children (arrow, file name, percentage, bar, counter, bytes) into one element.
- `.accessibilityLabel(accessibilityLabelText)` — the stable identity
  ("Envoi des fichiers" / "Uploading files").
- `.accessibilityValue(accessibilityValueText)` — the live state as a full
  phrase: percentage + completed/total files + current file name
  ("42 %, 2 fichiers sur 5 envoyés, IMG_0421.jpg"). The visible captions stay
  terse; VoiceOver gets the unabbreviated wording.
- `.accessibilityAddTraits(isUploading ? .updatesFrequently : [])` — while the
  queue is non-terminal (percentage < 100), VoiceOver re-announces the value on
  refocus as bytes advance; the trait clears at 100 %.
- Localized the files counter via `filesCountLabel`
  (`String(localized: "upload.progress.files-count", defaultValue:
  "\(completedFiles)/\(totalFiles) fichiers", bundle: .main)`).

Supporting helpers (no behavior change): `isUploading`, `filesCountLabel`,
`accessibilityLabelText`, `accessibilityValueText`. Three new inline-`defaultValue`
keys (`upload.progress.files-count`, `upload.progress.a11y-label`,
`upload.progress.a11y-value`) — French defaults ship inline, no `.xcstrings`
catalog edit (same doctrine as the rest of the file family).

## Rationale

Loading/progress states are explicitly in the UX + accessibility review scope.
Uploading media is a transient, high-frequency surface every user hits; a
VoiceOver user previously got noise and no coherent progress signal, and the
one remaining raw string blocked localization of a shipped screen. The
label/value split is the canonical Apple pattern; folding the fragments into one
`.updatesFrequently` element makes the progression audible without touching the
visual design (Instant-App / Indigo brand identity preserved).

## Verification

- **Static review:** all modifiers are standard SwiftUI iOS 16.0+ APIs
  (`accessibilityElement`, `accessibilityLabel`/`Value`, `accessibilityAddTraits`).
  App floor is iOS 16.0, no availability guard needed.
  `.accessibilityAddTraits(cond ? … : [])` and interpolated
  `String(localized:defaultValue:bundle:)` both have established precedent
  (`AttachmentLoadingTile`, `EmailVerificationView.swift:82`,
  `StatusBarView.swift:88`).
- **No test churn:** no test references `UploadProgressBar` (grep across
  `MeeshyTests` / `MeeshyUITests` / `MeeshySDKTests` = 0). The three production
  call sites pass `progress`/`accentColor` unchanged. `UploadQueueProgressTests`
  exercises the SDK value type, not the view.
- **CI gate:** `ios-tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `ios-tests` is green on the PR
  before merge.

## Remaining improvements (future iterations)

- The `arrow.up.circle.fill` glyph uses a fixed `.subheadline` symbol font —
  intentional (bounded to the row height), no change.
- Byte readout uses `.byteCount(.file)` which is already locale-aware.
- `LinkPreviewCard` (whole-card `Button` with no VoiceOver label/hint) and
  `LoadMoreRepliesCell` (UIKit cell, unlocalized "View N more replies", fixed
  13pt font) remain open candidates surfaced during this scan.

**Status: RESOLVED for `UploadProgressBar` localization + VoiceOver structure.**
