# Iteration-181i — shared `EmptyStateView` → Dynamic Type (`MeeshyFont.relative`)

**Date**: 2026-07-20
**Track**: iOS (suffix `i`)
**Scope**: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmptyStateView.swift` (1 file)
**Branch**: `claude/laughing-thompson-n2i97z`
**Base**: `main` HEAD `e5f9cb6`

## Context

`EmptyStateView` is the canonical, `public` empty-state primitive in `MeeshyUI`,
consumed by **12+ screens** across the app (`BookmarksView`, `BlockedTab` —
migrated 179i —, `BlockedUsersView`, `MyStoriesView`, `ConversationListHelpers`,
`SharePickerView`, `GlobalSearchView`, `ParticipantsView`, `WidgetPreviewView`,
`CallsTab`, `ConversationListView`, `StoryViewerView+Content`, …).

A whole thread of prior iterations has been migrating bespoke empty states onto
this shared primitive (168i, 179i, and more queued). Each of those migrations
carried a **known, repeated tradeoff**: the source view often used semantic /
`MeeshyFont.relative` fonts that scale with Dynamic Type, whereas
`EmptyStateView` hard-coded **fixed** point sizes via `.system(size:)`:

| Element | Before |
|---|---|
| Hero icon | `.system(size: compact ? 36 : 52, weight: .light)` |
| Title | `.system(size: compact ? 15 : 18, weight: .bold)` |
| Subtitle | `.system(size: compact ? 12 : 14)` |
| Action button label | `.system(size: compact ? 13 : 14, weight: .semibold)` |

`.system(size:)` does **not** respond to the user's Dynamic Type setting — so
every empty state in the app rendered at a frozen size regardless of the
accessibility text-size slider, violating the project's own Dynamic Type rule
(`apps/ios/CLAUDE.md` → Accessibility: "Use semantic fonts … not fixed sizes
for Dynamic Type").

## Root-cause fix (vs. per-consumer workaround)

Rather than paper over this in each consumer, fix the **single source of truth**.
`MeeshyUI` already ships `MeeshyFont.relative(_:weight:design:)`
(`Theme/Accessibility.swift`) — the documented, mechanical, Dynamic-Type-aware
replacement for `.system(size:weight:design:)` (maps a legacy point size to the
nearest relative `Font.TextStyle` so it scales while preserving weight/design).
It is already used across `MeeshyUI` (JoinFlow views).

Swap all four `.system(size:)` calls in `EmptyStateView` to
`MeeshyFont.relative(...)`. Same base sizes → **visually identical at the default
Dynamic Type setting**; at larger/smaller settings the empty state now scales
correctly. Every one of the 12+ consumers inherits the fix at once.

## Gap addressed

| # | Gap | Category |
|---|-----|----------|
| 1 | Empty-state icon/title/subtitle/button used fixed `.system(size:)` → no Dynamic Type scaling for 12+ screens. | Accessibility / Dynamic Type |

## Scope discipline

- **1 file**, 4 lines, 0 logic, 0 API change, 0 new i18n key, 0 test touched.
- No signature change to `EmptyStateView(icon:title:subtitle:actionLabel:accentColor:compact:onAction:)` → every call site compiles unchanged.
- `MeeshyFont` is same-module (`MeeshyUI`) and `public` → no new import.
- No test references `EmptyStateView` (grep over `MeeshySDK/Tests` + `MeeshyTests` = 0).

## Verification

- Static review: `MeeshyFont.relative` is `public`, `nonisolated static`, returns
  a `Font`; signature `(CGFloat, weight:design:)` matches each swapped call
  (default `design`). Same base point sizes preserved.
- Build gate = CI `iOS Tests` + SDK build (Linux dev host has no Xcode).

## Status: RESOLVED

The shared empty-state primitive now scales with Dynamic Type for all
consumers. **Do not re-introduce `.system(size:)` here** — future size tweaks
use `MeeshyFont.relative`. This also retires the Dynamic Type footnote attached
to every empty-state-migration iteration: migrating a bespoke empty state onto
`EmptyStateView` is no longer a Dynamic Type regression.
