# Iteration-187i — `FriendRequestListView` empty state → shared `EmptyStateView`

**Date**: 2026-07-20
**Track**: iOS (suffix `i`)
**Scope**: `apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift` (1 file)
**Branch**: `claude/laughing-thompson-n2i97z`
**Base**: `main` HEAD `995ed53`

## Context

`FriendRequestListView` lists incoming/outgoing friend requests. Its empty
state was a **bespoke** `VStack` re-implementing the shared `MeeshyUI.EmptyStateView`
primitive by hand — the same pattern retired for `BookmarksView` (168i) and
`BlockedTab` (179i).

This iteration follows directly from **181i**, which fixed `EmptyStateView`'s
fonts to scale with Dynamic Type (`MeeshyFont.relative`). Before 181i, migrating
this view carried a latent Dynamic Type footnote (its icon used fixed
`.system(size: 48)`, but its title/subtitle used semantic `.headline`/
`.subheadline` that scale). **Post-181i the migration is strictly non-regressive**:
the shared component now scales its icon too.

## Gaps identified in the bespoke empty state

| # | Gap | Category |
|---|-----|----------|
| 1 | **Component duplication** — a private `VStack` re-implements icon+title+subtitle that `EmptyStateView` already provides. | Design-system / reuse |
| 2 | **Fixed `.system(size: 48)` hero icon** — did not scale with Dynamic Type (title/subtitle already semantic). | Accessibility / Dynamic Type |
| 3 | **Muted-grey hero glyph** (`theme.textMuted.opacity(0.4)`) vs. the brand-indigo hero + entrance spring used by every other empty state. | Visual consistency |

## Fix

Replace the bespoke `VStack` with the shared `EmptyStateView`, reusing **both**
existing localization keys verbatim:

```swift
private var emptyState: some View {
    EmptyStateView(
        icon: "person.2.slash",
        title: String(localized: "friends.requests.empty.title", defaultValue: "Aucune demande", bundle: .main),
        subtitle: String(localized: "friends.requests.empty.subtitle", defaultValue: "Les demandes d'amis apparaitront ici", bundle: .main)
    )
}
```

`import MeeshyUI` was already present. Inherited for free:
- Dynamic-Type-scaling icon/title/subtitle (gaps 1 & 2, via 181i).
- `.accessibilityElement(children: .combine)` + `.accessibilityLabel("\(title). \(subtitle)")` → single clean VoiceOver focus.
- Brand-indigo hero glyph + entrance spring (gap 3).

## Scope discipline

- **1 file**, 0 logic, 0 ViewModel change, **0 new i18n key** (both keys reused
  verbatim → no `.xcstrings` edit), 0 test touched.
- `theme` retained (13 other usages in the file).
- No test references `FriendRequestListView` (grep over `MeeshyTests/` = 0).
- 2 call sites unchanged (no signature change).
- Outside the fleet's current hot zones (Story/Timeline, TrackingLinks,
  DataStorageView) → low contention.

## Verification

- Static review: `EmptyStateView` is `public` in `MeeshyUI`; `(icon:title:subtitle:)`
  matches the three args. Build gate = CI `iOS Tests` (Linux dev host has no Xcode).

## Status: RESOLVED

`FriendRequestListView` empty state now delegates to the shared primitive
(13th consumer). **Do not re-hand-roll** — future empty-state tweaks go through
`MeeshyUI.EmptyStateView`.
