# Iteration-178i — `StarredMessagesView` empty state → shared `EmptyStateView`

**Date**: 2026-07-20
**Track**: iOS (suffix `i`)
**Scope**: `apps/ios/Meeshy/Features/Main/Views/StarredMessagesView.swift` (1 file)
**Branch**: `claude/laughing-thompson-ajrx2g`
**Base**: `main` HEAD `90d9646`

## Context

`StarredMessagesView` is the "Messages favoris" screen (WhatsApp-style list of
starred messages across every conversation). Its empty state was a **bespoke**
`VStack` — a hand-rolled reimplementation of the canonical shared primitive
`MeeshyUI.EmptyStateView`
(`packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmptyStateView.swift`).

This is the exact pattern consolidated in iteration-168i for `BookmarksView`.
After that iteration `EmptyStateView` had **11 consumers**; `StarredMessagesView`
was the remaining odd one out among the "personal collection" screens
(Favoris / Messages favoris are sibling features and should read identically).

## Gaps identified in the bespoke empty state

| # | Gap | Category |
|---|-----|----------|
| 1 | **Component duplication** — a private `VStack` re-implements icon+title+subtitle that `EmptyStateView` already provides. | Design-system / reuse |
| 2 | **Fragmented VoiceOver** — the two `Text` views (title, subtitle) were separate focus stops; no `.accessibilityElement(children: .combine)` grouping. The icon was `.accessibilityHidden(true)` but the two texts were not merged. | Accessibility |
| 3 | **No entrance animation** — the bespoke state appeared statically, unlike the calibrated spring entrance every other empty state uses. | Visual consistency |
| 4 | **Visual divergence** — solid `indigo400` `.regular`-weight hero glyph vs. the brand treatment used everywhere else (brand-primary-tinted `.light` hero glyph). Font sizes (17/13) also diverged from the shared 18/14 scale. | Visual consistency |

Typography was already **Dynamic-Type-ready** (`MeeshyFont.relative(...)`),
so scaling was not broken; the deficits were reuse + VoiceOver-structure +
brand consistency, matching the 168i finding profile.

## Fix

Replace the bespoke `VStack` with the shared `EmptyStateView`, preserving the
two existing localization keys verbatim:

```swift
private var emptyState: some View {
    EmptyStateView(
        icon: "star.circle",
        title: String(localized: "starred.messages.empty.title", defaultValue: "Aucun message favori", bundle: .main),
        subtitle: String(localized: "starred.messages.empty.subtitle", defaultValue: "Appuyez longuement sur un message et choisissez \"Ajouter aux favoris\" pour le retrouver ici.", bundle: .main)
    )
}
```

`import MeeshyUI` was already present (line 3).

Inherited for free from the shared component:
- `.accessibilityElement(children: .combine)` + `.accessibilityLabel("\(title). \(subtitle)")` → single VoiceOver focus (gap 2).
- Brand-primary hero glyph, `.light` weight, entrance spring (gaps 3 & 4).
- Calibrated 18/14 typography (gap 4).

## Scope discipline

- **1 file**, 0 logic, 0 store change, 0 new i18n key (both keys reused
  verbatim), 0 test touched.
- Localization keys `starred.messages.empty.title` /
  `starred.messages.empty.subtitle` unchanged → no `.xcstrings` edit.
- `@EnvironmentObject theme` retained (still used by `backgroundPrimary` and
  `mode.isDark`).
- `MeeshyColors` still referenced by `StarredRow` → import stays valid.
- `StarredMessagesStoreTests` covers only the store's `snapshots.isEmpty`
  state, never the view's empty state → no test references broken.
- No open iOS PR touches `StarredMessagesView` (checked against 30 open PRs) →
  0 contention.

## Verification

- Static review: `EmptyStateView` is `public` in `MeeshyUI`, requires no
  `@EnvironmentObject` (uses `ThemeManager.shared` + `@Environment(\.colorScheme)`
  internally). Signature `(icon:title:subtitle:)` matches the 3 args passed.
- Build gate = CI `iOS Tests` (Linux dev host has no Xcode).

## Status: RESOLVED

`StarredMessagesView` empty state now delegates to the shared primitive,
bringing the sibling Favoris/Messages-favoris screens into visual + a11y
parity. **Do not re-hand-roll** — any future empty-state tweak belongs in the
shared `EmptyStateView`, benefiting all 12 consumers at once.
