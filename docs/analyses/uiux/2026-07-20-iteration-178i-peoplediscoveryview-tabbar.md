# Iteration-178i — Localization + VoiceOver selected-state for `PeopleDiscoveryView` sub-tab bar

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Localization (i18n) + Accessibility (VoiceOver, WCAG 1.4.1) — people-discovery sub-navigation
**File touched:** `apps/ios/Meeshy/Features/Contacts/PeopleDiscoveryView.swift` (1 file, 0 logic, 0 new test)

## Component

`PeopleDiscoveryView` is the **Découverte d'utilisateurs Meeshy** hub, pushed
full-screen from the floating menu ladder and reachable via deep links
(`Route.peopleDiscovery(DiscoveryTab)`). A custom sub-tab bar sits inside the
collapsing header's accessory slot and drives three sub-tabs: **Decouvrir** (the
search landing), **Demandes** (friend requests, badged with the pending-received
count), **Bloques** (blocked users). Each sub-tab button renders an SF Symbol +
title + optional badge, and the active sub-tab is marked with an indigo tint and
a 2 pt underline.

This is the **exact structural twin** of `ContactsHubView`'s tab bar, flagged as
the natural next candidate in the 176i analysis "Remaining improvements".

## Findings

Typography was already sound (`.footnote` / `.caption` / `.caption2` — all
Dynamic Type scalable; the iteration-5 font audit is honoured, no
`.system(size:)`). Two real gaps remained, both stemming from the sub-tab title
being sourced directly from the `DiscoveryTab` raw enum value:

1. **Hardcoded, unlocalized French strings.** `DiscoveryTab.rawValue`
   (`"Decouvrir"`, `"Demandes"`, `"Bloques"`) was used verbatim in two
   user-facing sites:
   - the visible sub-tab label (`Text(tab.rawValue)`),
   - the VoiceOver `accessibilityLabel(tab.rawValue)`.
   The raw value is meant to be a **stable enum key** (used for `.tag`,
   `Hashable`, persistence and the `Route.peopleDiscovery(DiscoveryTab)` deep
   link) — routing it to the display layer shipped raw French literals with no
   `String(localized:)` wrapper. Same class of gap fixed in 176i for `PeopleTab`.

2. **Selected sub-tab conveyed by color alone (WCAG 1.4.1).** The active sub-tab
   was signalled *only* by `foregroundColor(isSelected ? indigo500 : textMuted)`
   plus a 2 pt underline `Rectangle`. The button's `accessibilityLabel` announced
   the tab name (and a separate `accessibilityValue` gave the badge count) but
   never its selected state, and no `.isSelected` trait was present. A VoiceOver
   user sweeping the three sub-tabs heard "Decouvrir / Demandes / Bloques" with
   **no indication of which one is active** — information carried purely through a
   color/geometry channel.

## Fix

All changes confined to `PeopleDiscoveryView.swift`, mirroring 176i verbatim so
the two twin tab bars behave identically for VoiceOver:

- **`tabTitle(_:)` helper** — maps each `DiscoveryTab` to a localized display name
  via `String(localized: "discovery.tab.{discover,requests,blocked}",
  defaultValue: …, bundle: .main)`. French defaults ship inline (`Decouvrir` /
  `Demandes` / `Bloques` — **byte-identical to the former raw values**, so zero
  visual change in the shipping FR locale). The raw enum value stays the stable
  key for `.tag` / persistence / deep-links; only the display + VoiceOver layers
  read the localized string.
- The visible sub-tab label and the a11y label now call `tabTitle(tab)`.
- **Enriched, localized a11y label** — the label now reads
  `"{prefix} {title}, {n} {items}"`, reusing the generic `contacts.tab.prefix`
  ("Tab") and `contacts.tab.items` ("items") inline keys introduced in 176i and
  living in the sibling `ContactsHubView.swift` (same Contacts feature folder).
  The separate `accessibilityValue` for the badge is folded into the label, matching
  the 176i behaviour exactly.
- **`.accessibilityAddTraits(isSelected ? [.isSelected] : [])`** on the sub-tab
  button — VoiceOver now appends the localized "selected" state to the active
  sub-tab (announced natively, localized by iOS, **0 new key**), closing the WCAG
  1.4.1 color-only gap. Matches the swarm's `.isSelected` doctrine
  (144i / 149i / 155i / 163i / 176i).

Three new inline-`defaultValue` keys (`discovery.tab.discover`,
`discovery.tab.requests`, `discovery.tab.blocked`) — French defaults inline, **no
`.xcstrings` catalog edit** (same doctrine as the 176i file family).

## Rationale

People discovery is the connection-management surface (friend requests, blocked
users, user search) reached from the primary menu ladder and from deep links. A
segmented control whose active state is invisible to VoiceOver is a textbook
"never rely only on color" violation, and three raw French literals blocked
localization of a shipped screen. The byte-identical defaults preserve the enum's
stable-key role and guarantee no FR visual churn; keeping the defaults unaccented
(matching the existing `discovery.title` default `"Decouvrir"` on line 38 of the
same file) avoids diverging the tab from the still-unaccented header title — the
accent normalization is a separate, catalog-level concern. No visual redesign —
the Indigo identity, underline, layout, paging and badge are untouched.

## Verification

- **Static review:** `accessibilityAddTraits`, `AccessibilityTraits.isSelected`,
  and interpolated `String(localized:defaultValue:bundle:)` are standard SwiftUI
  iOS 14.0+ / 16.0+ APIs (app floor iOS 16.0 — no availability guard). Direct
  precedent: `ContactsHubView` 176i uses the identical construct in the same
  folder. `isSelected` is in scope inside `subTabButton(_:)` (line 75) where the
  trait is applied.
- **No display regression (FR):** the three localized defaults equal the former
  `rawValue` strings byte-for-byte; `.tag(DiscoveryTab.…)` is not used here (the
  bar iterates `DiscoveryTab.allCases` with `id: \.self` and drives `@State subTab`
  directly), paging and the pending-count badge are unchanged for the shipping
  locale.
- **No test churn:** no test references `PeopleDiscoveryView` or the raw
  `DiscoveryTab` literals. The reused `contacts.tab.prefix` / `contacts.tab.items`
  keys already exist (shipped in merged 176i, #2072).
- **No swarm collision:** `search_pull_requests` for `PeopleDiscovery` = 0 open
  PRs; only `PeopleDiscoveryView.swift` is touched (`ContactsShared.swift`, where
  the `DiscoveryTab` enum lives, is left untouched — the enum's `rawValue` remains
  the stable key).
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build / VoiceOver run happens in CI. Confirm `ios-tests` is green before merge.

## Remaining improvements (future iterations)

- `ContactFilter` / `RequestFilter` raw values (`Tous`, `En ligne`, `Hors ligne`,
  `Repertoire`, `Affilies`, `Recues`, `Envoyees`) in `ContactsShared.swift` are
  raw French display literals wherever surfaced — the next natural i18n candidate.
- The unaccented French source strings across this cluster (`Decouvrir`,
  `Bloques`, `Repertoire`, `Affilies`, `Recues`, `Envoyees`) could be normalized
  to proper accents in a dedicated `fr` catalog pass (source-string change, not a
  code change — deliberately out of scope here to preserve zero-visual-churn).
- `CrashReportSheet` (`ShareLink` icon-only without label + expand row
  `.onTapGesture` without `.isButton`/hint) and `VideoFullscreenPlayer`
  (icon-only `xmark` dismiss + fixed `.system(size: 28)`) remain flagged in the
  177i pointer.

**Status: RESOLVED for `PeopleDiscoveryView` sub-tab-bar localization + selected-state VoiceOver.**
