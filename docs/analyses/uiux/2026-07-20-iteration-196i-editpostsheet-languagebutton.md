# Iteration-196i — VoiceOver decorative-glyph cleanup for `EditPostSheet` language selector

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — post-edit sheet, language-selector row
**File touched:** `apps/ios/Meeshy/Features/Main/Components/EditPostSheet.swift` (1 file, 0 logic, 0 new i18n key, 0 SDK change, 0 new test)

## Component

`EditPostSheet` (357 l) is the presentation-only sheet for editing an authored
post: body `TextEditor`, an attached-media strip with remove/restore controls, a
**language-selector row** (opens `ProfileLanguagePickerSheet`), an optional
POST↔REEL segmented `Picker`, and a remaining-character counter. The parent owns
persistence (`ViewModel.updatePost`).

The sheet was already well-covered for accessibility: the `TextEditor`, the
character counter, and each media remove/restore `Button` all carry localized
`.accessibilityLabel`s, and the media placeholder icon is `.accessibilityHidden`.

## Findings

The **language-selector `Button`** (`metadataSection`, l.207-237) is a compound
disclosure row whose label nests, in order:

1. a decorative `globe` glyph (l.212),
2. the "Langue du contenu" title,
3. the selected language value (`🇫🇷 Français`) or "Auto",
4. a decorative `chevron.right` disclosure glyph (l.227).

Because the row is a `Button`, SwiftUI auto-composes its descendants into a single
VoiceOver label. The two **decorative glyphs were exposed**, so VoiceOver
announced them as "image" noise inside the composed label
(« image, Langue du contenu, 🇫🇷 Français, image, bouton »). Neither glyph
carries information the label text doesn't already convey — `globe` is pure
ornament and `chevron.right` is the standard "opens a detail" affordance already
implied by the button trait.

### Non-finding (explicitly ruled out)

The 194i note flagged `.system(size: 22)` at l.318 (`mediaIcon`) as a
"Dynamic-Type gap". On inspection this is **not** a genuine gap: that glyph is
already `.accessibilityHidden(true)` **and** renders inside a fixed **64×64**
thumbnail frame (l.287), identical to the rigid-frame doctrine that freezes the
sibling `size: 18` control at l.300. Making it Dynamic-Type-relative would let it
overflow its rigid tile. **Left untouched by design.**

## Fix

Applied the canonical decorative-hiding idiom (183i `CommunityLinksView`, 194i
`LinksHubView`): keep the `Button`'s label auto-composed and hide the two
ornamental glyphs.

- `globe` (l.212) → `.accessibilityHidden(true)`.
- `chevron.right` (l.227) → `.accessibilityHidden(true)`.

Result: the row now reads « Langue du contenu, 🇫🇷 Français, bouton »
(or « Langue du contenu, Auto, bouton » when unset) — the purpose and current
value, no image noise. No `.accessibilityElement`/`.combine` was forced onto the
`Button` itself, avoiding the combine-on-`Button` activation hazard.

## Constraints honoured

- **0 visual change** — `.accessibilityHidden(true)` is semantic-only; layout,
  color, font, gesture, hit-testing and the sighted tap-to-open-picker are
  byte-for-byte unchanged.
- **0 logic / 0 product behaviour** change.
- **0 new i18n key** — no strings added or altered. (The existing
  `feed.post.edit.*` keys already resolve via `defaultValue`, not the
  `Localizable.xcstrings` catalog.)
- **0 SDK change** — app-side view only.
- **1 file**, +2 lines.

## Verification status

- Author runs in a Linux container → the macOS **`iOS Tests`** CI job is the build
  authority (compile + run). `.accessibilityHidden(true)` is iOS 13+, well below
  the app's iOS 16 floor — no availability guard needed.
- No iOS test references `EditPostSheet` (grep across `MeeshyTests` /
  `MeeshyUITests` / SDK tests = 0; only a `packages/shared/CHANGELOG.md` mention,
  unrelated to the view). Behaviour is unchanged, so no test needed or affected.

## Remaining improvements (deferred, one surface/iteration, verify contention first)

- `ThreadView` (279 l) — VoiceOver structure. **Note: in flight via PR #2193 (195i)**;
  do not duplicate.
- `CommentMediaView` (217 l) — already well-covered (image path has button trait +
  label + hint; video/audio delegate to sub-players). No genuine deficit found.
- `EditPostSheet` (remaining): the POST↔REEL segmented `Picker` is native and
  needs no work; a discoverability `.accessibilityHint` on the language row
  ("opens the language picker") is a possible future 0-risk add but would require
  a new `defaultValue`-only key — deferred to keep this iteration single-behaviour.
