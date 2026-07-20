# Iteration-179i — VoiceOver label + Dynamic Type for `VideoFullscreenPlayer`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) + Dynamic Type — fullscreen video dismiss control
**File touched:** `apps/ios/Meeshy/Features/Main/Views/VideoLegacySupport.swift` (1 file, 0 logic, 0 new key, 0 new test)

## Component

`VideoFullscreenPlayer` is the lightweight fullscreen player used for
composer-preview of local video file URLs (pre-send previews — watch-progress
reporting removed by design). It renders a black backdrop, a native
`VideoPlayer`, and a single top-leading chrome control: an icon-only
`xmark.circle.fill` **dismiss** button.

## Findings

Two real defects on the dismiss control:

1. **VoiceOver — icon-only button with no label.** The `Button` wraps only an
   `Image(systemName: "xmark.circle.fill")` and carried **no
   `.accessibilityLabel`**. VoiceOver announced it as an unlabeled "button"
   with no way to know it dismisses the player — the *only* exit affordance on
   the screen was inaccessible. This is the same icon-only-control gap resolved
   on prior dismiss surfaces and violates the HIG rule that every interactive
   element must expose a label.

2. **Dynamic Type — frozen glyph.** The dismiss glyph used a fixed
   `.font(.system(size: 28))`. Unlike glyphs pinned inside a fixed tap frame
   (doctrine 82i — legitimately frozen), this glyph sits in a **padding-only**
   layout with no fixed width/height, exactly like the `xmark.circle.fill`
   dismiss button in `ReportUserView` (`ReportUserView.swift:49-53`) which
   already scales via `MeeshyFont.relative(24)`. There was no reason for it to
   stay frozen.

## Fix

Applied the established sibling pattern (`ReportUserView`), scoped to the one
dismiss button:

- `Image(...).font(.system(size: 28))` → `.font(MeeshyFont.relative(28))` — the
  dismiss glyph now scales with Dynamic Type (weight/design defaults preserved;
  no fixed frame to clip it), matching `ReportUserView`.
- `.accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))`
  on the `Button` — reuses the existing shared close key (**0 new key**), so
  VoiceOver now announces "Fermer, button".

`MeeshyUI` is already imported by the file, so `MeeshyFont` is in scope with no
new import. The `.padding()` default keeps the tap target well above the 44×44
HIG minimum.

## Rationale

For a fullscreen preview whose *only* control is the dismiss button, that
control must be both discoverable by VoiceOver and legible at large text sizes.
The fix touches nothing else — the AVPlayer setup, playback speed, orientation,
and the black backdrop are unchanged, and the visual size at the default text
setting is identical (`.system(size: 28)` and `MeeshyFont.relative(28)` resolve
to the same point size at the default content-size category).

## Verification

- **Static review:** `MeeshyFont.relative(_:)` (`MeeshyUI/Theme/Accessibility.swift:152`)
  takes a `CGFloat` size with `weight`/`design` defaults — `MeeshyFont.relative(28)`
  is valid. `.accessibilityLabel(String(localized:defaultValue:bundle:))` is a
  standard iOS 16.0+ API; `common.close` already exists in
  `Localizable.xcstrings` and is used by `ReportUserView`,
  `BubbleStandardLayout+Media`, `OnboardingFlowView`. App floor is iOS 16.0 —
  no availability guard needed.
- **No visual/logic change:** only an accessibility modifier and a
  Dynamic-Type-equivalent font swap; default-size rendering is pixel-identical.
- **No test churn:** no test references `VideoFullscreenPlayer` /
  `VideoLegacySupport` (grep across `MeeshyTests` / `MeeshyUITests` /
  `MeeshySDKTests` = 0).
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `PeopleDiscoveryView` / `DiscoveryTab` (`ContactsShared.swift:30-33`) —
  hardcoded, unaccented French enum raw values (`"Decouvrir"`, `"Demandes"`,
  `"Bloques"`) used as both visible `Text` and `.accessibilityLabel`;
  localization iteration candidate. **Note:** `DiscoverTab` search + result rows
  is in flight as PR #2099 (178i) — verify collision before taking.
- `CrashReportSheet` — icon-only `ShareLink` with no `.accessibilityLabel`;
  expand/collapse `.onTapGesture` row lacks `.isButton` / hint.

**Status: RESOLVED for `VideoFullscreenPlayer` dismiss-control VoiceOver label + Dynamic Type.**
