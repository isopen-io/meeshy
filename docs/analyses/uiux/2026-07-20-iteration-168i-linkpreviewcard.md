# Iteration-168i — VoiceOver identity + localization for `LinkPreviewCard`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) + Localization (i18n) — inline OpenGraph link preview
**File touched:** `apps/ios/Meeshy/Features/Main/Components/LinkPreviewCard.swift` (1 file, 0 logic, 0 new test)

## Component

`LinkPreviewCard` is the compact OpenGraph preview rendered below a message
bubble whenever the text contains a URL. It is a whole-card `Button` that opens
the link in an `SFSafariViewController` sheet. It reuses across reply previews,
starred-message rows, etc. (self-loading via `LinkPreviewStore`, no ViewModel
coupling). Its single call site today is
`BubbleStandardLayout.swift:934`.

The card renders in three visual states:
- **populated** — a colored accent rail, uppercase site name, title (2 lines),
  description (2 lines), and a 72-pt thumbnail.
- **failed** — the terminal state for URLs with no usable OG metadata: host +
  raw URL + a static `link` glyph (never an endless spinner).
- **skeleton** — host + raw URL + a `ProgressView` while metadata resolves.

## Findings

Flagged as an open candidate at the close of iteration 167i. Two gaps:

1. **Zero accessibility on an interactive element.** The card is a `Button` with
   no `.accessibilityElement` / `.accessibilityLabel` / `.accessibilityHint` and
   no `.isLink` trait. VoiceOver swept it as disconnected fragments — the
   uppercase site name (read letter-run-friendly but out of context), the
   truncated title, the description, and the decorative thumbnail — with no
   single element carrying the card's identity, no affordance telling the user
   the tap opens a browser, and no link semantics. The `HIG` link-preview
   pattern is a single element that reads as a sentence and announces itself as
   a link.

2. **No VoiceOver text for the loading/terminal shells.** In the skeleton and
   failed states the only textual content is the host + the raw URL string —
   VoiceOver would spell out a long URL character group with no framing, and
   there was no "loading" cue for the skeleton.

## Fix

Applied the canonical Apple label/hint pattern, folding the fragments into one
link element whose label mirrors the three states of `content`:

- `.accessibilityElement(children: .ignore)` — collapses the accent rail, site
  name, title, description and thumbnail into one element.
- `.accessibilityLabel(accessibilityLabelText)` — reads the preview as a
  sentence. Populated: `"Aperçu du lien : {siteName}. {title}. {description}"`
  (only the present fields, joined with `. `). Failed: `"Lien vers {host}"`.
  Loading: `"Aperçu du lien en cours de chargement, {host}"`. The host fallback
  guarantees the element is never anonymous.
- `.accessibilityHint(accessibilityHintText)` — `"Ouvre le lien dans le
  navigateur"`, matching the actual `SFSafariViewController` action.
- `.accessibilityAddTraits(.isLink)` — VoiceOver announces "lien" and the rotor
  can navigate by links.

Supporting helpers (no behavior change): `accessibilityLabelText` (switches on
the same `metadata`/`didResolve` state as `content`), `accessibilityHintText`.
Four new inline-`defaultValue` keys — `linkpreview.a11y.label`,
`linkpreview.a11y.label-failed`, `linkpreview.a11y.label-loading`,
`linkpreview.a11y.hint` — French defaults ship inline via
`String(localized:defaultValue:bundle:)`, no `.xcstrings` catalog edit (same
doctrine as the 159i/167i file family).

## Rationale

Accessibility and localization are explicitly in review scope. Link previews are
a high-frequency surface in any conversation; a VoiceOver user previously got a
pile of context-free fragments and no signal that the element was a tappable
link into a browser. The label/hint split plus `.isLink` is the exact HIG
pattern, and folding the fragments keeps the visual design (Indigo brand rail,
thumbnail, typography) untouched while making the card coherent and navigable.

## Verification

- **Static review:** all modifiers are standard SwiftUI iOS 13.0+ APIs
  (`accessibilityElement`, `accessibilityLabel`/`Hint`, `accessibilityAddTraits`
  with `.isLink`). App floor is iOS 16.0, no availability guard needed.
  Interpolated `String(localized:defaultValue:bundle:)` and the label/value/hint
  split have established precedent (`AttachmentLoadingTile` 159i,
  `UploadProgressBar` 167i, `CallsTab.swift:230`, `FloatingCallPillView.swift`).
- **Field access:** `LinkMetadata` (`LinkPreviewFetcher.swift`) exposes
  `title`, `description`, `siteName` (all `String?`) and computed `host`
  (`String?`) + `hasAnyVisibleField` — all already read by `populatedCard`. The
  file-private `nilIfBlank` extension is reused.
- **No test churn:** no test references `LinkPreviewCard` (grep across
  `MeeshyTests` / `MeeshyUITests` / `MeeshySDKTests` = 0). The single call site
  (`BubbleStandardLayout.swift:934`) passes `urlString`/`accentColor`/`isDark`
  unchanged.
- **CI gate:** `ios-tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `ios-tests` is green on the PR
  before merge.

## Remaining improvements (future iterations)

- `LoadMoreRepliesCell` (UIKit cell, unlocalized "View N more replies", fixed
  13pt font) — still open, surfaced in 167i.
- `LinkPreviewCard` thumbnail placeholder glyph uses a fixed symbol font
  (`MeeshyFont.relative(14)`) — intentional, bounded to the 72-pt tile.

**Status: RESOLVED for `LinkPreviewCard` VoiceOver identity + localization.**
