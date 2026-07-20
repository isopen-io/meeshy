# Plan — Iteration-173i — VoiceOver for `MiniAudioPlayerBar`

**Date:** 2026-07-19 · **Scope:** iOS only · **Base:** `main` HEAD `f53b30a`
**Working branch:** `claude/laughing-thompson-f78nao`

## Goal
Close the two VoiceOver gaps on the floating audio mini-player's content:
(1) its primary action (tap-to-open-conversation) is invisible non-visually;
(2) the now-playing info + progress sweep as disconnected, context-free fragments.

## Steps
1. Wrap avatar + track-meta + progress into one inner `HStack` (same spacing →
   0 visual change).
2. Apply `.accessibilityElement(children: .ignore)` + label / value / hint /
   `.isButton` / conditional `.updatesFrequently` / `.accessibilityAction`.
3. Extract the card-open logic into one private `openConversation(for:)` shared
   by the tap gesture, the VoiceOver action, and the test helper (dedup).
4. Add 2 inline-`defaultValue` keys (`mini_player.a11y.now-playing`,
   `mini_player.a11y.open-hint`) — code-only, no `.xcstrings`.

## Non-goals
- No visual redesign, no font migration (Dynamic Type already semantic).
- No control-button hit-area changes (bounded to capsule by design).
- No logic change to visibility / coordinator wiring.

## Verification
- `MiniAudioPlayerBarTests` (7 behaviors) stays green — `simulateTapBodyForTesting`
  routes through the new shared helper.
- Gate: CI `iOS Tests` (macOS runner; build happens in CI).

## Result
1 file, 0 net logic change, 2 i18n keys, 0 new test. See analysis
`docs/analyses/uiux/2026-07-19-iteration-173i-miniaudioplayerbar.md`.
