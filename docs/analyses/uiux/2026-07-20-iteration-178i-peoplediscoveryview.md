# Iteration-178i — i18n + VoiceOver for `PeopleDiscoveryView` sub-tab bar

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Localization (i18n) + Accessibility (VoiceOver selected-state)
**File touched:** `apps/ios/Meeshy/Features/Contacts/PeopleDiscoveryView.swift`
(1 file, 0 logic, 3 inline i18n keys, 0 new test)

## Component

`PeopleDiscoveryView` is the people-discovery hub (« Découverte d'utilisateurs
Meeshy ») pushed full-screen from the floating menu ladder and reachable via
deep links (`Route.peopleDiscovery(DiscoveryTab)`). It hosts three sticky
sub-tabs — **Découvrir / Demandes / Bloqués** — pinned inside the collapsing
header accessory slot, each switching a cache-first sub-view
(`DiscoverTab` / `RequestsTab` / `BlockedTab`).

This is the exact structural **twin** of the `ContactsHubView` tab bar solved
in **176i**: same `subTabButton(_:)` shape (leading SF Symbol + `Text` label +
optional count badge + 2pt underline), driven by an enum whose `rawValue`
carries raw French display strings.

## Findings

Two real gaps, identical to the 176i sibling and never addressed on this view:

1. **i18n — untranslated tab labels.** `DiscoveryTab.rawValue`
   (`"Decouvrir"` / `"Demandes"` / `"Bloques"`, `ContactsShared.swift:30-33`)
   was rendered directly as the visible tab `Text(tab.rawValue)` **and** as the
   `.accessibilityLabel(tab.rawValue)`. Three user-facing strings shipped
   unlocalized — a non-French locale saw raw, unaccented French. The header
   title was already localized (`discovery.title`), so only the sub-tab labels
   remained hardcoded.

2. **VoiceOver — selected state by color only.** The active sub-tab was
   signalled purely by the indigo tint (`foregroundColor`) plus the 2pt indigo
   underline `Rectangle` — no `.accessibilityAddTraits(.isSelected)`. A
   VoiceOver user sweeping the three tabs heard each read identically and could
   not tell which sub-tab was active. This is a **WCAG 1.4.1 (Use of Color)**
   failure, the same gap resolved on `ContactsHubView` (176i),
   `ContactsListTab` (175i chips) and the selectable-row doctrine
   (144i/149i/155i/163i).

Fonts were already **100 % semantic** (`.footnote` / `.caption` / `.caption2`)
→ **0 Dynamic Type migration** (audit iteration-5 honored).

## Fix

Mirrored the proven 176i pattern verbatim, scoped to the consuming view:

- **New `tabTitle(_:)` helper** → `String(localized: "discovery.tab.{discover,
  requests,blocked}", defaultValue: …)` with defaults **byte-identical** to the
  raw values (`Decouvrir` / `Demandes` / `Bloques`) → **0 visual change in
  French**, the label is now translatable in every other locale.
  `DiscoveryTab.rawValue` stays the **stable key** for `.tag`, persistence and
  the `Route.peopleDiscovery` deep link — `ContactsShared.swift` is **not
  touched** (also avoids any residual collision with the Contacts cluster).
- `Text(tab.rawValue)` → `Text(tabTitle(tab))`.
- `.accessibilityLabel(tab.rawValue)` → `.accessibilityLabel(tabTitle(tab))`.
- **`.accessibilityAddTraits(isSelected ? [.isSelected] : [])`** on the tab
  `Button` — the active sub-tab is now announced as "selected" (localized by
  iOS, **0 new key**), replacing the color/underline-only signal.

The existing `.accessibilityValue(badge > 0 ? "\(badge)" : "")` (pending-request
count on the Demandes tab) is preserved — VoiceOver already announces the badge
as the control's value.

## Rationale

The People-hub tab bar (176i) and this discovery sub-tab bar share one
component shape; leaving one localized and accessible while the twin was not
was an inconsistency. Keeping `rawValue` as the identity key while routing all
display/label reads through a localized helper is the same non-invasive move
that 176i validated: zero logic, zero visual delta in French, zero risk to
deep-link routing, and the selected-state trait closes the WCAG 1.4.1 gap
without touching layout or the Indigo identity.

## Verification

- **Static review:** `String(localized:defaultValue:bundle:)` and
  `.accessibilityAddTraits(cond ? [.isSelected] : [])` are standard SwiftUI
  iOS 16.0+ APIs with direct precedent in the sibling `ContactsHubView`
  (176i). App floor is iOS 16.0 — no availability guard needed.
- **No visual/logic change:** the FR defaults equal the former raw values;
  `rawValue` is unchanged so `.tag`, persistence and `Route.peopleDiscovery`
  deep links behave identically. The fix adds one helper + accessibility
  modifier only.
- **No test churn:** no test references `PeopleDiscoveryView` or `DiscoveryTab`
  (grep across `MeeshyTests` / `MeeshyUITests` / `MeeshySDKTests` = 0).
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `ContactFilter` / `RequestFilter` raw values (`ContactsShared.swift:46-57`)
  — hardcoded French display literals (`"Tous"`, `"En ligne"`, `"Repertoire"`,
  `"Recues"`, `"Envoyees"`) rendered as filter-chip labels; dedicated i18n
  iteration candidate (touches `ContactsShared.swift` — verify swarm collision
  first).
- `CrashReportSheet` — icon-only `ShareLink` with no `.accessibilityLabel`;
  expand/collapse `.onTapGesture` row lacks `.isButton` / hint.
- `VideoFullscreenPlayer` (`VideoLegacySupport.swift`) — icon-only `xmark`
  dismiss button with no label + a fixed `.system(size: 28)` glyph.

**Status: RESOLVED for `PeopleDiscoveryView` sub-tab i18n + VoiceOver
selected-state.**
