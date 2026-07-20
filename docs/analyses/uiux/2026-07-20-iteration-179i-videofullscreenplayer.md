# Iteration-179i — VoiceOver label for `VideoFullscreenPlayer` dismiss

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — fullscreen video preview (composer / conversation)
**File touched:** `apps/ios/Meeshy/Features/Main/Views/VideoLegacySupport.swift` (1 file, 0 logic, 0 API, 0 test)

## Component

`VideoFullscreenPlayer` (in `VideoLegacySupport.swift`) is the lightweight
fullscreen player presented for local-file video previews — reached from the
conversation media path (`ConversationView.swift:663/665`, two call sites). It
overlays a native `VideoPlayer` on an opaque black background with a single
top-leading dismiss button (`xmark.circle.fill`) as the **only** custom control
in the view.

## Finding (VoiceOver gap)

The dismiss `Button` carried **no `.accessibilityLabel`**:

```swift
Button { dismiss() } label: {
    Image(systemName: "xmark.circle.fill")
        .font(.system(size: 28))
        .foregroundColor(.white.opacity(0.8))
        .padding()
}
```

VoiceOver announced it as an unnamed button (falling back to the raw SF Symbol
name at best). Because this is the *sole* affordance to leave a fullscreen modal
overlay, an unlabeled control is a genuine trap: a VoiceOver user has no reliable
way to discover how to dismiss the player. Every other close button in the app
already carries `String(localized: "common.close", …)` — this legacy view
(migrated out of the SDK in "Phase 5") missed that pass.

The font was **not** a real deficit: `.font(.system(size: 28))` on this
chrome glyph sits in a fixed tap frame (the `.padding()` gives a ≥44pt target),
so per doctrine 82i it is intentionally frozen — exactly like the identical
`VoiceProfileWizardView` close button. It was simply lacking the doctrine
annotation, so a future Dynamic-Type sweep would have churned it needlessly.

## Fix

Purely additive accessibility on the existing button (no visual or logic change):

- `.accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))`
  — reuses the app-wide close-button key so VoiceOver announces "Fermer, bouton".
- `.accessibilityHint(String(localized: "video.fullscreen.close-hint", defaultValue: "Ferme la vidéo en plein écran", bundle: .main))`
  — one new inline-`defaultValue` key (same pattern as the rest of the app, no
  `.xcstrings` catalog edit), clarifying the outcome of a control whose glyph
  alone is ambiguous in a fullscreen context.
- Added the doctrine-82i comment above the frozen `.font(.system(size: 28))` so
  the chrome glyph is explicitly marked intentional (matching the sibling
  `VoiceProfileWizardView`), preventing future redundant Dynamic-Type churn.

## Rationale

Fullscreen modals with a single unlabeled dismiss control are explicitly in the
accessibility-review scope (a VoiceOver dead-end is worse than a mislabeled
control). The label/hint split is the idiomatic Apple pattern (label = what it
is, hint = what it does), and reusing `common.close` keeps the design system
consistent. Freezing the glyph font matches the established chrome-control
doctrine, so the visual design and Meeshy brand identity are untouched.

## Verification status

- `grep` confirms **no test** references `VideoFullscreenPlayer` / `VideoLegacySupport`.
- Both call sites in `ConversationView.swift` are unchanged (API identical).
- 1 file, 0 logic, 0 API, 0 test churn; 1 reused key + 1 new inline key.
- Gate: CI `ios-tests` (compile + XCTest).

## Remaining improvements (future iterations)

- **`MessageViewsDetailView.swift`** (~1000 lines) visibly missed the
  localization + semantic-color pass its siblings received: dozens of hardcoded
  FR/EN literals (`"Inconnu"`, `label: "ID"/"Type"/"Source"/"Langue"`, delivery
  labels `"Lu"/"Distribué"/"Envoyé"`), hardcoded `.yellow/.green/.red` instead of
  `MeeshyColors.warning/.success/.error`, and unlabeled filter capsules. High
  value but a large diff — warrants its own dedicated iteration (or a split).
  (`ReelAudioBackdrop.swift` was also flagged, but a concurrent session is
  already handling it under iteration 178i / PR #2113 — do not duplicate.)
