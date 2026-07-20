# Iteration-179i — VoiceOver dismiss label for `VideoFullscreenPlayer`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) + i18n — fullscreen video close control
**File touched:** `apps/ios/Meeshy/Features/Main/Views/VideoLegacySupport.swift` (1 file, 0 logic, 0 visual, 0 new key, 0 new test)

## Component

`VideoFullscreenPlayer` (in `VideoLegacySupport.swift`) is the lightweight
fullscreen player used for **composer-preview** of a local video file before
send (moved out of MeeshySDK in Phase 5). It shows a native `VideoPlayer`
edge-to-edge over a black backdrop, with a single overlaid control in the
top-left corner: a `Button { dismiss() }` wrapping an `xmark.circle.fill`
glyph. It is the **only interactive affordance** in the view — the sole way
out of the fullscreen preview.

## Findings

The dismiss `Button` had **no `.accessibilityLabel`**. Its label is a bare
`Image(systemName: "xmark.circle.fill")`, so VoiceOver derived the button's
name from the SF Symbol — announcing an unlocalized, meaningless glyph token
(or nothing useful) instead of an actionable "Close". A VoiceOver user
entering the fullscreen preview had no clearly-named way to leave it.

This is the standard **icon-only control lacks accessibility label** gap that
`apps/ios/CLAUDE.md` calls out ("Every `Button`, `Image`, and custom
interactive element MUST have `.accessibilityLabel()`"), and the exact defect
already resolved on ~15 sibling close buttons across the app (e.g.
`AudioFullscreenView:477`, `StoryViewerContainer:174`, `MagicLinkView:69`,
`PostTranslationSheet:67`), all of which use the shared key
`common.close`.

The `.font(.system(size: 28))` on the glyph is a **fixed** control-chrome size.
It is intentionally left frozen: it is a decorative close affordance floating
over a fullscreen video, and letting it scale with the largest Dynamic Type
sizes would blow the corner control out of proportion over the video surface.
This matches the frozen-decorative-glyph doctrine applied consistently in
prior iterations (82i/84i/86i/162i).

## Fix

Applied the canonical close-button pattern already established across the
codebase, scoped to the single dismiss `Button`:

- `.accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))`

This reuses the **existing** `common.close` string-catalog key (shared by ~15
close controls) — **0 new i18n key, 0 xcstrings edit** (the inline
`defaultValue` keeps it code-only-extractable). The `xmark.circle.fill` glyph
stays as the `Button` label and is now correctly named for VoiceOver; the
`Button` already carries the `.isButton` trait natively, so no `.combine` or
extra trait is required. Result is a single clean VoiceOver stop:
"Fermer, button".

## Rationale

The fullscreen preview is a modal-feeling surface with one job: get back out.
A VoiceOver user must be able to find and name that exit. The label is the
minimal, correct fix — no layout, color, logic, or Indigo-identity change, and
it aligns this last unlabeled close button with the app-wide `common.close`
convention (design-system consistency + reuse).

## Verification

- **Static review:** `.accessibilityLabel(String(localized:defaultValue:bundle:))`
  is a standard SwiftUI iOS 16.0+ API; app floor is iOS 16.0, no availability
  guard needed. The key + call shape are byte-identical to the ~15 existing
  close-button sites, so extraction and localization behave identically.
- **No visual/logic change:** the fix adds only an accessibility modifier; the
  visible glyph, position, tint, player, orientation lock, and
  onAppear/onDisappear player lifecycle are untouched.
- **No test churn:** no test references `VideoFullscreenPlayer`,
  `VideoLegacySupport`, or `FullscreenAVPlayerLayerView` (grep across
  `MeeshyTests` = 0).
- **No PR collision:** `list_pull_requests` (open) scanned — no open iOS PR
  touches `VideoLegacySupport.swift` / `VideoFullscreenPlayer`. Iteration
  number **179i** chosen strictly greater than the highest in flight (178i,
  `CrashReportSheet` #2105).
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `CrashReportSheet` — icon-only `ShareLink` with no `.accessibilityLabel`;
  expand/collapse `.onTapGesture` row lacks `.isButton` / hint. **(178i #2105
  in flight — do not re-flag until merged.)**
- `PeopleDiscoveryView` / `DiscoveryTab` (`ContactsShared.swift:30-33`) —
  hardcoded, unaccented French enum raw values (`"Decouvrir"`, `"Demandes"`,
  `"Bloques"`) used as both visible `Text` and `.accessibilityLabel`; the
  sub-tab selector also signals selection by color only (i18n + WCAG 1.4.1
  candidate, twin of the `ContactsHubView` tab bar solved 176i).
- `ContactFilter` / `RequestFilter` raw values (`ContactsShared.swift:47-58`) —
  hardcoded French display literals, same i18n treatment.

**Status: RESOLVED for `VideoFullscreenPlayer` VoiceOver dismiss label.**
