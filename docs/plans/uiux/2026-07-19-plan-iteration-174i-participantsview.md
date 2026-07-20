# Plan — Iteration-174i — `ParticipantsView` VoiceOver row grouping

**Date:** 2026-07-19 · **Scope:** iOS only · **Base:** `main` HEAD `4881f06`

## Goal
Make each participant row read as one coherent VoiceOver element, surface
presence (currently color-only) in the announcement, and hide the decorative
header glyph — without touching layout, fonts, colors, or logic.

## Steps
1. [ ] Add `presence` import path: reuse SDK `PresenceState.localizedLabel`
   (existing `presence.*` keys, 0 new keys).
2. [ ] Add `participantAccessibilityLabel(_:isCurrentUser:presence:)` composing
   name (+ "you") → role → presence (online/recent/away only) → @username →
   "Depuis <date>".
3. [ ] Apply `.accessibilityElement(children: .combine)` + label to
   `participantRow`; context-menu actions preserved by `.combine`.
4. [ ] `.accessibilityHidden(true)` on `person.2.fill` header glyph.
5. [ ] Verify no test references the view; build compiles.
6. [ ] Push branch, open PR, confirm `ios-tests` green.

## Non-goals
- No `.xcstrings` edit, no new i18n key (reuse `presence.*`, `participants.*`).
- No layout / font / animation / color change.
- No SDK change (`PresenceState.localizedLabel` already public).
