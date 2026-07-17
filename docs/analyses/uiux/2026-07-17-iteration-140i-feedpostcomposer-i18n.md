# Iteration-140i — Feed post composer i18n gap (FeedView+Attachments)

**Date**: 2026-07-17
**Track**: iOS UI/UX (suffix `i`)
**File**: `apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift`
**Type**: Localization (i18n) — genuine gap, not a style sweep
**Gate**: CI `iOS Tests`

## Problem

The feed post composer surfaced **12 user-facing strings as raw French
literals** that bypassed the string catalog entirely. Unlike the surrounding
code (which already uses `String(localized:defaultValue:bundle:)`), these
literals were never extractable and never translated — a non-French user saw
French text verbatim. Two of them (`"Post publie"`, `"Echec …"`) were also
**missing their French accents** (`publié`, `Échec`), so even French users saw
a typo.

These strings live on the primary content-creation surface (publishing a
post / reel / audio post from the feed), so the gap was highly visible.

### The 12 literals (both `FeedView` extension and `FeedComposerSheet`)

| Literal | Occurrences | New key |
|---|---|---|
| `"Post en attente d'envoi"` | 2 | `feed.post.toast.pending` |
| `"Post publie"` (missing accent) | 2 | `feed.post.toast.published` |
| `"Echec de la publication du post"` (missing accent) | 2 | `feed.post.toast.publish_error` |
| `"Post audio publie"` (missing accent) | 2 | `feed.post.toast.audio_published` |
| `"Echec de la publication du post audio"` | 1 | `feed.post.toast.audio_error` |
| `"Echec de la publication"` (audio sheet path) | 1 | `feed.post.toast.audio_error` (consolidated) |
| attachment labels `Photo / Vidéo / Audio / Fichier / Position` | 2 blocks | `attachment.type.{photo,video,audio,file,location}` |

The two attachment-label functions (`feedLabelForAttachment`,
`sheetLabelForAttachment`) were byte-identical duplicates; both now resolve the
same 5 `attachment.type.*` keys, so a single translation set covers both.

## Fix

- **Swift**: every raw literal → `String(localized: "<key>", defaultValue:
  "<corrected French>", bundle: .main)`, matching the file's own existing
  convention (e.g. `feed.draft.recovered` at the top of the same file). French
  accents restored in the `defaultValue` source strings.
- **Catalog**: 10 new keys added to `Localizable.xcstrings`, each with full
  **de / en / es / fr / pt-BR** coverage (`state: translated`), matching the
  catalog's 5-language contract. `+10` keys (1227 → 1237).

The two `"Echec de la publication"` audio-failure paths were consolidated onto
one `audio_error` key (same semantic event, same message) rather than minting a
redundant string.

## Scope discipline

- 0 logic changes, 0 layout changes, 0 new tests — pure i18n substitution.
- No SDK touched (`MessageAttachment` model untouched; labels resolved
  app-side where they are rendered).
- Fonts (`.font(.system(size:))`, 14 occurrences) deliberately **not** touched
  — several are fixed-frame chrome glyphs already `accessibilityHidden`; a
  Dynamic Type pass on this file is a separate future iteration.

## Verification

- `Localizable.xcstrings` re-parsed as valid JSON; all 10 keys confirmed
  present with 5 languages each.
- `grep` confirms **zero** remaining raw French toast/label literals in the
  file.
- `String(localized:defaultValue:bundle:)` signature is identical to the
  already-compiling call at line 146 of the same file.
- Build/test gate: CI `iOS Tests` (Xcode 26.1.1 / Swift 6.2, run on iOS 18.2) —
  iOS build cannot run on the Linux session; CI is the authoritative gate,
  consistent with prior i18n iterations.

## Remaining (future iterations)

- `FeedView+Attachments.swift` still has French-keyed a11y labels
  (`String(localized: "Ajouter une photo", …)` in the toolbar) — localizable
  but off-convention (French string used as the key). Lower priority: they DO
  resolve, unlike the literals fixed here.
- Dynamic Type pass on this file (14 `.font(.system(size:))`).
