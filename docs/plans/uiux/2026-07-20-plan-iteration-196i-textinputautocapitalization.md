# Plan — Iteration-196i — Modernize `.autocapitalization(_:)` → `.textInputAutocapitalization(_:)`

**Date:** 2026-07-20
**Scope:** iOS only
**Type:** API modernization / consistency (behavior-preserving)

## Goal

Remove the last two deprecated `UITextAutocapitalizationType`-based
`.autocapitalization(_:)` call sites in the iOS app, aligning them with the
codebase-standard SwiftUI-native `.textInputAutocapitalization(_:)` used at 10+
other sites.

## Steps

1. `SecurityView.emailEditContent` email `TextField`:
   `.autocapitalization(.none)` → `.textInputAutocapitalization(.never)`.
2. `DeleteAccountView.confirmationSection` confirmation `TextField`:
   `.autocapitalization(.allCharacters)` → `.textInputAutocapitalization(.characters)`.
3. Confirm `grep -rn '\.autocapitalization(' Meeshy packages` returns nothing.

## Non-goals

- No behavior change (autocapitalization semantics are preserved by the mapping).
- No refactor of the surrounding views, headers, or navigation.
- No new i18n keys, no SDK change, no new test (pure modifier swap).

## Risk

Minimal. `TextInputAutocapitalization` is iOS 15+; the app floor is iOS 16. The
exact `.never` modifier is already compiled at 10+ sites, and `.characters` is the
documented Apple mapping for the previous `.allCharacters` value.
