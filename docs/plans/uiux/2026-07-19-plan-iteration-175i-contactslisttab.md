# Plan — Iteration-175i — ContactsListTab VoiceOver a11y

**Date:** 2026-07-19 · **Scope:** iOS only · **Branch:** `claude/laughing-thompson-1r1cqk`
**Base:** `main` HEAD `e7b3f22` · **File:** `apps/ios/Meeshy/Features/Contacts/ContactsListTab.swift`

## Goal

Bring `ContactsListTab` (Contacts directory tab of the People hub) to VoiceOver
parity with its sibling `CallsTab`, closing three real gaps without touching
logic, layout, or visuals.

## Steps

1. **Filter chip selection trait** — add
   `.accessibilityAddTraits(isActive ? [.isSelected] : [])` to `chipButton`
   (colour-only active state → announced "sélectionné"). Verbatim parity with
   `CallsTab.swift:60`.
2. **Search-clear label** — add `.accessibilityLabel(common.clear-search)` to the
   `xmark.circle.fill` clear button (SSOT key, 0 new keys).
3. **Hide decorative glyph** — `.accessibilityHidden(true)` on the leading
   `magnifyingglass`.

## Constraints

- 1 file, +3 lines, 0 logic / 0 visual / 0 new i18n key / 0 new test.
- Dynamic Type already fully semantic (no migration); empty-state hero stays
  frozen + hidden per doctrine 82i/84i/86i.

## Gate

CI `iOS Tests` (no local macOS toolchain).

## Verification

- `.isSelected` idiom matches `CallsTab.swift:60`; `common.clear-search` matches
  `AddParticipantSheet` / `LocationPickerView` / `MessageForwardDetailView`.
- `isActive` in `chipButton` = local filter-selection flag (line 39), distinct
  from the paging `isActive` view param (line 8).

## Follow-ups

Deferred siblings (each its own iteration): `RequestsTab` filter pills,
`ContactsHubView` / `PeopleDiscoveryView` tab bars (same `.isSelected` gap);
`DiscoverTab.searchBar` (clear + glyph); `ContactsShared` enum `rawValue`
localization (cross-file i18n lot).
