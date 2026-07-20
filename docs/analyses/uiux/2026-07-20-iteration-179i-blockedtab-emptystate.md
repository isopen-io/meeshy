# Iteration-179i — `BlockedTab` empty state → shared `EmptyStateView`

**Date**: 2026-07-20
**Track**: iOS (suffix `i`)
**Scope**: `apps/ios/Meeshy/Features/Contacts/BlockedTab.swift` (1 file)
**Branch**: `claude/laughing-thompson-n2i97z`
**Base**: `main` HEAD `f4ac661`

## Context

`BlockedTab` is the "Bloqués" tab of the Contacts hub (`PeopleDiscoveryView`),
listing users the current account has blocked with an inline "Débloquer"
action. Its empty state was a **bespoke** `VStack` — a hand-rolled
reimplementation of a UI pattern that already exists as a shared, public SDK
primitive: `MeeshyUI.EmptyStateView`
(`packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmptyStateView.swift`).

`EmptyStateView` is the canonical empty-state component, already consumed in
**11 sites** across the app (`BookmarksView` — migrated 168i —, `BlockedUsersView`,
`MyStoriesView`, `ConversationListHelpers`, `SharePickerView`, `GlobalSearchView`,
`ParticipantsView`, `WidgetPreviewView`, `CallsTab`, `ConversationListView`,
`StoryViewerView+Content`). Notably its **sibling in the same folder**,
`CallsTab` (also hosted by `PeopleDiscoveryView`), already uses
`EmptyStateView(icon:title:subtitle:)`. `BlockedTab` was the odd one out — two
peer tabs of the same hub rendered their empty state differently.

## Gaps identified in the bespoke empty state

| # | Gap | Category |
|---|-----|----------|
| 1 | **Component duplication** — a private `VStack` re-implements icon+title that `EmptyStateView` already provides, diverging from the sibling `CallsTab` in the same directory. | Design-system / reuse |
| 2 | **Fragmented VoiceOver** — the hero glyph was `.accessibilityHidden(true)` and only the title `Text` was a focus stop, with no `.accessibilityElement(children: .combine)` grouping (and no subtitle to combine). | Accessibility |
| 3 | **Muted-grey hero glyph** (`theme.textMuted.opacity(0.4)`) vs. the brand treatment used everywhere else (indigo-tinted hero, `.light` weight, entrance spring animation). | Visual consistency |
| 4 | **Title-only empty state** — no explanatory subtitle telling the user what will appear here, unlike every other empty state in the app (all provide a title + guidance subtitle). | UX / cognitive load |

## Fix

Replace the bespoke `VStack` with the shared `EmptyStateView`, reusing the
existing `contacts.blocked.empty` title key and adding one guidance subtitle
key (mirroring the `CallsTab` `calls.empty.title`/`calls.empty.subtitle` pair):

```swift
private var emptyState: some View {
    EmptyStateView(
        icon: "hand.raised.slash",
        title: String(localized: "contacts.blocked.empty", defaultValue: "Aucun utilisateur bloque", bundle: .main),
        subtitle: String(localized: "contacts.blocked.empty-subtitle", defaultValue: "Les personnes que vous bloquez apparaitront ici.", bundle: .main)
    )
}
```

`import MeeshyUI` was already present (the file uses `MeeshyAvatar`,
`DynamicColorGenerator`, `MeeshyColors`).

Inherited for free from the shared component:
- `.accessibilityElement(children: .combine)` + `.accessibilityLabel("\(title). \(subtitle)")` → single VoiceOver focus reading the full guidance (gap 2).
- Brand-indigo hero glyph, `.light` weight, entrance spring (gap 3).
- Calibrated title + subtitle typography + guidance copy (gaps 1 & 4).

## Scope discipline

- **1 file**, 0 logic, 0 ViewModel change, 0 test touched.
- **1 new i18n key** (`contacts.blocked.empty-subtitle`) declared inline via
  `String(localized:defaultValue:bundle:)` — no `.xcstrings` edit (same idiom
  as `CallsTab`, `UploadProgressBar` 167i). Existing `contacts.blocked.empty`
  reused verbatim.
- `theme` retained (still used by `blockedRow`); the now-unused `isDark`
  computed property was already dead before this change (a computed property
  emits no unused-value warning) and is left untouched to keep the diff
  focused.
- No test references `BlockedTab` (grep: no matches under `MeeshyTests/`).
- Single call site (`PeopleDiscoveryView.swift:139`) unchanged.
- No open iOS PR touches `BlockedTab` → 0 contention. (`BlockedUsersView` is a
  distinct file, already an `EmptyStateView` consumer.)

## Verification

- Static review: `EmptyStateView` is `public` in `MeeshyUI`, requires no
  `@EnvironmentObject` (uses `ThemeManager.shared` + `@Environment(\.colorScheme)`
  internally). Signature `(icon:title:subtitle:)` matches the 3 args passed.
- Build gate = CI `iOS Tests` (Linux dev host has no Xcode).

## Status: RESOLVED

`BlockedTab` empty state now delegates to the shared primitive, matching its
sibling `CallsTab`. **Do not re-hand-roll** — any future empty-state tweak
belongs in the shared `EmptyStateView`, benefiting all 12 consumers at once.
