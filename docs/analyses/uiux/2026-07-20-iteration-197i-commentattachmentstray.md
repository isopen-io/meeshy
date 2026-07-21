# Iteration-197i — VoiceOver structure for `CommentAttachmentsTray` staged-attachment chips

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — comment composer staged-attachment tray
**File touched:** `apps/ios/Meeshy/Features/Main/Views/CommentMediaView.swift` (1 file, 0 logic, 0 new i18n key, 0 SDK change, 0 new test)

## Component

`CommentAttachmentsTray` (top of `CommentMediaView.swift`) is the reusable
horizontal band of **staged** comment attachments (chips with a remove control),
shared by every comment-composer surface (`FeedCommentsSheet`, `PostDetailView`,
`StoryViewerView+Canvas`) through `UniversalComposerBar.customAttachmentsPreview`.
Each chip renders: a decorative type-icon (`mic.fill` / `photo.fill` / …), the
attachment **name**, and an `xmark` **remove `Button`**.

The sibling `CommentMediaView` (rendered single media) in the same file was
already accessible — the `imageView` carries `.isButton` + label + hint, and the
video/audio cases delegate to `MeeshyVideoPlayer` / `AudioPlayerView` (SDK
components with their own a11y). **The entire deficit was in the tray.**

## Findings

1. **Indistinguishable remove buttons (WCAG 1.3.1 / 4.1.2).** Every chip's remove
   `Button` carried the same generic `.accessibilityLabel` « Retirer la pièce
   jointe ». With multiple staged attachments the tray exposed *N* identical
   « Retirer la pièce jointe » buttons — a VoiceOver user could not tell which
   button removed which attachment without hunting the adjacent name text.

2. **Decorative type-icon exposed.** The category glyph (l.19-21) was read by
   VoiceOver as noise (« image ») before the name on every chip.

3. **Chip read as scattered elements.** Icon, name, and remove button were three
   separate VoiceOver stops per chip with no grouping — the name (the only piece
   that identifies the attachment) was disconnected from its remove control.

## Fix

Applied the canonical Apple secondary-action idiom established at 183i
(`CommunityLinksView`) / 194i (`LinksHubView`) — collapse the chip to a single
navigable element labelled by the attachment name and re-expose the destructive
control through the **Actions rotor**:

- **Type-icon** → `.accessibilityHidden(true)` (decorative).
- **Remove `Button`** → `.accessibilityHidden(true)`; its now-dead
  `.accessibilityLabel` removed. Sighted tap is untouched (hiding affects only
  the a11y tree).
- **Chip container** → `.accessibilityElement(children: .combine)` so it reads as
  one element labelled by the attachment name (the icon + hidden button are
  excluded), plus `.accessibilityAction(named:)` « Retirer la pièce jointe »
  reusing the **existing** inline key — **0 new i18n key**.
- **Removal side-effects** extracted into `remove(_ attachment:)` (haptic +
  `withAnimation` `onRemove` + temp-file cleanup) so the sighted button tap and
  the VoiceOver rotor action stay byte-for-byte in lockstep — no duplicated
  closure.

Result: each staged attachment is now one VoiceOver element announced
« {name} », with « Retirer la pièce jointe » available in the Actions rotor and
correctly scoped to the focused attachment.

## Constraints honoured

- **0 visual change** — `.accessibilityHidden`, `.accessibilityElement(.combine)`,
  and `.accessibilityAction(named:)` are semantic-only; no layout, color, font,
  gesture, animation, or hit-testing change. The `remove(_:)` extraction is a
  pure refactor of the button's former inline closure — identical behaviour on
  sighted tap.
- **0 logic / 0 product behaviour** change.
- **0 new i18n key** — reuses the existing inline `composer.a11y.removeAttachment`
  string for the rotor action name.
- **0 SDK change** — app-side view only.
- **1 file**, +6 lines net.

## Verification status

- Author runs in a Linux container → the macOS **`iOS Tests`** CI job is the build
  authority (compile + run). All APIs used (`.accessibilityHidden`,
  `.accessibilityElement(children:)`, `.accessibilityAction(named:)`,
  `Text(String(localized:))`) are iOS 14/16+, below the app's iOS 16 floor — no
  availability guard needed.
- No test references `CommentAttachmentsTray` or `CommentMediaView` (grep across
  `MeeshyTests` / `MeeshyUITests` / SDK tests = 0). The three callers
  (`FeedCommentsSheet`, `PostDetailView`, `StoryViewerView+Canvas`) pass the tray
  the same `attachments` / `onRemove` inputs — unaffected by accessibility
  modifiers and the private removal helper.

## Remaining improvements (deferred, one surface/iteration, verify contention first)

- `EditPostSheet` (357 l): one genuine `.system(size: 22)` Dynamic-Type gap at
  l.318 (l.300 `size: 18` is frozen by a doctrine comment) + zero header traits.
  (Language-row decorative-glyph pass already in flight as #2204.)
- `CommentMediaView.imageView` already labelled — do **not** re-flag.
- `UniversalComposerBar+Attachments.swift` (l.62) uses the same generic remove
  label; a parallel pass could apply the same idiom there (distinct file, verify
  contention).
