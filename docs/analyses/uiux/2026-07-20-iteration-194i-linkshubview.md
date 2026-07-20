# Iteration-194i — VoiceOver structure for `LinksHubView`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — links hub screen (share / tracking / community / affiliate cards)
**File touched:** `apps/ios/Meeshy/Features/Main/Views/LinksHubView.swift` (1 file, 0 logic, 0 new i18n key, 0 SDK change, 0 new test)

## Component

`LinksHubView` (229 → 255 l) is the hub screen (deep link `https://meeshy.me/links`,
title « Mes liens ») synthesising every kind of platform link. It renders:

1. A **promo header banner** (`headerBanner`) — icon + « Gérez vos liens » title
   + « Partagez, suivez et monétisez votre audience » subtitle.
2. Four **category cards** (`linkCard`) — Share / Tracking / Community / Affiliate.
   Each card is a navigation `Button` (`router.push(route)`) whose label nests:
   a decorative accent icon, the title + description texts, an **optional
   secondary `Button`** (`plus.circle.fill` → opens the matching create sheet),
   and a decorative `chevron.right`.

Every visible string was already localized via `String(localized:)`, and every
font already used the semantic Dynamic-Type ramp (`.title`, `.headline`,
`.footnote`, `.subheadline`, `.caption`, `.title3`, `.title2`) — **no i18n and no
Dynamic Type gap**. The entire deficit was VoiceOver structure: the screen had
only **2** accessibility modifiers total.

## Findings

1. **Nested secondary `Button` inside the card's navigation `Button`** (l.201-210,
   the 183i defect pattern). Each create button (`plus.circle.fill`) sits inside
   the outer card `Button`'s label. A `Button` nested in another `Button`'s label
   produces an **ambiguous interactive element** for VoiceOver: the card's
   auto-composed label absorbs the create button's label, and whether the inner
   control is independently focusable is version-dependent. A VoiceOver user
   could not reliably reach « Créer un lien de partage / tracking / affilié ».

2. **Decorative glyphs not hidden.** The accent category icon (l.179-181) and the
   `chevron.right` (l.212-214) were exposed to VoiceOver, adding noise ("image")
   to each card announcement. Only the header-banner icon was already hidden.

3. **Header banner read as two disconnected elements.** Title and subtitle were
   two separate VoiceOver stops with no grouping, fragmenting the banner message.

## Fix

Applied the canonical Apple secondary-action idiom established at 183i
(`CommunityLinksView`) — collapse the row/card to a single navigable element and
re-expose the secondary control through the **Actions rotor** — plus decorative
hiding:

- **Header banner** → `.accessibilityElement(children: .combine)` so title +
  subtitle read as one element (« Gérez vos liens, Partagez, suivez et
  monétisez votre audience »).
- **Card accent icon** + **chevron** → `.accessibilityHidden(true)` (decorative).
- **Nested create `Button`** → `.accessibilityHidden(true)` (its `.accessibilityLabel`
  removed as dead). Sighted tap is untouched (hiding affects only the a11y tree).
- **Card `Button`** → `.modifier(LinkCardCreateAction(label:onCreate:))`, a small
  fileprivate `ViewModifier` that adds `.accessibilityAction(named:) { onCreate() }`
  **only when the card has a create action**. The community card (no create) gets
  no extraneous action. The action reuses the already-localized `createLabel`
  passed to each card (`links.hub.*.create.a11y`) via `Text(verbatim:)` — **0 new
  key** and no risk of double-localization.

Result: each card is now one VoiceOver element announced « {title}, {description},
button » (default activation = navigate), with a rotor action « Créer un lien
de … » where applicable. The card's remaining Text descendants auto-compose into
the `Button` label once the decoratives + nested button are hidden, so no
`.accessibilityElement` was forced onto the `Button` itself (avoiding the
combine-on-Button activation hazard).

## Constraints honoured

- **0 visual change** — `.accessibilityHidden`, `.accessibilityElement(.combine)`
  on a static container, and `.accessibilityAction(named:)` are semantic-only; no
  layout, color, font, gesture, animation, or hit-testing change. Sighted
  tap-to-navigate and tap-to-create are byte-for-byte unchanged.
- **0 logic / 0 product behaviour** change.
- **0 new i18n key** — reuses the existing `createLabel` strings.
- **0 SDK change** — app-side view only.
- **1 file**, +26 lines net.

## Verification status

- Author runs in a Linux container → the macOS **`iOS Tests`** CI job is the build
  authority (compile + run). All APIs used (`.accessibilityHidden`,
  `.accessibilityElement(children:)`, `.accessibilityAction(named:)`, `ViewModifier`,
  `Text(verbatim:)`) are iOS 14/16+, below the app's iOS 16 floor — no availability
  guard needed.
- No test references `LinksHubView` (grep across `MeeshyTests` / `MeeshyUITests` /
  SDK tests = 0). Its only other references are navigation destinations in
  `RootView` / `iPadRootView+Panels`, unaffected by accessibility modifiers.

## Remaining improvements (deferred, one surface/iteration, verify contention first)

- `ThreadView` (279 l, 3 a11y mods, no headers / element grouping).
- `CommentMediaView` (217 l, 4 a11y mods, no header traits).
- `EditPostSheet` (357 l): one genuine `.system(size: 22)` Dynamic-Type gap at
  l.318 (l.300 `size: 18` is frozen by a doctrine comment) + zero header traits.
