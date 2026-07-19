# Plan — Iteration-170i — VoiceOver label/hint for `LinkPreviewCard`

**Date:** 2026-07-19
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — OpenGraph link preview card below message bubbles
**Base:** `main` HEAD (resynced from `origin/main`)
**Working branch:** `claude/laughing-thompson-1ulwwe`

## Target selection

`LinkPreviewCard` was surfaced as an open a11y candidate in the 167i analysis
("`LinkPreviewCard` (whole-card `Button` with no VoiceOver label/hint)").
Confirmed fresh: never touched by any prior analysis, and no open PR in the
iOS swarm (167i→169i in flight, `list_pull_requests`) targets it. Numbered
**170i** — strictly above the highest in-flight iOS iteration to avoid any
doc-name collision.

## Problem

`LinkPreviewCard` wraps its whole content in a `Button` (opens the URL in an
in-app `SFSafariViewController`). SwiftUI folds every child `Text` of a Button
into the Button's VoiceOver label. In the **skeleton** and **failed** states the
card renders `Text(urlString)` — so VoiceOver read out the **entire raw URL**
character group. There was also no `.accessibilityHint` telling the user the
tap opens the link, and no `.isLink` trait.

## Fix (1 file, 0 logic, 0 visual change)

`apps/ios/Meeshy/Features/Main/Components/LinkPreviewCard.swift`:

1. `.accessibilityLabel(accessibilityLabelText)` on the Button — replaces the
   verbose auto-label with a concise "Lien : {site name}, {title}" (populated)
   or "Lien : {host}" (skeleton/failed/metadata-less), never the raw URL.
2. `.accessibilityHint(…"Ouvre le lien dans Safari")` — mirrors the
   `LicensesView` idiom for URL-opening cards.
3. `.accessibilityAddTraits(.isLink)` — the trait now matches the action.

New computed helper `accessibilityLabelText` (pure, derives from resolved
`metadata`/`fallbackHost`).

**2 new i18n keys** (code-only via `defaultValue`, String Catalog
auto-extraction, no `.xcstrings` edit): `link-preview.a11y.label`,
`link-preview.a11y.hint`.

## Verification

- Static: `.accessibilityLabel/Hint`, `.accessibilityAddTraits(.isLink)` are
  iOS 14+ APIs; app floor iOS 16 → no availability guard. `LinkMetadata`
  fields used (`siteName`/`host`/`title`/`hasAnyVisibleField`) confirmed in
  SDK `LinkPreviewFetcher.swift`.
- No test references `LinkPreviewCard` (grep across MeeshyTests/MeeshyUITests/
  MeeshySDK = 0). Production call sites (`BubbleContent`, `BubbleStandardLayout`)
  pass `urlString`/`accentColor`/`isDark` unchanged.
- CI gate: `iOS Tests` (macOS runner) — Linux container, so the build/VoiceOver
  run happens in CI. Confirm `iOS Tests` green before merge.
