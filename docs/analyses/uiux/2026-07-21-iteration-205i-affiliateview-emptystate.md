# Iteration-205i — AffiliateView empty state → shared `EmptyStateView`

**Date:** 2026-07-21
**Scope:** iOS only (`apps/ios/Meeshy/Features/Main/Views/AffiliateView.swift`)
**Base:** `origin/main` HEAD `22465a5` (branch `claude/laughing-thompson-h91l73` reset to latest main; prior 204i work already merged).

## Context

Continuation of the "custom empty-state `VStack`s reimplementing `EmptyStateView`"
cleanup track opened by 178i (`ShareLinksView`), 184i (`TrackingLinksView`) and
204i (`VoiceProfileManageView`). `AffiliateView.emptyTokensState` was the last
`*.empty.*`-keyed screen in `Features/Main/Views` still hand-rolling the pattern
(the other two remaining hits — `RequestsTab`, `CommunityLinksView` — are
in-flight/recently-touched by the swarm and deliberately skipped).

## Problem

`emptyTokensState` was a bespoke `VStack(spacing: 12)`:

```swift
Image(systemName: "link")
    .font(.system(size: 36))                     // fixed hero glyph, no Dynamic Type
    .foregroundColor(Color(hex: accentColor).opacity(0.4))
    .accessibilityHidden(true)
Text("affiliate.empty.title")  .font(MeeshyFont.relative(14, weight: .semibold))
Text("affiliate.empty.subtitle").font(MeeshyFont.relative(12))
```

This duplicated the shared `EmptyStateView` primitive
(`MeeshyUI/Primitives/EmptyStateView.swift`) already adopted by 15+ sites,
including the direct sibling `ShareLinksView`. Downsides of the bespoke copy:

- **Fixed `.system(size: 36)` hero** — does not scale with Dynamic Type.
- Two separate `Text` elements → **two VoiceOver swipes** instead of one
  combined statement.
- No appear animation; layout/spacing drift risk vs. the canonical component.

## Change

Replaced the inner `VStack` with the **compact** `EmptyStateView` variant, which
is a near-exact match of the previous visuals:

| Element | Before | `EmptyStateView(compact: true)` |
|---|---|---|
| Hero glyph | `.system(size: 36)`, opacity 0.4 | `MeeshyFont.relative(36, weight: .light)`, opacity 0.4 (Dynamic Type) |
| Title | `relative(14, .semibold)`, `textPrimary` | `relative(15, .bold)`, `textPrimary` |
| Subtitle | `relative(12)`, `textMuted` | `relative(12)`, `textMuted` |
| VoiceOver | icon hidden + 2 text swipes | title+subtitle combined into one element |
| Animation | none | spring appear |

- **Reuses the 2 existing i18n keys** (`affiliate.empty.title` /
  `affiliate.empty.subtitle`) → **0 new localization strings**.
- **Section card chrome preserved** (`surfaceGradient(tint:)` + `border(tint:)`
  `RoundedRectangle(16)`) so the empty and populated states stay visually
  identical — the primitive replaces only the inner content, not the card.
- Passes the view's `accentColor` (`MeeshyColors.brandPrimaryHex`) so the hero
  tint is unchanged.
- Added `import MeeshyUI` (aligned with `ShareLinksView`).

`header` / `statsOverview` / `tokensSection` populated branch / `tokenRow` /
ViewModel / navigation **unchanged**.

## Impact

- 1 file, **15 insertions / 18 deletions** (net −3 lines).
- 0 logic / 0 network / 0 new i18n key / 0 new test.
- Gains: Dynamic Type hero scaling, single combined VoiceOver element, spring
  appear animation, one fewer bespoke empty-state copy to maintain.

## Verification

- By inspection: `accentColor` is a `String` (`MeeshyColors.brandPrimaryHex`) →
  matches `EmptyStateView(accentColor: String)`; both `.empty.*` keys retained;
  card `.background` chain intact; brace balance preserved (see diff).
- iOS build/tests run in CI (`iOS Tests`) — no simulator in this environment.

## ⚠️ Do NOT re-flag

`AffiliateView.emptyTokensState`: native `EmptyStateView` adoption soldered 205i
(supersedes the local "doctrine 74i/86i/89i fixed hero" note, same rationale as
184i `TrackingLinksView` / 204i `VoiceProfileManageView`).

## Next 206i+ path

Remaining bespoke empty/error `VStack`s reimplementing
`EmptyStateView`/`ContentUnavailableView` (check swarm collision via
`list_pull_requests` first); `AffiliateView.affiliateStatCard` card-primitive
dedup review vs. the shared stat-card pattern.
