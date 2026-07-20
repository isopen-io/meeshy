# Iteration-193i — `MessageViewsDetailView` sub-filter capsules — VoiceOver selected-state

**Date**: 2026-07-20
**Scope**: iOS only — `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsDetailView.swift`
**Type**: Accessibility (VoiceOver) — color-only selection state
**Branch**: `claude/laughing-thompson-utlroe`

## Surface

`MessageViewsDetailView` is the "Who saw" tab of the message-detail sheet. Its top row is a
horizontally-scrolling set of sub-filter capsules (`viewsFilterCapsule`): **Sent / Delivered /
Read / Not seen / Listened / Watched** (`ViewsFilter`, `availableViewsFilters` gates the media
ones). Each capsule is a `Button` that switches `viewsFilter`.

Fresh surface for VoiceOver selected-state — verified absent from every open PR
(`search_pull_requests … MessageViewsDetailView` → 0 results). The prior 178i work on this
file targeted the **send-attempts history card** (`viewsSentContent`), a distinct region; the
filter capsules were never audited.

## Gap identified

The active capsule was signalled to the user by **color only** — accent `fill` (0.15),
accent `stroke` (0.35), accent `foregroundColor` — with **no** `.accessibilityAddTraits(.isSelected)`.
VoiceOver therefore announced every capsule identically ("Delivered, 5") whether it was the
active filter or not, so a VoiceOver user had no way to know which filter was applied. This is
the HIG violation "never rely on color alone to convey state" (WCAG 1.4.1) — the exact class
of defect solved for sibling segmented selectors in 185i (`RequestsTab`), 186i
(`ConversationDashboardView.periodPicker`, `ConversationInfoSheet.tabSelector`), and the
`CallsTab.chip` / `GlobalSearchView.tabButton` precedents.

Secondary: the decorative `Image(systemName: filter.icon)` inside the button label carried no
semantic value (the meaning is fully in `filter.label`), so it was hidden from VoiceOver to keep
the announcement clean.

## Fix

Mirror of the proven sibling doctrine — surgical, zero logic/layout/color change:

1. `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` on the capsule `Button`
   (`isSelected` already in scope at the top of `viewsFilterCapsule`). VoiceOver now appends
   "selected" to the active filter.
2. `.accessibilityHidden(true)` on the decorative SF Symbol icon (parity with the decorative
   glyphs already hidden elsewhere in this file at lines 848/869). VoiceOver reads
   "Delivered, 5, selected" as one element instead of leaking the symbol name.

The visible label, icon, count badge, spring animation, haptic and filter logic are unchanged;
non-VoiceOver users see an identical UI (0 visual regression).

- **Files**: 1 (`MessageViewsDetailView.swift`), +2 lines
- **Logic / network / layout / color**: 0
- **i18n keys**: 0 new (label already localized via `ViewsFilter.label`)
- **Tests**: 0 new (no behavior change; existing suites unaffected)
- **Gate**: CI `iOS Tests`

## Verification

- `isSelected` already computed at top of `viewsFilterCapsule` → trait binds correctly per capsule.
- Decorative-icon hide matches the file's own established pattern (lines 848, 869).
- No other selection-by-color capsule remains in this file's filter row.

## Completion

- [x] VoiceOver selected-state added to `viewsFilterCapsule`
- [x] Decorative icon hidden from VoiceOver
- [x] No visual / logic / i18n / test regression
- [ ] CI `iOS Tests` green (pending PR)

### Remaining (deferred 194i+)
- Other color-only segmented selectors flagged in the 187i+ track:
  `MessageDetailSheet` internal filters (views-filter row ~L898, `reactionFilterCapsule` ~L1587,
  `reportTypeRow` ~L1782 — large central file, verify swarm collision first),
  `AudioFullscreenView` speed picker follow-ups. Audit surface-by-surface.
