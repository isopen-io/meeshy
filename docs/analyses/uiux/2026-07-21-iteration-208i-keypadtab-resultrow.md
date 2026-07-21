# Iteration 208i — KeypadTab search-result row VoiceOver label

**Date**: 2026-07-21
**Track**: iOS UI/UX (suffix `i`)
**Scope**: 1 file — `apps/ios/Meeshy/Features/Contacts/KeypadTab.swift`

## Context

Pointer 207i flagged the anti-pattern class for 208i+: list rows where an explicit
`.accessibilityLabel(...)` chained **after** `.accessibilityElement(children: .combine)`
**replaces** the combined child text, silently dropping information a sighted user sees
(WCAG 1.3.1 / 1.1.1 / 1.4.1). `CallJournalRow` was the 207i instance.

`grep 'children: .combine'` + adjacent `.accessibilityLabel(` surfaced
`KeypadTab.resultRow` (line 166): `.accessibilityLabel(name)`.

## Problem

`resultRow` renders a person found by the People-hub **Keypad** tab (dial-pad name /
phone lookup). The tappable `Button` shows three visible facts:

1. `name` (`displayName ?? username`)
2. `@username` (always visible, muted caption)
3. an **online-presence dot** on the `MeeshyAvatar` (`presenceState:` →
   `PresenceManager.resolvedState`), a green `Circle` drawn **only** when online.

The `.accessibilityElement(children: .combine)` would normally fold all child Texts into
the VoiceOver label, but the explicit `.accessibilityLabel(name)` **overrides** it — so
VoiceOver announced only the display name, dropping:

- **`@username`** — the disambiguator between two people with the same display name
  (identity conveyed by text alone → WCAG 1.1.1).
- **online status** — conveyed by the avatar dot's colour/shape alone → WCAG 1.4.1
  ("Use of Color").

This is the exact defect already solved for the sibling rows `NewConversationView` (185i)
and `ContactsListTab` (175i), both in the same Contacts / People surface.

## Fix

Pure helper `resultRowAccessibilityLabel(for:name:)` composing
`name, @username[, en ligne]`, applied as the row `.accessibilityLabel`. Mirrors
`NewConversationView.userRowAccessibilityLabel` byte-for-byte in idiom:

- Reuses the **existing** key `contacts.list.online.lower` (shipped by `ContactsListTab:195`
  and `NewConversationView:414`) → **0 new i18n key**.
- **Offline stays silent**, matching the visual (the presence dot is drawn only when
  online — project presence doctrine "offline = no dot"). No `hors ligne` is spoken.
- No `blocked` state exists in keypad search results (unlike `NewConversationView`), so
  the helper is a strict subset.

The `.combine` scope is **kept** (folds avatar + name + username; the sibling `dialMenu`
stays its own element — combine is on the `Button` only, so the redial menu is not
swallowed). The existing "Ouvre le profil" `.accessibilityHint` is preserved.

## Scope / risk

- **1 file**, +helper (~9 lines incl. 8-line rationale comment), 1 changed label line.
- **0** logic / **0** network / **0** layout / **0** visual / **0** new i18n key / **0** new test.
- `UserSearchResult.isOnline: Bool?` (SDK `ServiceModels.swift:249`) → `== true` guard, nil-safe.
- iOS 16 floor; all APIs long-available, no `@available` guard.
- Collision: `search_pull_requests is:pr is:open KeypadTab` → 0. No open PR touches the file.
  `KeypadViewModelTests` tests the ViewModel only (untouched) → 0 contention.

## Verification

- Static review: helper mirrors the shipped `NewConversationView` sibling; `name` is
  reused (already `displayName ?? username`), avoiding recomputation.
- No Swift toolchain in this Linux environment → behavioural gate = CI **iOS Tests**
  (compile Xcode 26.1.1 / Swift 6.2, run sim iOS 18.2).

## Status

**Resolved.** Do not re-flag `KeypadTab.resultRow` for dropped username / online status.

### Follow-ups (209i+, verify swarm contention first)
Other `children: .combine` + overriding `.accessibilityLabel` rows where the label omits
visible facts (grep pattern above). Candidates to audit individually — most `.combine` +
`.accessibilityLabel(title)` settings rows are legitimate (title *is* the whole visible
content); only flag when a value/badge/status is genuinely dropped.
