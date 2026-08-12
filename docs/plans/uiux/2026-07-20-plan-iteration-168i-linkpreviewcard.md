# Plan — Iteration-168i — `LinkPreviewCard` VoiceOver + i18n

**Base:** `main` @ `c61a3a7` · **Working branch:** `claude/laughing-thompson-55w0p9`
**Scope:** iOS only · 1 file · 0 logic · 0 new test

## Goal
Give the inline OpenGraph link preview a coherent VoiceOver identity and
localize its accessibility strings, without touching the visual design or the
metadata-resolution flow.

## Steps
1. Add accessibility modifiers to the whole-card `Button`:
   - `.accessibilityElement(children: .ignore)`
   - `.accessibilityLabel(accessibilityLabelText)`
   - `.accessibilityHint(accessibilityHintText)`
   - `.accessibilityAddTraits(.isLink)`
2. Add computed helpers `accessibilityLabelText` (switch on
   `metadata`/`didResolve`, mirroring `content`) and `accessibilityHintText`.
3. Localize via inline `String(localized:defaultValue:bundle:)` — 4 keys:
   `linkpreview.a11y.label`, `linkpreview.a11y.label-failed`,
   `linkpreview.a11y.label-loading`, `linkpreview.a11y.hint`.

## Non-goals
- No `.xcstrings` catalog edit (inline defaults, per file-family doctrine).
- No change to `LinkPreviewStore`, `SafariView`, or the metadata pipeline.
- No visual change (rail, thumbnail, typography, colors untouched).

## Verification
- Static: all APIs iOS 13+; app floor iOS 16 → no availability guard.
- `LinkMetadata` fields (`title`/`description`/`siteName`/`host`/
  `hasAnyVisibleField`) confirmed in `LinkPreviewFetcher.swift`.
- No test references the view (grep = 0). Single call site
  (`BubbleStandardLayout.swift:934`) unchanged.
- CI `ios-tests` (macOS) builds/runs; confirm green before merge.
