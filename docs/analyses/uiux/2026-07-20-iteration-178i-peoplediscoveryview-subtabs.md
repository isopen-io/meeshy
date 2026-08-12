# Iteration-178i — Localize + VoiceOver selected-state for `PeopleDiscoveryView` sub-tabs

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Localization (i18n) + Accessibility (VoiceOver) — discovery sub-tab bar
**File touched:** `apps/ios/Meeshy/Features/Contacts/PeopleDiscoveryView.swift`
(1 file, 0 logic change, 3 new keys, 0 new test)

## Component

`PeopleDiscoveryView` is the **Découverte d'utilisateurs Meeshy** hub, pushed
full-screen from the floating menu ladder and reachable via deep links
(`Route.peopleDiscovery(DiscoveryTab)`). Its `subTabBar` pins three underline
sub-tabs inside the collapsing header — Découvrir / Demandes / Bloqués — each a
`Button` (`subTabButton(_:)`) with a leading SF Symbol, a text label, an
optional pending-requests badge, and an indigo underline + tint marking the
active sub-tab.

`subTabButton(_:)` is a near-clone of `ContactsHubView.tabButton(_:)`, which was
localized and given VoiceOver selected-state in **176i**. The clone had not
received the same treatment — surfaced as a remaining item in the **177i**
analysis.

## Findings

1. **Hardcoded, unaccented French as the visible label.** `Text(tab.rawValue)`
   rendered the enum raw value (`"Decouvrir"`, `"Demandes"`, `"Bloques"`),
   which was (a) **not localized** — every locale saw French — and (b) **wrong
   French**, missing diacritics (« Découvrir », « Bloqués »). The raw values are
   the stable Hashable/`.tag`/deep-link keys and must not double as display copy.
2. **Same raw string used as the VoiceOver label** — `.accessibilityLabel(tab.rawValue)`.
3. **No `.isSelected` trait.** The active sub-tab was signalled only by the
   indigo underline + tint. A VoiceOver user sweeping the bar heard every tab
   read identically — a **WCAG 1.4.1 (Use of Color)** failure and the exact gap
   fixed for the sibling `ContactsHubView` in 176i.
4. **Header default value also unaccented** — `discovery.title` fell back to
   « Decouvrir ».

## Fix

Applied the 176i `ContactsHubView` pattern verbatim, scoped to the sub-tab
builder:

- Added `private func tabTitle(_ tab: DiscoveryTab) -> String` returning
  `String(localized:defaultValue:bundle:.main)` with properly-accented French
  source values — keys `discovery.tab.discover` (« Découvrir »),
  `discovery.tab.requests` (« Demandes »), `discovery.tab.blocked`
  (« Bloqués »). The enum `rawValue` stays the stable French routing key.
- `Text(tab.rawValue)` → `Text(tabTitle(tab))`.
- `.accessibilityLabel(tab.rawValue)` → `.accessibilityLabel(tabTitle(tab))`,
  keeping the existing `.accessibilityValue(badge)` split (the badge count is a
  *value*, not part of the element name).
- Added `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` — the active
  sub-tab is now announced as "selected" (localized by iOS, 0 extra key).
- Fixed the header `discovery.title` default value « Decouvrir » → « Découvrir »
  (same key; catalog lookup is by key, so the change is safe).

## Rationale

The discovery hub is the connection-management surface (accept/block/discover
people). A French user saw broken diacritics; a non-French user saw untranslated
French; a VoiceOver user could not tell which sub-tab was active. All three are
resolved by reusing the already-proven 176i pattern, so the two contact-tab bars
now share one consistent i18n + a11y contract. No layout, color, animation, or
logic changed.

## Verification

- **Static review** against the 176i `ContactsHubView.tabButton` /
  `ContactsHubView.tabTitle` reference — the fix is structurally identical.
- **APIs:** `String(localized:defaultValue:bundle:)` and
  `.accessibilityAddTraits(_:)` are iOS 16.0+; app floor is iOS 16.0 — no
  availability guard. New keys auto-extract into `Meeshy/Localizable.xcstrings`
  at build (source language = `fr`).
- **No conflict:** `discovery.title` is now referenced once with the accented
  default; the three `discovery.tab.*` keys are new and unique (grep-verified).
- **No test churn:** 0 references to `PeopleDiscoveryView` / `DiscoveryTab` in
  `MeeshyTests` / `MeeshyUITests` (grep-verified) — parity with 176i.
- **CI gate:** `iOS Tests` (macOS runner) compiles + runs the build; this is a
  Linux container. Confirm `iOS Tests` is green on the PR before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `ContactFilter` / `RequestFilter` (`ContactsShared.swift:46-57`) — same
  hardcoded-unaccented-French raw values (`"En ligne"`, `"Repertoire"`,
  `"Affilies"`, `"Recues"`, `"Envoyees"`) rendered via `filter.rawValue` in
  `ContactsListTab.swift:56` and `RequestsTab.swift:41` (and folded into their
  `.accessibilityLabel`s). Next localization candidate — same `tabTitle`
  treatment, plus these filter chips likely also lack `.isSelected`.
- `CrashReportSheet` — icon-only `ShareLink` with no `.accessibilityLabel`;
  expand/collapse `.onTapGesture` row lacks `.isButton` / hint (carried from 177i).
- `VideoFullscreenPlayer` (`VideoLegacySupport.swift`) — icon-only `xmark`
  dismiss button with no label + a fixed `.system(size: 28)` glyph (carried from 177i).

**Status: RESOLVED for `PeopleDiscoveryView` sub-tab i18n + VoiceOver selected state.**
