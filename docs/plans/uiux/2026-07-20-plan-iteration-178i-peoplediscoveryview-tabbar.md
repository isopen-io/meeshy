# Plan — Iteration-178i — `PeopleDiscoveryView` sub-tab bar i18n + VoiceOver selected-state

**Date:** 2026-07-20 · **Scope:** iOS only · **Base:** `main` HEAD `ef25781`
**Branch:** `claude/laughing-thompson-mi8z1i`

## Goal

Close the i18n + WCAG 1.4.1 gaps on `PeopleDiscoveryView`'s sub-tab bar — the exact
structural twin of the `ContactsHubView` tab bar fixed in 176i (#2072), flagged as
the natural next candidate in the 176i analysis.

## Steps

1. [x] Sync designated branch from latest `main` (restart from `ef25781`; stale
       168i commit already merged as #2071).
2. [x] Confirm no swarm collision (`search_pull_requests` PeopleDiscovery = 0).
3. [x] `Text(tab.rawValue)` → `Text(tabTitle(tab))` (visible sub-tab label).
4. [x] Add `tabTitle(_:)` helper → `String(localized: "discovery.tab.{discover,
       requests,blocked}", defaultValue: <byte-identical FR>, bundle: .main)`.
5. [x] Replace `accessibilityLabel(tab.rawValue)` + `accessibilityValue(badge)`
       with the enriched, localized label (reusing `contacts.tab.prefix` /
       `contacts.tab.items` from 176i) and add
       `.accessibilityAddTraits(isSelected ? [.isSelected] : [])`.
6. [x] Leave `ContactsShared.swift` untouched (enum `rawValue` stays stable key).
7. [x] Write analysis + plan docs; update `branch-tracking.md`.
8. [ ] Commit + push to `claude/laughing-thompson-mi8z1i`.
9. [ ] CI gate: `iOS Tests` green.

## Constraints

- 1 production file (`PeopleDiscoveryView.swift`), 0 logic, 0 new test, 0 xcstrings.
- Zero visual change in shipping FR locale (byte-identical defaults).
- Fonts already semantic → no Dynamic Type migration.
- Mirror 176i verbatim so the two twin tab bars behave identically for VoiceOver.

## Gate

`iOS Tests` (macOS CI runner). Linux container → build/VoiceOver run in CI only.
