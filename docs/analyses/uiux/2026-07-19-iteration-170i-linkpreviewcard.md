# Iteration-170i — VoiceOver label + hint for `LinkPreviewCard`

**Date:** 2026-07-19
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — OpenGraph link preview card rendered below
message bubbles
**File touched:** `apps/ios/Meeshy/Features/Main/Components/LinkPreviewCard.swift`
(1 file, 0 logic, 0 visual change, 0 new test)

## Component

`LinkPreviewCard` is the compact OpenGraph preview rendered below a message
bubble when the text contains a URL. It resolves its own metadata through
`LinkPreviewStore` and renders one of three states from local state:

- **populated** — accent bar + uppercase site name + title + description +
  thumbnail (`CachedAsyncImage`).
- **skeleton** — accent bar + host + `Text(urlString)` + `ProgressView`
  (still resolving).
- **failed** — accent bar + host + `Text(urlString)` + static `link` glyph
  (resolved, no usable OG metadata — never an endless spinner).

The entire card is a single `Button` that opens the URL in an in-app
`SFSafariViewController`. Call sites: `BubbleContent.swift`,
`BubbleStandardLayout.swift`.

## Findings

The card had **no accessibility wiring at all**. Because SwiftUI folds every
child `Text` of a `Button` into the Button's VoiceOver label:

1. **Raw URL spelled out.** In the **skeleton** and **failed** states the card
   renders `Text(urlString)`, so the auto-generated Button label included the
   full raw URL — VoiceOver read it out as a long character/host group
   (`"https colon slash slash example dot com slash a slash b …"`). Every
   still-resolving or metadata-less link card produced this noise.

2. **No action hint.** Nothing told a VoiceOver user that activating the card
   opens the link in a browser — the tap silently presents a Safari sheet.

3. **No link trait.** The element was announced only as a generic button; the
   `.isLink` trait (semantically correct for content that opens a web link)
   was absent.

## Fix

Applied the canonical Apple label/hint pattern on the Button (idiomatic twin of
`LicensesView`'s "Ouvre le depot dans Safari" URL card):

- `.accessibilityLabel(accessibilityLabelText)` — replaces the verbose
  auto-label with a concise, stable identity:
  - populated → `"Lien : {site name}, {title}"` (only the fields that resolved,
    comma-joined; falls back to host if none),
  - skeleton / failed / metadata-less → `"Lien : {host}"`.
  The raw `urlString` is never read again.
- `.accessibilityHint(…"Ouvre le lien dans Safari")` — the action is now
  announced.
- `.accessibilityAddTraits(.isLink)` — the trait matches what the tap does.

Supporting pure helper `accessibilityLabelText` derives entirely from the
already-resolved `metadata` / `fallbackHost` (no new state, no behavior change).

**Two new inline-`defaultValue` keys** (`link-preview.a11y.label`,
`link-preview.a11y.hint`) — French defaults ship inline via
`String(localized:defaultValue:bundle:)`, String Catalog auto-extracts them; no
`.xcstrings` catalog edit (same doctrine as the rest of the Components family,
cf. 159i/167i).

## Rationale

VoiceOver structure is explicitly in the accessibility review scope. A link
preview is a high-frequency surface (any message containing a URL renders one),
and the pre-fix behavior actively degraded the experience — reading a full URL
aloud is exactly the noise the label/hint split exists to eliminate, and a
VoiceOver user got no signal that the card was actionable at all. The fix is
label-only: no visual change, the Instant-App / Indigo identity and the
per-URL local-state re-render optimization are untouched.

## Verification

- **Static review:** `.accessibilityLabel` / `.accessibilityHint` /
  `.accessibilityAddTraits(.isLink)` are standard SwiftUI iOS 14+ APIs; the app
  floor is iOS 16.0, no availability guard needed. `LinkMetadata` fields used
  (`siteName`, `host`, `title`, `hasAnyVisibleField`) confirmed public in SDK
  `LinkPreviewFetcher.swift`. Setting `.accessibilityLabel` on a Button
  overrides its auto-combined child label while preserving the button element —
  established precedent across the Components family (`ContactCardView`,
  `FeedPostCard`).
- **No test churn:** no test references `LinkPreviewCard` (grep across
  `MeeshyTests` / `MeeshyUITests` / `MeeshySDK` = 0). The two production call
  sites pass `urlString` / `accentColor` / `isDark` unchanged.
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations)

- `LoadMoreRepliesCell` (UIKit cell, unlocalized "View N more replies", fixed
  13pt font) — still open from the 167i scan.
- The `link` SF Symbol glyphs (failed state, thumbnail placeholder) are folded
  into the single Button element now, so no separate `.accessibilityHidden`
  needed; intentional.

**Status: RESOLVED for `LinkPreviewCard` VoiceOver label + hint + link trait.**
