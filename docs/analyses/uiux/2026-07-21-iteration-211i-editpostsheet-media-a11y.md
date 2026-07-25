# Iteration 211i — `EditPostSheet` media thumbnail VoiceOver description

**Track:** iOS UI/UX (suffix `i`)
**Date:** 2026-07-21
**Scope:** 1 Swift file, +21 lines (5 comment), 0 logic / 0 network / 0 visual / 0 new test
**File:** `apps/ios/Meeshy/Features/Main/Components/EditPostSheet.swift`

## Context

`EditPostSheet` is the sheet for editing an authored post (body text, source
language with re-translation, POST↔REEL type, and an attached-media strip with a
remove/restore control). It was named as a follow-up candidate in PR #2193 (195i):

> `EditPostSheet` (357 l): one genuine `.system(size: 22)` Dynamic-Type gap
> (the `size: 18` sibling is frozen by a doctrine comment) + zero header traits.

Both of those framings were re-examined and **rejected** as non-defects:

1. **`.system(size: 22)` in `mediaIcon` is NOT a Dynamic-Type gap.** It is the
   media-type placeholder glyph rendered *inside the fixed, clipped 64×64
   thumbnail frame* (`.frame(width: 64, height: 64).clipShape(...)`). This is the
   **same rigid-frame case** the sibling `.system(size: 18)` remove-control glyph
   carries an explicit doctrine comment for ("un glyphe dans un cadre rigide crève
   sa frame s'il scale"). Converting it to `MeeshyFont.relative` would let it
   overflow/clip its rigid box at large Dynamic Type — a regression, not a fix.
   The glyph is also `.accessibilityHidden(true)` (purely decorative). **Left
   untouched.**

2. **"Zero header traits" is not a real defect here.** The sheet is a single flat
   compose form under a native `.navigationTitle(...).navigationBarTitleDisplayMode(.inline)`
   — the nav title already carries the header trait, and there are no section
   headings to promote. **No change.**

## Real defect found — WCAG 1.1.1 + 1.4.1 (media strip is opaque to VoiceOver)

The horizontal media strip (`mediaSection` → `mediaThumbnail`) renders each
attachment as a `ZStack` of:

- a **visual thumbnail** (`CachedAsyncImage` for image/video, or a decorative
  `mediaIcon` fallback) — **carrying no accessibility label at all**, and
- a **remove/restore `Button`** — the *only* labeled element in the cell.

Consequences for a VoiceOver user swiping the strip:

- **The media type is invisible.** Every cell announces only its button
  ("Retirer le média" / "Restaurer le média"). A strip of 4 attachments reads as
  four identical buttons — the user cannot tell an image from a video from an
  audio clip from a document from a location (WCAG 1.1.1, non-text content).
- **The removed state is conveyed by opacity alone.** A removed thumbnail is
  dimmed to `0.35` opacity — a visual-only signal (WCAG 1.4.1). (The button label
  does flip Retirer↔Restaurer, which partially mitigates via the *action*, but the
  thumbnail element itself carries no state.)

## Fix

Make each thumbnail a single described VoiceOver element, leaving the
remove/restore button reachable as its sibling (mirrors the 183i
`CommunityLinksView` doctrine: a secondary action on a described row stays its own
element):

- `.accessibilityElement(children: .ignore)` on the thumbnail `Group` — collapses
  the decorative image/icon into one element.
- `.accessibilityLabel(mediaKindLabel(item.kind))` — announces the kind
  (Image / Vidéo / Audio / Document / Position).
- `.accessibilityValue(removed ? "Retiré" : "")` — announces the removed state as
  a value (empty = no value spoken when active).

New helper `mediaKindLabel(_:)` returns a compact localized noun per kind. The
existing `a11y.post.media.*` family was **not** reused: its wording is
"Image partagée / Shared image" (semantically *shared* content), and its
document/location variants take a `%@` filename that `EditablePostMedia` does not
carry (no name field). A plain compose-context noun reads correctly here.

VoiceOver now reads, per cell: **"Image"** (active) or **"Vidéo, Retiré"**
(removed), then the reachable **"Restaurer le média"** action.

## i18n

Follows this file's established convention — **inline `String(localized:defaultValue:)`
keys extracted at build, 0 `.xcstrings` edits** (every string in `EditPostSheet`
already uses this pattern; parity with 206i #2224). 6 new inline keys:

- `feed.post.edit.media.kind.{image,video,audio,document,location}`
- `feed.post.edit.media.removed.a11y`

## Verification

- `.accessibilityElement/Label/Value` are iOS 14/16+ — app floor is 16.0, no
  `@available` guard needed.
- The labeled `Group` and the `Button` remain **separate** ZStack siblings — the
  remove/restore action is not swallowed.
- No test references `EditPostSheet` (grep across `MeeshyTests` / `MeeshyUITests`
  / SDK = 0). Build authored on Linux (no Xcode/Swift toolchain) → gate = CI
  **iOS Tests**.
- Collision check: `EditPostSheet.swift` is modified by **zero** open PRs (#2193 /
  #2181 only *mention* it as prior-art in their bodies).

## Follow-ups (211i+, verify contention first)

- `CommentMediaView` (217 l, 4 a11y mods) — named in #2193 as untreated.
- `FeedCommentsSheet` (1717 l) — several `.system(size:)` and no header traits.
- The `metadataSection` language `Button` could take an `.accessibilityHint`
  ("Ouvre le sélecteur de langue") — minor, deferred.

## Status

**Resolved for this surface.** ⚠️ Do not re-flag the `EditPostSheet` media strip
for missing VoiceOver kind/state, nor re-flag `mediaIcon`'s `.system(size: 22)` as
a Dynamic-Type gap (rigid-frame doctrine — intentional).
