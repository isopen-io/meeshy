# Iteration-168i — `BookmarksView` empty state → shared `EmptyStateView`

**Date**: 2026-07-20
**Track**: iOS (suffix `i`)
**Scope**: `apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift` (1 file)
**Branch**: `claude/laughing-thompson-sfei6s`
**Base**: `main` HEAD `a00389a`

## Context

`BookmarksView` is the "Favoris" screen (bookmarked feed posts). Its empty
state was a **bespoke** `VStack` — a hand-rolled reimplementation of a UI
pattern that already exists as a shared, public SDK primitive:
`MeeshyUI.EmptyStateView` (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmptyStateView.swift`).

`EmptyStateView` is the canonical empty-state component, already consumed in
**10 sites** across the app (`BlockedUsersView`, `MyStoriesView`,
`ConversationListHelpers`, `SharePickerView`, `GlobalSearchView`,
`ParticipantsView`, `WidgetPreviewView`, `CallsTab`, `ConversationListView`,
`StoryViewerView+Content`). `BookmarksView` was the odd one out.

## Gaps identified in the bespoke empty state

| # | Gap | Category |
|---|-----|----------|
| 1 | **Component duplication** — a private `VStack` re-implements icon+title+subtitle that `EmptyStateView` already provides. | Design-system / reuse |
| 2 | **Fragmented VoiceOver** — the two `Text` views (title, subtitle) were separate focus stops; no `.accessibilityElement(children: .combine)` grouping. | Accessibility |
| 3 | **Hardcoded `.font(.system(size: 48))`** on the hero icon (local fixed size vs. the shared component's calibrated treatment). | Design-system consistency |
| 4 | **Visual divergence** — muted-grey icon + `.body`/`.subheadline` text vs. the brand treatment used everywhere else (indigo-tinted hero glyph, entrance spring animation, calibrated typography). | Visual consistency |

Typography of the title/subtitle was already **semantic** (`.body`,
`.subheadline`) → Dynamic Type was not broken; the deficits were reuse +
VoiceOver-structure + brand consistency, not scaling.

## Fix

Replace the bespoke `VStack` with the shared `EmptyStateView`, preserving the
two existing localization keys and the screen's top-anchored layout
(`.padding(.top, 80)`):

```swift
private var emptyState: some View {
    EmptyStateView(
        icon: "bookmark",
        title: String(localized: "bookmarks.empty.title", defaultValue: "Aucun favori", bundle: .main),
        subtitle: String(localized: "bookmarks.empty.subtitle", defaultValue: "Les posts que vous sauvegardez apparaitront ici", bundle: .main)
    )
    .padding(.top, 80)
}
```

Added `import MeeshyUI` (as `BlockedUsersView` and the 9 other consumers do).

Inherited for free from the shared component:
- `.accessibilityElement(children: .combine)` + `.accessibilityLabel("\(title). \(subtitle)")` → single VoiceOver focus (gap 2).
- Brand-indigo hero glyph, `.light` weight, entrance spring (gaps 3 & 4).
- No local fixed font remains in `BookmarksView` (gap 3).

## Scope discipline

- **1 file**, 0 logic, 0 ViewModel change, 0 new i18n key (both keys reused
  verbatim), 0 test touched.
- Localization keys `bookmarks.empty.title` / `bookmarks.empty.subtitle`
  unchanged → no `.xcstrings` edit.
- `@EnvironmentObject theme` retained (still used by `backgroundGradient`).
- No test references `BookmarksView`'s empty state (grep: tests cover only
  `BookmarksViewModel`).
- No open iOS PR touches `BookmarksView` → 0 contention.

## Verification

- Static review: `EmptyStateView` is `public` in `MeeshyUI`, requires no
  `@EnvironmentObject` (uses `ThemeManager.shared` + `@Environment(\.colorScheme)`
  internally). Signature `(icon:title:subtitle:)` matches the 3 args passed.
- Build gate = CI `iOS Tests` (Linux dev host has no Xcode).

## Status: RESOLVED

`BookmarksView` empty state now delegates to the shared primitive. **Do not
re-hand-roll** — any future empty-state tweak belongs in the shared
`EmptyStateView`, benefiting all 11 consumers at once.
