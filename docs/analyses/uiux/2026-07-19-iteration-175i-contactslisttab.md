# Iteration-175i — ContactsListTab VoiceOver a11y pass

**Date:** 2026-07-19
**Scope:** iOS only
**Component:** `apps/ios/Meeshy/Features/Contacts/ContactsListTab.swift`
**Type:** Accessibility (VoiceOver) — parity with the sibling `CallsTab` (same `Features/Contacts/` cluster)

## Context

`ContactsListTab` is the **Contacts** directory tab of the People hub
(`ContactsHubView`) — a filterable annuaire of the user's friends with a
horizontal filter-chip rail (Tous / En ligne / Hors ligne / Répertoire /
Affiliés), a search bar, and a friend list.

It is a fresh surface — never touched by the a11y swarm (140i→174i) — and the
first of the `Features/Contacts/` cluster to be audited **except** its own
sibling `CallsTab`, which already carries the `.isSelected` selection-trait
treatment (`CallsTab.swift:60`). This iteration brings `ContactsListTab` to
parity with that sibling.

## Findings (before)

The file is **already 100 % semantic-font** (`.subheadline` / `.caption` /
`.caption2` / `.callout` / `.system(.largeTitle)` for the decorative empty-state
hero, which is already `.accessibilityHidden(true)`) → **Dynamic Type is already
correct**, no migration needed. The `contactRow` is already a single combined
element with an explicit label. The gaps were purely VoiceOver:

| # | Element | Issue | Severity |
|---|---------|-------|----------|
| 1 | Filter chip (`chipButton`) | Active filter signalled **by colour only** (white-on-indigo fill vs indigo text + outline) — no `.isSelected` trait, so VoiceOver never announces which filter is active (WCAG 1.4.1 / HIG "never rely only on colour") | Medium |
| 2 | Search-clear button (`xmark.circle.fill`) | Interactive control with **no** `accessibilityLabel` → announced as bare "button" | Medium |
| 3 | Search `magnifyingglass` (leading) | Purely decorative glyph exposed to VoiceOver as an unlabeled image (placeholder already conveys "Rechercher un contact") | Low |

## Fix

Three annotation-only additions, all reusing existing SSOT patterns/keys
(**zero new i18n keys**):

- **#1** `.accessibilityAddTraits(isActive ? [.isSelected] : [])` on `chipButton`
  — verbatim parity with the neighbouring `CallsTab.swift:60`
  (`isSelected ? [.isSelected] : []`). The active filter is now announced as
  "sélectionné" (localised by iOS), and placeholder chips (Répertoire/Affiliés,
  which only surface a "bientôt disponible" toast) correctly stay unselected.
- **#2** `.accessibilityLabel(common.clear-search)` on the clear button — the
  exact SSOT key already used by `AddParticipantSheet`, `LocationPickerView`,
  and `MessageForwardDetailView` for identical search-field clear controls.
- **#3** `.accessibilityHidden(true)` on the leading decorative
  `magnifyingglass`.

## Constraints respected

- **1 file, +3 lines, 0 logic change** — no behaviour, networking, layout, or
  visual change; filter/search/paging logic untouched.
- **0 new i18n keys** — `common.clear-search` is an existing SSOT key
  (code-only `defaultValue`, no `.xcstrings` edit → no #1174-style collision).
- **0 new tests** — annotation-only change, no new testable behaviour. The
  `.isSelected` trait mirrors the pattern already covered across the app
  (`CallsTab`, `MessageReactionsDetailView`, `GlobalSearchView`, …).
- Dynamic Type left as-is (already fully semantic); the decorative empty-state
  hero glyph stays frozen + `accessibilityHidden` per the empty-state-illustration
  doctrine (82i/84i/86i).

## Verification status

- Static review: the `.isSelected` idiom matches `CallsTab.swift:60`
  one-for-one; `common.clear-search` matches the three sibling search bars;
  `isActive` inside `chipButton` is the local filter-selection flag (line 39),
  not the paging `isActive` view param (line 8). ✅
- Swift compile / `iOS Tests` CI: gated on the PR (no local macOS toolchain). ⏳

## Remaining / follow-ups (Contacts cluster)

Surfaced while auditing this cluster — deferred, each its own future iteration:

- **Same `.isSelected` gap** on the colour-only selection of `RequestsTab`
  filter pills, `ContactsHubView` tab bar, and `PeopleDiscoveryView` sub-tab bar
  — identical one-line fix per file.
- **Same unlabeled search-clear + decorative `magnifyingglass`** in
  `DiscoverTab.searchBar`.
- **i18n gap (cross-file, larger scope):** the tab/filter enums in
  `ContactsShared.swift` (`PeopleTab`, `DiscoveryTab`, `ContactFilter`,
  `RequestFilter`) use **hardcoded French `rawValue`s** ("Appels", "Clavier",
  "Tous"…) rendered verbatim as tab labels and the hub header title regardless
  of locale — needs localized computed properties + updates to every consumer,
  a dedicated localization iteration.
