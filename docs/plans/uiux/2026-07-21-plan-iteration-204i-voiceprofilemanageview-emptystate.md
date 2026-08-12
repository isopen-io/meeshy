# Plan — Iteration-204i — VoiceProfileManageView empty-state design-system dedup

**Date:** 2026-07-21
**Scope:** iOS only — single file
**Working branch:** `claude/laughing-thompson-wn8om8`
**Base:** `origin/main` HEAD `c74c273`

## Problem

`VoiceProfileManageView.emptyState` (`apps/ios/Meeshy/Features/Main/Views/VoiceProfileManageView.swift`)
hand-rolls a full-screen empty state — a `VStack` with a fixed `.system(size: 64)` gradient
hero glyph, a title, a subtitle, and a bespoke full-width `RoundedRectangle(cornerRadius: 14)`
CTA button — reimplementing the shared `EmptyStateView` primitive
(`packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmptyStateView.swift`), already adopted at
15+ sites including the direct full-screen-with-action precedent **`ConversationListView`**
(non-compact `EmptyStateView` with `actionLabel` + `onAction`).

Divergences from the design system:
- Fixed `.system(size: 64)` hero glyph → does NOT scale with Dynamic Type.
- Bespoke CTA shape (full-width rounded rect) vs the standard accent `Capsule`.
- Manual `.accessibilityHidden(true)` on the glyph + no combined VoiceOver element for the block.
- No spring appear animation.

## Fix

Replace the ~48-line `emptyState` `VStack` with a single `EmptyStateView(...)` call
(non-compact, matching `ConversationListView`):

```swift
EmptyStateView(
    icon: "person.wave.2.fill",
    title: String(localized: "voice.profile.empty.title", ...),
    subtitle: String(localized: "voice.profile.empty.description", ...),
    actionLabel: String(localized: "voice.profile.create", ...),
    accentColor: accentColor,
    onAction: { showWizard = true }
)
```

- **Reuses the 3 existing i18n keys** (`voice.profile.empty.title` / `.description` /
  `voice.profile.create`) → **0 new i18n keys**.
- `accentColor` is already a `String` hex in scope → matches the primitive's `accentColor: String`.
- `onAction` sets the existing `showWizard` `@State` → opens `VoiceProfileWizardView` (unchanged).

## Gains

- **Dedup** — removes a bespoke empty-state reimplementation (~48 → 9 lines).
- **Dynamic Type** — hero glyph now scales (`MeeshyFont.relative`) vs fixed 64pt.
- **Consistency** — standard accent `Capsule` CTA + spring appear animation, matching all other
  empty states.
- **VoiceOver** — `EmptyStateView` combines title+subtitle into one element automatically.
- **HIG** — one clear primary action, native breathing layout.

## Non-goals / untouched

- `header`, `loadingView`, `profileContent`, `addSamplesSheet`, ViewModel, navigation — **unchanged**.
- No new state, no logic change, no network change, no SDK edit.
- `theme` / `Color(hex:)` remain used by `header` / `loadingView`.

## Verification

- Build gate: CI **iOS Tests** (Linux env here has no Xcode; adoption mirrors the
  `ConversationListView` full-screen-with-action pattern exactly).
- 1 file, 0 logic / 0 network / 0 new i18n key / 0 new test.
