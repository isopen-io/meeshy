# Plan — Iteration-178i — `ConversationMediaGalleryView` VoiceOver metadata

**Branch**: `claude/laughing-thompson-zpdg1j`
**Base**: `main` HEAD `e82b5e7`
**Scope**: iOS only — 1 file, VoiceOver-only, 0 logic / 0 visual change.

## Context
`ConversationMediaGalleryView` (fullscreen conversation media gallery) is already
mature: `MeeshyFont.relative` throughout, glass chrome, save button labelled +
valued, decorative glyphs `.accessibilityHidden`. Two residual VoiceOver defects
where information is carried by punctuation/symbols that VoiceOver mis-reads:

1. **Page counter** `Text("\(currentIndex + 1) / \(allAttachments.count)")` — the
   position is carried only by the `/` separator. VoiceOver reads it literally as
   « 3 barre oblique 12 ». (Same defect solved in 163i for `AudioCarouselView`.)
2. **Dimensions/size metadata row** — `Text("\(w) × \(h)")` reads the `×` (U+00D7)
   as « multiplication sign » (« 1920 multiplication sign 1080 »); dimensions and
   file-size are announced as disconnected fragments.

## Changes (doctrine 163i / 164i)
1. Wrap the page counter in `.accessibilityElement(children: .ignore)` +
   `.accessibilityLabel` → « Média X sur Y » (key `media.gallery.position`,
   code-only defaultValue, auto-extracted String Catalog — 0 xcstrings).
2. Collapse the bottom metadata `HStack` (hidden type glyph + dimensions + size)
   into one accessibility element via `.accessibilityElement(children: .ignore)` +
   a composed label built by `metadataAccessibilityLabel(_:)`:
   media kind + « L par H pixels » + `fileSizeFormatted`, joined locale-aware /
   RTL-safe via `ListFormatter.localizedString(byJoining:)` (doctrine 164i).
   New code-only keys: `media.gallery.dimensions`, `media.gallery.kind.image`,
   `media.gallery.kind.video`.

## Non-goals / frozen
- Visual layout, fonts, glass, gestures, paging/video logic — untouched.
- Decorative `.system(size:)` glyphs (xmark 16 in 40pt circle, save 18 in 40pt
  circle, poster 22/20 in 64pt circle, empty-state `photo` 48) stay frozen
  (chrome/fixed-frame doctrine 82i/86i) — already `accessibilityHidden` where due.

## Verification
- Source-guard `ConversationMediaGalleryVideoControlsTests` still green: no
  `.adaptiveGlass(` removed, `xmark.circle.fill` never introduced, all 3 chrome
  glass surfaces stay within the 2600-char window.
- Gate = CI `iOS Tests`.
