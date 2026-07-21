# Iteration-212i — VoiceOver label for KeypadTab search-result row

**Date**: 2026-07-21
**Track**: iOS (suffix `i`)
**Surface**: `apps/ios/Meeshy/Features/Contacts/KeypadTab.swift` → `resultRow(_:)`
**Base**: `main` HEAD `8ba64bb40` (211i #2253 merged)

> Renumbered from a prior in-flight 208i attempt (PR #2237, auto-closed on merge
> conflict). The swarm advanced past 208i/210i/211i while that PR sat; this
> relaunch rebases the identical code fix onto current `main` under a fresh,
> non-colliding number at the maintainer's request.

## Problem

The Keypad dial-pad search-result row (People hub → Clavier → live search)
applies:

```swift
.accessibilityElement(children: .combine)
.accessibilityLabel(name)          // <- overrides the combined child text
```

Per SwiftUI semantics, an explicit `.accessibilityLabel` **replaces** the text
that `children: .combine` would have gathered from the child views. So VoiceOver
announced only the display **name**, dropping two facts a sighted user reads on
the same row:

1. The visible **`@username`** handle — the only disambiguator between two
   contacts sharing a display name (**WCAG 1.1.1**, info conveyed by text).
2. The avatar's **online-presence dot** — a green `Circle` drawn *only* when the
   user is online, i.e. status conveyed by colour/shape alone (**WCAG 1.4.1**).

Same defect class as 207i (`CallJournalRow`) and 208i (`ContactsListTab`): an
explicit label silently flattens a combined row.

## Fix

Introduce a pure helper `resultRowAccessibilityLabel(for:name:)` composing
`name, @username[, en ligne]`:

- Mirrors byte-for-byte the shipped `NewConversationView.userRowAccessibilityLabel`
  (185i) and the `ContactsListTab` idiom → cross-screen parity.
- Reuses the **existing** inline key `contacts.list.online.lower` (already shipped
  by `ContactsListTab:195` and `NewConversationView:414`) → **0 new i18n key**.
- **Offline stays silent**, matching the visual (no dot is drawn when offline) —
  never announce a status the sighted user cannot see.
- `UserSearchResult.isOnline` is `Bool?` → nil-safe `== true` guard.
- The `.combine` scope and the "Ouvre le profil" hint are **preserved**; the
  sibling `dialMenu` remains its own accessibility element (the combine is scoped
  to the tappable `Button` only).

## Impact

- **1 file** (`KeypadTab.swift`), +18 lines (8 comment).
- 0 logic / 0 network / 0 layout / 0 visual change / 0 new i18n key / 0 new test.
- Gate = CI `iOS Tests` (Linux host has no Xcode toolchain → no local build).

## Verification

- Static: helper is pure, string-only; no control-flow or state touched.
- Reviewed `resultRow` render tree: `@username` Text (visible) and online `Circle`
  (drawn iff `isOnline == true`) are the exact two facts now re-surfaced.
- No open PR touches `KeypadTab.swift` (`search_pull_requests … KeypadTab` → 0).

## Status

- [x] Fix applied
- [x] Analysis + plan documented
- [x] Tracking pointer updated (212i authoritative)
- [ ] CI `iOS Tests` green (pending PR)
