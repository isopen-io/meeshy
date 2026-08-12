# Iteration-195i — i18n + design-system tokens + VoiceOver for Siri snippet views

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Localization (i18n) + Design System (semantic color tokens) + Accessibility (VoiceOver grouping) — Siri / Shortcuts result-snippet views
**File touched:** `apps/ios/Meeshy/Features/Intents/MeeshyAppIntents.swift` (1 file, 0 logic, 0 network, 6 inline localized keys via `defaultValue`, 0 SDK change, 0 new test)

## Component

`MeeshyAppIntents.swift` hosts the App Intents (Siri / Shortcuts) surface,
compiled directly into the app target (no separate extension — the app's
`AppIntent`s are exposed to Siri/Shortcuts automatically, per
`apps/ios/CLAUDE.md` § App Extensions). Two small self-contained SwiftUI
snippet views render inside the Siri/Shortcuts result card **and** in-app:

- **`NotificationCheckView`** — the "Check notifications" result: a bell + unread
  count header, followed by recent-message previews.
- **`SiriTipsView`** — an in-app discovery card listing four example Siri
  phrases ("Send message to John…", "Call Sarah…", "Translate this to
  Spanish…", "Check notifications…"), each with an icon + tinted accent.

## Findings

Unlike the rest of the app — which is disciplined about `String(localized:)`,
`MeeshyColors` semantic tokens, and VoiceOver grouping — these two snippet
views were the one clear outlier, carrying three defects:

1. **Hardcoded, user-facing English strings (i18n).** The `AppShortcut`
   invocation *phrases* higher in the file (lines 14–64) are correctly
   framework-localized (`LocalizedStringResource` / string-catalog extraction),
   which made the snippet-view literals stand out as the genuine gap:
   - `NotificationCheckView`: `Text("\(unreadCount) Unread")` — a raw
     interpolated literal.
   - `SiriTipsView`: the header `Text("Try asking Siri:")` **and** the four
     `SiriTip.phrase` values were plain `String`s rendered via
     `Text("\"\(tip.phrase)\"")`. Because `phrase` is a `String` (not
     `LocalizedStringKey`), the interpolation bypassed localization entirely —
     genuinely hardcoded English for every locale.

2. **Hardcoded system colors instead of design-system tokens.** Both views used
   raw SwiftUI system colors (`.blue`, `.green`, `.purple`, `.orange`) for the
   bell and the four tip accents, in violation of `apps/ios/CLAUDE.md`
   ("New code MUST use the Indigo scale or semantic names"). The rest of the
   app resolves these through `MeeshyColors` (e.g. `ContactsListTab:176`
   `MeeshyColors.success`, `BlockedTab:97` `MeeshyColors.warning`).

3. **No VoiceOver grouping.** The unread header (icon + count) and each tip row
   (decorative icon + phrase) exposed their icon and text as separate VoiceOver
   elements, with the SF Symbol read as a standalone (and meaningless) element.

## Fix

Purely a consolidation onto existing single-sources-of-truth — **0 logic, 0
network, 0 layout, 0 visual-hue change**:

- **i18n:** `import MeeshyUI` added; the five literals became
  `String(localized: "<key>", defaultValue: "<English source>", bundle: .main)`
  (static key + interpolated `defaultValue`, mirroring the app-wide pattern at
  `EmailVerificationView:86` / `ReportUserView:38`). New keys:
  `siri.notifications.unreadCount`, `siri.tips.header`, `siri.tip.sendMessage`,
  `siri.tip.call`, `siri.tip.translate`, `siri.tip.checkNotifications`. No
  hand-edit of `Localizable.xcstrings` — Xcode extracts `String(localized:)`
  calls into the catalog at build time; `defaultValue` is the runtime fallback.
- **Design system (hue-preserving token swap):** `.blue → MeeshyColors.info`
  (both `#60A5FA`), `.green → MeeshyColors.success` (`#34D399`),
  `.purple → MeeshyColors.purple600` (`#8B5CF6`, an in-palette brand accent),
  `.orange → MeeshyColors.warning` (`#FBBF24`). The four tips keep four distinct
  hues (visual differentiation intact) while every value now resolves through
  the palette — no off-brand literal remains.
- **Accessibility:** `.accessibilityElement(children: .combine)` on the unread
  header and on each tip row; `.accessibilityHidden(true)` on the decorative tip
  SF Symbol so VoiceOver reads a single, meaningful element per row.

`SiriTip`/`NotificationCheckView` shape, layout, spacing, corner radii, and the
`AppShortcut` phrases are all unchanged. The file is absent from every open PR
(verified via `list_pull_requests`, ~40 open PRs) → 0 swarm collision.

## Verification status

- **Static review:** all four `MeeshyColors` tokens (`info`, `success`,
  `warning`, `purple600`) are `Color`-typed statics on the `nonisolated
  MeeshyColors` struct in `MeeshyUI` (verified `MeeshyColors.swift:21,43,45,46`);
  `import MeeshyUI` is the established app-view pattern (`ContactsHubView`,
  `DiscoverTab`, …). `String(localized:defaultValue:bundle:)` is iOS 15+, safely
  within the views' `@available(iOS 16.0, *)` gate.
- **Build/tests:** no local Xcode (Linux runner) — gate is CI `iOS Tests`
  (Xcode 26.1.1 / Swift 6.2 compile + iOS 18.2 sim run), consistent with prior
  iterations.

## Remaining improvements (future iterations)

- `OnboardingStepViews.conversationExampleCard` sample bubble strings
  ("Jean-Pierre", "Hello! How are you doing today?") — semi-intentional demo
  source content; localize the name with care (see scout Finding 2).
- `AboutView` raw hex accents (`45B7D1`, `F8B500`, `1C1917`) — a screen-wide
  accent change (visible), so warrants its own dedicated iteration (Finding 3).
