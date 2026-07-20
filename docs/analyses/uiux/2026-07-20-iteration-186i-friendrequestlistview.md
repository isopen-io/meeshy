# Iteration-186i — Design-system dedup: FriendRequestListView empty state → AdaptiveContentUnavailableView

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Design system consolidation + HIG (native empty state) + Dynamic Type
**File touched:** `apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift` (1 file, 0 logic, 0 test, 0 catalog edit, 0 new i18n key)

## Component

`FriendRequestListView` is the received-friend-requests screen (custom header +
list of `friendRequestRow`s with Accept/Decline actions). When the viewer has no
pending requests, `content` shows the `emptyState`.

## Finding

The `emptyState` was a **hand-rolled `VStack`** that reimplements the shared
design-system component `AdaptiveContentUnavailableView`:

```swift
private var emptyState: some View {
    VStack(spacing: 16) {
        Spacer()
        Image(systemName: "person.2.slash")
            .font(.system(size: 48, weight: .light))   // ← fixed 48pt, does NOT scale
            .foregroundColor(theme.textMuted.opacity(0.4))
            .accessibilityHidden(true)
        Text(String(localized: "friends.requests.empty.title", …))
            .font(.headline)
        Text(String(localized: "friends.requests.empty.subtitle", …))
            .font(.subheadline.weight(.medium))
        Spacer()
    }
    .accessibilityElement(children: .combine)
}
```

The repo already ships `AdaptiveContentUnavailableView(_ title:, systemImage:,
description:)`
(`packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveContentUnavailableView.swift`)
— it renders the **real iOS 17+ `ContentUnavailableView`** and a faithful iOS 16
fallback. It is already adopted by `StarredMessagesView` (175i),
`AddParticipantSheet` (176i), `FeedView`, and `CreateShareLinkView`. This screen
duplicated that pattern by hand, which maps **1:1** to the component
(`title` = `friends.requests.empty.title`, `systemImage: "person.2.slash"`,
`description:` = `friends.requests.empty.subtitle`).

Concrete user-visible cost of the hand-rolled version:

- **Dynamic Type:** the hero glyph was pinned at `.system(size: 48)` — it does
  **not** grow at large accessibility text sizes, so the icon looks
  disproportionately small next to enlarged title/subtitle. The native
  `ContentUnavailableView` scales its symbol with the content size category.
- **HIG:** an empty state should use the system's native empty-state
  presentation (consistent metrics, centering, spacing) rather than a bespoke
  layout that drifts from every other Apple screen.
- **Maintainability / duplication:** one more copy of the same VStack to keep in
  sync (spacing, muted-color opacities, font choices) instead of a single shared
  component.

## Fix

Replaced the `VStack` with a direct `AdaptiveContentUnavailableView` call,
**reusing the two existing i18n keys** (`friends.requests.empty.title` /
`friends.requests.empty.subtitle`) — mirrors 175i/176i verbatim:

```swift
private var emptyState: some View {
    AdaptiveContentUnavailableView(
        String(localized: "friends.requests.empty.title", defaultValue: "Aucune demande", bundle: .main),
        systemImage: "person.2.slash",
        description: Text(String(localized: "friends.requests.empty.subtitle", defaultValue: "Les demandes d'amis apparaitront ici", bundle: .main))
    )
}
```

Net: **−21 / +12 lines**, the fixed `.system(size: 48)` glyph removed, VoiceOver
title+description grouping now provided natively by the component.

## Rationale

This is a pure design-system consolidation: the same visual intent (icon +
title + subtitle empty state) now flows through the one shared component every
other Meeshy empty state uses, gaining native Dynamic Type, HIG-correct metrics,
and native VoiceOver grouping for free — with **zero new strings** and no change
to the header, list rows, Accept/Decline flow, or view model.

## Verification

- **Static review:** `AdaptiveContentUnavailableView` is already imported via
  `import MeeshyUI` (line 4). The component's public initializer signature
  (`_ title: String, systemImage: String, description: Text? = nil`) matches the
  call exactly.
- **Centering preserved:** the loading branch of `content` centers with
  `Spacer()`s; `ContentUnavailableView` self-centers (`maxWidth/maxHeight:
  .infinity`) inside the remaining space under the header, so the empty state
  stays vertically centered — same as the merged `StarredMessagesView` (175i),
  which also drops the wrapping `VStack`/`Spacer`s.
- **No new i18n:** both keys already existed and are reused; 0 `.xcstrings`
  edits.
- **No logic / no test churn:** only the `emptyState` view body changed; the
  view model, request rows, and actions are untouched. No test references
  `FriendRequestListView` (grep confirmed — only `RootView` and
  `iPadRootView+Panels` reference it, both as a navigation destination).
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `CreateTrackingLinkView.utmSection` — the UTM disclosure `Button` conveys
  expand/collapse by the chevron glyph only (no expanded-state announced to
  VoiceOver); its `createButton` shows a bare `ProgressView()` while creating
  with no accessibility label. Candidate for a native `DisclosureGroup` +
  in-progress label (mirror 180i `CrashReportSheet`).
- `PostTranslationSheet.originalSection` — the active/original language row is
  marked by a green `checkmark.circle.fill` + color only, with no
  `.accessibilityAddTraits(.isSelected)` (WCAG 1.4.1).

**Status: RESOLVED for `FriendRequestListView` empty-state design-system dedup /
Dynamic Type.**
