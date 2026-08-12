# Iteration 208i — `RequestsTab` empty-state design-system consolidation

**Date**: 2026-07-21
**Track**: iOS UI/UX (suffix `i`)
**Scope**: 1 file — `apps/ios/Meeshy/Features/Contacts/RequestsTab.swift`
**Base**: `main` HEAD `22465a5`
**Numbering**: `207i` is already claimed (merged `CallJournalRow`/`CallsTab.swift` — see
tracking pointer) → this iteration is **208i**, strictly greater than the highest taken.
`RequestsTab.swift` is an unrelated file → no collision with 207i.

## Context

`RequestsTab` is the Contacts-hub friend-requests tab (segmented **Reçues / Envoyées**,
each listing pending `FriendRequest` rows). Its empty state was a **bespoke `VStack`**
(`emptyState(icon:text:)`, lines 282–295) re-implementing the shared
`AdaptiveContentUnavailableView` primitive:

```swift
private func emptyState(icon: String, text: String) -> some View {
    VStack(spacing: 16) {
        Spacer()
        Image(systemName: icon)
            .font(.system(.largeTitle).weight(.light))
            .foregroundColor(theme.textMuted.opacity(0.4))
            .accessibilityHidden(true)
        Text(text)                       // title only — no guidance subtitle
            .font(.callout.weight(.semibold))
            .foregroundColor(theme.textMuted)
        Spacer()
    }
    .frame(maxWidth: .infinity)
}
```

This is the exact class of duplication solved in **175i** (`FriendRequestListView` — the
direct twin, another friend-requests empty state) and **183i** (`ProfileUserPostsList`),
both of which now delegate to `AdaptiveContentUnavailableView`
(`packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveContentUnavailableView.swift`).
The primitive renders the **native `ContentUnavailableView` on iOS 17+** (so current-OS
users get the first-party empty state) and a faithful reproduction on the iOS 16 floor.

## Deficits

1. **Duplication** of a shared primitive — the Contacts hub has a friend-requests empty
   state that diverges from the `FriendRequestListView` twin (175i) and the 7 other
   `AdaptiveContentUnavailableView` call sites (FeedView, ActiveSessionsView,
   StarredMessagesView, CreateShareLinkView, AddParticipantSheet ×2).
2. **Title-only empty state** — no guidance subtitle telling the user how requests appear
   here, unlike every sibling migrated in the 175i/183i track.
3. **No native `ContentUnavailableView`** on iOS 17+ — the hand-rolled VStack never adopts
   the first-party layout Apple ships.

## Fix (design-system + a11y + i18n, 0 logic)

Replace the bespoke helper with the shared primitive and thread a guidance subtitle:

```swift
private func emptyState(icon: String, title: String, subtitle: String) -> some View {
    AdaptiveContentUnavailableView(title, systemImage: icon, description: Text(subtitle))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
}
```

Both call sites (`.received` / `.sent`) pass the existing title key plus **two new inline
subtitle keys** (`contacts.requests.empty.received.subtitle` /
`.sent.subtitle`) with French `defaultValue`, extracted at build like every other inline
`String(localized:defaultValue:bundle:)` in the file — **matching the twin
`FriendRequestListView` (175i) which likewise added its `.subtitle` inline with no
`.xcstrings` edit** (grep confirms none of the `contacts.requests.empty.*` nor
`friends.requests.empty.*` keys are materialised in the catalog — all build-extracted).

Inherited for free from the primitive: VoiceOver grouping of icon + title + subtitle as
one element (`.accessibilityElement(children: .combine)` on the iOS 16 path;
`ContentUnavailableView`'s native grouping on 17+), and Dynamic-Type-scaling hero glyph.

## Scope / verification

- **1 file**, +24 / −15. 0 logic / 0 network / 0 new test / 0 `.xcstrings` edit / 0 SDK.
- **2 new inline i18n keys** (`.received.subtitle`, `.sent.subtitle`), French source,
  build-extracted (same mechanism as all sibling keys).
- `import MeeshyUI` already present (line 4) → primitive in scope, no new import.
- `theme` remains referenced (10× in rows) → no unused-property warning; `isDark` was
  already declared-only before this change (untouched).
- No open PR touches `RequestsTab.swift` (contention map of all 10 open iOS PRs:
  MessageReactionsDetailView, ConversationMediaViews, ThreadView, MessageDetailSheet ×4,
  ConversationInfoSheet, DataStorageView — none overlap).
- iOS build not runnable in this Linux container (no Xcode/Swift toolchain) →
  **gate = CI `iOS Tests`** (compile Xcode 26.1.1 / Swift 6.2, run sim iOS 18.2).

## Follow-ups (208i+)

Remaining bespoke empty-states not yet on the primitive — candidates for the same
consolidation (verify swarm contention first): grep `Image(systemName:` + adjacent
title-only `Text` inside an `if …isEmpty` VStack across `Features/`.
