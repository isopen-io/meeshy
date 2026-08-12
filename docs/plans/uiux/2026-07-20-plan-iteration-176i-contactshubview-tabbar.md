# Plan — Iteration-176i — `ContactsHubView` tab bar (i18n + VoiceOver selected-state)

**Branch:** `claude/laughing-thompson-lis9hr`
**Base:** `main` HEAD (in sync at start)
**Scope:** iOS only — 1 file, 0 logic, 0 new test

## Target

`apps/ios/Meeshy/Features/Contacts/ContactsHubView.swift` — the People-hub custom
segmented tab bar (Appels / Clavier / Contacts).

## Problems

1. `PeopleTab.rawValue` (raw French literals) used directly as header title, tab
   label, and a11y label → unlocalized shipped strings.
2. Selected tab signalled only by indigo tint + 2 pt underline → invisible to
   VoiceOver (no `.isSelected` trait), WCAG 1.4.1 color-only violation.

## Steps

1. [x] Add `tabTitle(_ tab: PeopleTab) -> String` helper returning
   `String(localized: "contacts.tab.{calls,keypad,contacts}", defaultValue:
   "Appels"/"Clavier"/"Contacts", bundle: .main)` (FR defaults byte-identical to
   the former raw values → no visual change).
2. [x] Route the `CollapsibleHeader` title, the visible `Text(tab.rawValue)`, and
   the `accessibilityLabel` interpolation through `tabTitle(tab)`.
3. [x] Add `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` to the tab
   button so VoiceOver announces the active tab (localized natively, 0 new key).
4. [x] Verify no test / catalog dependency on the raw literals; confirm rawValue
   display usage is confined to this file (`PeopleDiscoveryView` uses the distinct
   `DiscoveryTab`).
5. [x] Write analysis + plan docs.
6. [ ] Commit, push, open PR. Gate = CI `iOS Tests`.

## Non-goals

- No change to `ContactsShared.swift` (keeps `PeopleTab` raw values as stable keys;
  avoids collision with the in-flight `ContactsListTab` 175i work).
- No Dynamic Type migration (fonts already semantic — iteration-5 audit honoured).
- No visual redesign (Indigo tint, underline, layout preserved).
