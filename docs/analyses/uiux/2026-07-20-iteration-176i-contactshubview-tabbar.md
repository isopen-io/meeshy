# Iteration-176i — Localization + VoiceOver selected-state for `ContactsHubView` tab bar

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Localization (i18n) + Accessibility (VoiceOver, WCAG 1.4.1) — People-hub top-level navigation
**File touched:** `apps/ios/Meeshy/Features/Contacts/ContactsHubView.swift` (1 file, 0 logic, 0 new test)

## Component

`ContactsHubView` is the People hub — the top-level contact surface reached from
the floating menu ladder. A custom segmented tab bar sits under a collapsing
header and drives a paged `TabView` across three primary tabs: **Appels** (call
journal), **Clavier** (dial pad), **Contacts** (the directory). Each tab button
renders an SF Symbol + title + optional badge, and the active tab is marked with
an indigo tint and a 2 pt underline.

## Findings

Typography was already sound (`.footnote` / `.caption` / `.caption2` — all
Dynamic Type scalable; the earlier iteration-5 font audit is honoured). Two real
gaps remained, both stemming from the tab title being sourced directly from the
`PeopleTab` raw enum value:

1. **Hardcoded, unlocalized French strings.** `PeopleTab.rawValue` (`"Appels"`,
   `"Clavier"`, `"Contacts"`) was used verbatim as three user-facing strings:
   - the `CollapsibleHeader` title (`title: selectedTab.rawValue`),
   - the visible tab label (`Text(tab.rawValue)`),
   - the VoiceOver `accessibilityLabel` interpolation.
   The raw value is meant to be a **stable enum key** (used for `.tag`, `Hashable`,
   persistence) — routing it to the display layer shipped raw French literals with
   no `String(localized:)` wrapper, the same class of gap as 167i's `"fichiers"`.

2. **Selected tab conveyed by color alone (WCAG 1.4.1).** The active tab was
   signalled *only* by `foregroundColor(isSelected ? indigo500 : textMuted)` plus a
   2 pt underline `Rectangle`. The tab button's `accessibilityLabel` announced the
   tab name but never its selected state, and no `.isSelected` trait was present.
   A VoiceOver user sweeping the three tabs heard "Tab Appels / Tab Clavier / Tab
   Contacts" with **no indication of which one is active** — information carried
   purely through a color/geometry channel.

## Fix

All changes confined to `ContactsHubView.swift`, one idiomatic helper + one trait:

- **`tabTitle(_:)` helper** — maps each `PeopleTab` to a localized display name via
  `String(localized: "contacts.tab.{calls,keypad,contacts}", defaultValue: …,
  bundle: .main)`. French defaults ship inline (`Appels` / `Clavier` / `Contacts`
  — byte-identical to the former raw values, so **zero visual change in the
  shipping FR locale**). The raw enum value stays the stable key for `.tag` /
  persistence; only the display + VoiceOver layers read the localized string.
- Header title, visible tab label, and the a11y label now all call `tabTitle(tab)`.
- **`.accessibilityAddTraits(isSelected ? [.isSelected] : [])`** on the tab button —
  VoiceOver now appends the localized "selected" state to the active tab
  (announced natively, localized by iOS, **0 new key**), closing the WCAG 1.4.1
  color-only gap. Matches the swarm's established capsule/filter `.isSelected`
  doctrine (144i / 149i / 155i / 163i).

Three new inline-`defaultValue` keys (`contacts.tab.calls`, `contacts.tab.keypad`,
`contacts.tab.contacts`) — French defaults inline, **no `.xcstrings` catalog edit**
(same doctrine as the file family; reuses the existing `contacts.tab.prefix` /
`contacts.tab.items` inline keys already in this file).

## Rationale

The People hub is a high-traffic navigation surface hit on every contact/call
interaction. A segmented control whose active state is invisible to VoiceOver is
a textbook "never rely only on color" violation, and three raw French literals
blocked localization of a shipped top-level screen. The `.isSelected` trait is
the canonical Apple pattern for a custom segmented control; the localized-title
helper preserves the enum's stable-key role while making the labels translatable.
No visual redesign — the Indigo identity, underline, and layout are untouched.

## Verification

- **Static review:** `accessibilityAddTraits`, `AccessibilityTraits.isSelected`,
  and interpolated `String(localized:defaultValue:bundle:)` are all standard
  SwiftUI iOS 14.0+ / 16.0+ APIs (app floor iOS 16.0 — no availability guard).
  `.accessibilityAddTraits(cond ? [.isSelected] : [])` has direct precedent
  (`MessageReactionsDetailView` 155i, `ChangePasswordView` 149i). `isSelected` is
  in scope inside `tabButton(_:)` where the trait is applied.
- **No display regression (FR):** the three localized defaults equal the former
  `rawValue` strings byte-for-byte; `.tag(PeopleTab.…)`, paging, and header title
  are unchanged for the shipping locale.
- **No test churn:** no test references `ContactsHubView` or the raw tab literals
  (`"Appels"` / `"Clavier"` grep across `MeeshyTests` / `MeeshyUITests` /
  `MeeshySDKTests` = 0). `PeopleTab.rawValue` display usage was confined to this
  file; `PeopleDiscoveryView` uses the distinct `DiscoveryTab` (out of scope).
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build / VoiceOver run happens in CI. Confirm `ios-tests` is green before merge.

## Remaining improvements (future iterations)

- `PeopleDiscoveryView` shares the identical raw-value-as-label + color-only
  selected-tab pattern for `DiscoveryTab` (Découvrir / Demandes / Bloqués) — a
  natural twin candidate for the next iteration.
- `ContactFilter` / `RequestFilter` raw values (`Tous`, `En ligne`, …) in
  `ContactsShared.swift` are also raw French display literals wherever surfaced.

**Status: RESOLVED for `ContactsHubView` tab-bar localization + selected-state VoiceOver.**
