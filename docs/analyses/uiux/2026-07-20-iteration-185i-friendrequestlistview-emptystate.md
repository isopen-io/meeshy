# Iteration 185i — `FriendRequestListView` empty state → design-system `EmptyStateView`

**Date**: 2026-07-20
**Track**: iOS (suffix `i`)
**Branch**: `claude/laughing-thompson-83jk3i`
**Scope**: 1 file — `apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift`
**Type**: design-system dedup + HIG/visual consistency (People hub empty states)

## Context

The `laughing-thompson` iOS swarm is very dense: open PRs cover 178i→184i
(`PeopleDiscoveryView` sub-tabs #2129/#2114/#2115, `CrashReportSheet`,
`VideoFullscreenPlayer`, `MessageReportDetailView`, `CategoryPickerView`,
`BlockedUsersView`, `DiscoverTab`, `StatusComposerView`, `ReplyCell`,
`CommunityLinksView`, `KeypadTab`, …). `list_pull_requests` verified: **no**
open PR touches `FriendRequestListView`. Number **185i** chosen strictly above
the highest in flight (184i).

## Problem identified

`FriendRequestListView.emptyState` was a **manual reimplementation** of the
design-system empty-state component:

```swift
VStack(spacing: 16) {
    Spacer()
    Image(systemName: "person.2.slash")
        .font(.system(size: 48, weight: .light))     // last fixed size in file
        .foregroundColor(theme.textMuted.opacity(0.4))
        .accessibilityHidden(true)
    Text(...title...).font(.headline)...
    Text(...subtitle...).font(.subheadline.weight(.medium))...
    Spacer()
}
.accessibilityElement(children: .combine)
```

This duplicates `EmptyStateView` (`MeeshyUI/Primitives/EmptyStateView.swift`),
the established SSOT for list empty states — **11 adoptions** across the app,
including the direct People-hub sibling `CallsTab` and `BlockedUsersView`
(the latter dedup'd in 179i #2111). The custom version:

- **diverged visually** from its siblings: muted-gray icon
  (`theme.textMuted.opacity(0.4)`) instead of the brand-tinted icon
  (`brandPrimary.opacity(0.4)`) that `CallsTab`/`BlockedUsersView` render — the
  three People-hub empty states did not read as one system;
- carried the **last `.system(size:)`** literal in the file;
- re-declared VoiceOver grouping that the component already provides.

## Fix

Replace the custom `VStack` with the design-system component, **reusing the
existing i18n keys** (`friends.requests.empty.title` / `.subtitle`) — exactly
the `CallsTab` call shape:

```swift
private var emptyState: some View {
    EmptyStateView(
        icon: "person.2.slash",
        title: String(localized: "friends.requests.empty.title", …),
        subtitle: String(localized: "friends.requests.empty.subtitle", …)
    )
}
```

### Why `EmptyStateView` (not `AdaptiveContentUnavailableView`)

Two design-system empty-state components exist. `AdaptiveContentUnavailableView`
(native `ContentUnavailableView`, HIG-system look) was the right call for
`StarredMessagesView` (175i) which sat among system-styled surfaces.
`FriendRequestListView` lives in the **People hub** next to `CallsTab` and
`BlockedUsersView`, which both use the Meeshy-branded `EmptyStateView` (accent
icon @0.4, spring appear). Matching them keeps the hub coherent — the closer
visual match *and* the sibling precedent both point to `EmptyStateView`.

## Outcome

- **Design-system dedup**: −22 lines of reimplementation; one SSOT.
- **Visual consistency**: People-hub empty states (`CallsTab`,
  `BlockedUsersView`, friend requests) now render identically (brand-tinted
  icon, same typography, same spring-in).
- **Accessibility preserved**: `EmptyStateView` already groups children
  (`.accessibilityElement(children: .combine)`) and exposes a composed label
  (`"\(title). \(subtitle)"`) — VoiceOver behaviour is equivalent or better.
- **Dynamic Type**: component uses relative sizing; the file's last
  `.system(size:)` literal is removed.
- **0 new i18n keys** (existing keys reused), **0 logic / network / test
  change**, **1 file**.

## Verification status

- Static review: `MeeshyUI` already imported; `theme` still referenced (10×);
  no other reference to the removed `emptyState` internals.
- Build/tests gate: CI **iOS Tests** (Linux dev environment cannot run
  `xcodebuild`; CI regenerates the project via XcodeGen and builds on
  Xcode 26.1.1 / runs on iOS 18.2, per `apps/ios/CLAUDE.md`).

## Completion

✅ Resolved. **Do not re-flag** `FriendRequestListView`'s empty state — now on
the design-system SSOT, brand-consistent with its People-hub siblings, VoiceOver
grouped, Dynamic Type relative.

### Remaining opportunities (deferred, 1/iteration, verify swarm collision first)

- `ContactFilter` / `RequestFilter` raw values (`ContactsShared.swift`) — FR
  display literals used as chip labels (**i18n** candidate; hold until the
  `PeopleDiscoveryView`/`DiscoveryTab` PRs #2129/#2114/#2115 land to avoid
  file collision).
- Other custom empty-state `VStack`s reimplementing `EmptyStateView` /
  `AdaptiveContentUnavailableView` across large surfaces.
