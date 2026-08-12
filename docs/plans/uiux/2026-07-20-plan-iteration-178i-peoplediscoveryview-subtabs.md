# Plan — Iteration-178i — Localize + VoiceOver selected-state for `PeopleDiscoveryView` sub-tabs

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Localization (i18n) + Accessibility (VoiceOver) — discovery sub-tab bar
**File to touch:** `apps/ios/Meeshy/Features/Contacts/PeopleDiscoveryView.swift`

## Problem

`PeopleDiscoveryView.subTabButton(_:)` renders the discovery sub-tab bar
(Découvrir / Demandes / Bloqués). It is a near-clone of
`ContactsHubView.tabButton(_:)` (localized in 176i) but regressed on three
fronts, flagged as a remaining item in the 177i analysis:

1. **Hardcoded, unaccented French as visible text** — `Text(tab.rawValue)`
   renders the enum raw value (`"Decouvrir"`, `"Demandes"`, `"Bloques"`),
   which is (a) not localized (shown identically in every locale) and
   (b) wrong French (missing accents: should be « Découvrir », « Bloqués »).
2. **Same raw string as the VoiceOver label** — `.accessibilityLabel(tab.rawValue)`.
3. **No `.isSelected` trait** — a VoiceOver user sweeping the bar cannot tell
   which sub-tab is currently active (state signalled only by the indigo
   underline + tint = WCAG 1.4.1 Use-of-Color failure). Same gap resolved for
   the sibling `ContactsHubView` in 176i.

The header title also uses an unaccented default value
(`defaultValue: "Decouvrir"`).

## Fix (mirror the 176i `ContactsHubView` pattern verbatim)

1. Add a private `tabTitle(_ tab: DiscoveryTab) -> String` helper returning
   `String(localized:defaultValue:bundle:.main)` with properly-accented French
   source values — keys `discovery.tab.discover/requests/blocked`. The enum
   `rawValue` stays the stable French key (used for `.tag`/Hashable/deep-link
   routing), exactly as the `ContactsHubView.tabTitle` doc comment prescribes.
2. `Text(tab.rawValue)` → `Text(tabTitle(tab))`.
3. `.accessibilityLabel(tab.rawValue)` → `.accessibilityLabel(tabTitle(tab))`
   (keep the existing `.accessibilityValue(badge)` split — the badge is a
   value, not part of the name).
4. Add `.accessibilityAddTraits(isSelected ? [.isSelected] : [])`.
5. Fix the header `discovery.title` default value « Decouvrir » → « Découvrir »
   (same key, safe: lookup is by key, not by default value).

## Non-goals

- No change to `DiscoveryTab` raw values (stable persistence/routing keys).
- No layout, color, animation, or logic change.
- No new test (no test references `PeopleDiscoveryView`; parity with 176i).

## Verification

- Static review against the 176i `ContactsHubView` reference implementation.
- `String(localized:)` / `.accessibilityAddTraits` are iOS 16.0+ (app floor) —
  no availability guard. Keys auto-extract into `Localizable.xcstrings` at build
  (source language = fr).
- CI `iOS Tests` (macOS runner) compiles + runs; this is a Linux container.
