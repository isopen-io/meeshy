# Plan — Iteration-207i — RequestsTab empty-state design-system dedup

**Date:** 2026-07-21 · **Scope:** iOS only · **Working branch:** `claude/laughing-thompson-wn8om8`
**Base:** `origin/main` HEAD `22465a5` (after 204i merge #2219)

## Problem

In the Contacts tab family, the sibling tabs already use the shared `EmptyStateView`
primitive:
- `ContactsListTab.emptyState` → `EmptyStateView(...)`
- `CallsTab` → `EmptyStateView(...)`
- `BlockedTab` → `EmptyStateView(...)`

But **`RequestsTab` is the odd one out** — its `emptyState(icon:text:)` helper hand-rolls a
`VStack { Spacer; Image(.largeTitle).weight(.light); Text(.callout); Spacer }`, diverging from
its siblings (gray-muted `.largeTitle` glyph vs the design-system's accent glyph, no spring
appear animation, no auto-combined VoiceOver element).

## Fix

Collapse the helper body to a single `EmptyStateView` call, keeping the `emptyState(icon:text:)`
signature so both call sites (`received` / `sent`) stay byte-identical:

```swift
private func emptyState(icon: String, text: String) -> some View {
    EmptyStateView(icon: icon, title: text, subtitle: "")
}
```

- Both call sites pass title-only text (no subtitle) → `subtitle: ""` (the primitive omits the
  subtitle `Text` when empty), exactly like `ContactsListTab` / `SharePickerView` / `ParticipantsView`.
- Non-compact (default) — full-tab empty state, matching `CallsTab` / `BlockedTab`.
- `MeeshyUI` already imported; `EmptyStateView` already used across the sibling tabs.

## Gains

- **Consistency** — `RequestsTab` now matches every sibling Contacts tab.
- **Design-system dedup** — removes a bespoke empty-state reimplementation (14 → 3 lines).
- **Native polish** — spring appear animation + auto-combined VoiceOver element from the primitive.
- **Brand** — empty glyph adopts the standard accent tint (like all sibling tabs) instead of a
  one-off gray-muted `.largeTitle`.

## Non-goals / untouched

- `filterPills`, `receivedList`, `sentList`, request rows, ViewModel, navigation — unchanged.
- No new state, logic, network, or i18n key (reuses `contacts.requests.empty.received` /
  `.sent`). `theme` stays referenced (10 sites).

## Verification

- Gate: CI **iOS Tests** (Linux env has no Xcode). Adoption mirrors the sibling `CallsTab` /
  `BlockedTab` / `ContactsListTab` `EmptyStateView` usage exactly.
- 1 file, 0 logic / 0 network / 0 new i18n key / 0 new test.
