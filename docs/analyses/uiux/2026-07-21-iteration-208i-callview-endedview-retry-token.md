# Iteration 208i — `CallView.endedView` retry CTA design-system token

**Track**: iOS UI/UX (suffix `i`)
**Date**: 2026-07-21
**Branch**: `claude/laughing-thompson-1lwf1p`
**Base**: `origin/main` HEAD `22465a5` (prior 195i work already merged as #2201)
**File**: `apps/ios/Meeshy/Features/Main/Views/CallView.swift`

## Surface
`endedView(reason:)` — the terminal "call ended" panel of the in-call screen. It
shows the faded avatar, remote username, an end-reason line, the call duration, and —
only when `callManager.canRetryCall` — a one-tap **"Réessayer"** (re-dial) CTA.

## Defect (design-system consistency — single source of truth for color)
The retry CTA filled its `Capsule` with the raw system color **`Color.green`**:

```swift
.background(Capsule().fill(Color.green))   // line ~1480
```

Every other themed surface in this same view already routes through the design
system — the status pills use `MeeshyColors.info` (`CallView:876`, `:1553-1554`),
and the app's canonical positive/green is `MeeshyColors.success` (`#34D399`, the
same green backing the presence dot and every success state). `Color.green` is the
UIKit system green (`#34C759`), a *second, off-brand* green living one line away
from the brand green — exactly the kind of local hardcode the token layer exists to
eliminate. It is the **single** raw `Color.<system>` literal remaining in the file
(`grep -nE 'Color\.(blue|green|red|orange|purple|pink|yellow|indigo|teal|mint|cyan)'`
returns only this line).

The surrounding CTA is otherwise already disciplined: label localized via
`String(localized: "call.action.retry", …)`, `.accessibilityLabel` present,
`Label` + SF Symbol `arrow.clockwise`. The color literal was the lone outlier.

## Fix
Hue-consistent token swap — green → the brand's green token:

```swift
.background(Capsule().fill(MeeshyColors.success))
```

`MeeshyUI` is already imported (`CallView:5`); `MeeshyColors.success` is a public
`Color` static (`MeeshyUI/Theme/MeeshyColors.swift:43`). No new token, no new
import, no semantic change — the CTA stays green, now the *one* app-wide green.

## Scope
- **1 code file, 1 line changed** (`Color.green → MeeshyColors.success`).
- **0** logic / **0** network / **0** layout / **0** new i18n key / **0** new test.
- Green→green: no perceptible hue shift beyond the intentional brand alignment
  (`#34C759` → `#34D399`, the shade already used everywhere else in the app).

## Verification
- `MeeshyColors.success` is `Color`-typed and public → drop-in for the previous
  `Color.green` argument to `Capsule().fill(_:)`. No availability guard needed
  (the view is already `@available(iOS 16.0, *)`; the token is version-agnostic).
- No Xcode/Swift toolchain in this Linux environment → behavioral gate is CI
  `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run sim iOS 18.2), per prior
  iterations.
- Collision check: `CallView.swift` appears in **zero** of the 30+ open iOS PRs
  (verified via `list_pull_requests`); highest in-flight iteration is 206i (#2224).

## ⚠️ Do NOT re-flag
`CallView.endedView` retry CTA color: soldered to `MeeshyColors.success` in 208i.

## Next 209i+ path (verify swarm collision via `list_pull_requests` first)
- `OnboardingAnimations.swift` — remaining raw system-color usages, but these are
  decorative animated gradients; treat with care (may be intentional).
- Other views' positive/confirm CTAs still on `Color.green` / `.green` — sweep for
  parity with `MeeshyColors.success`.
