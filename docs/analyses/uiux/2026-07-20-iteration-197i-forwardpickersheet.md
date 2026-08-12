# Iteration-197i — Surface silent failures + localize `ForwardPickerSheet`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** UX (error feedback & recovery) + Localization (i18n) + Design-system consolidation
**Files touched:**
- `apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift` (1 Swift file, state + 2 render branches + 1 helper)
- `apps/ios/Meeshy/Localizable.xcstrings` (11 `forward.*` keys added, 5 languages each)
- 0 SDK change · 0 new test (no test references `ForwardPickerSheet` — grep = 0)

## Component

`ForwardPickerSheet` (289 → 322 l) is the message-forward picker, presented as a
`.sheet(item:)` with `.presentationDetents([.medium, .large])` from
`ConversationView` (l.630). It shows a thin message-preview banner, a searchable
list of the user's conversations, and a per-row send button whose state machine
was: **send → sending (spinner) → sent (green checkmark)**.

## Findings

1. **Silent send failure (dead state).** `@State errorMessage` was assigned on
   both failure paths (`forwardTo` catch l.283, `refreshConversations` catch
   l.259) but **never rendered anywhere in the body** — pure dead state. A failed
   forward gave only `HapticFeedback.error()`: no visible feedback, and nothing
   announced to VoiceOver. The user tapped send, felt a buzz, and the row silently
   reverted to the send button as if nothing happened — no way to know it failed
   or to retry deliberately.

2. **Root toast is unreliable from this sheet.** The natural fix — route through
   `FeedbackToastManager.shared.showError` (the sanctioned local-action channel,
   which also posts a high-priority VoiceOver announcement) — does **not** work
   here: `FeedbackToastView` is mounted at the app root via `.overlay(alignment:
   .top)` (`MeeshyApp.swift` l.130), which renders **behind** a `.sheet`, fully
   hidden at the `.large` detent. In-sheet feedback is the only reliable surface.

3. **Load failure → misleading empty state.** When the cold-start conversation
   fetch failed (no cache), `refreshConversations` swallowed the error and the
   body fell through to `filteredConversations.isEmpty` → **"Aucune conversation"**.
   The screen asserted the user has no conversations when in fact the network
   request failed — a misleading, non-recoverable dead end (no retry).

4. **Bespoke empty state (duplication + title-only).** The empty state was a
   hand-rolled `Spacer / VStack / Spacer` re-implementing the shared
   `MeeshyUI.EmptyStateView` primitive — the same 183i deficit pattern. It was
   **title-only** (no guidance subtitle), had no spring entrance, and its
   `accessibilityElement(.combine)` wrapped only the title. Sibling pickers
   (`BookmarksView` 168i, `ShareLinksView` 178i, `ProfileUserPostsList` 183i)
   already delegate to `EmptyStateView`.

5. **Whole screen unlocalized (French everywhere).** **None** of the 11 `forward.*`
   keys existed in `Localizable.xcstrings` — every string relied on the inline
   `String(localized:defaultValue:)` French fallback, so German/English/Spanish/
   pt-BR users saw French ("Aucune conversation", "Transféré", "Envoi en cours",
   "Transférer à …", "%d membres", "[Media]", etc.).

## Fixes

- **Send failure → in-sheet per-row retry.** Extended the row state machine with a
  4th state: `failedToIds.contains(conv.id)` renders an
  `exclamationmark.arrow.circlepath` button in `MeeshyColors.error` that re-runs
  `forwardTo`. Reliable (in the sheet's own hierarchy), tappable/recoverable,
  VoiceOver-labelled ("Réessayer le transfert à %@"), and **error is signalled by
  the glyph shape, not colour alone** (HIG / colour-blindness). `forwardTo` clears
  the failed flag on retry-start; the `catch` sets it. Dead `errorMessage` removed.
- **Load failure → recoverable `EmptyStateView`.** New `loadFailed` flag gates a
  distinct error state (`wifi.slash` + Retry) shown only when `conversations.isEmpty
  && loadFailed`, reusing the already-localized `conversations.error.title /
  .subtitle / .retry` copy (identical operation — loading the conversation list).
  `retryLoad()` re-fetches. Stale cache still renders instantly (error state never
  masks available data).
- **Empty state → shared `EmptyStateView`.** Adds a guidance subtitle, spring
  entrance, and combined a11y for free; deletes the bespoke VStack.
- **Full i18n.** Added all 11 `forward.*` keys (empty, empty.subtitle, title,
  search-placeholder, media-placeholder, members-count, sent, sending,
  this-conversation, send-a11y, retry-send-a11y) with de/en/es/fr/pt-BR values.

## Non-goals / deliberately kept

- **Search-no-match** falls into the generic empty state (unchanged behaviour); a
  dedicated "no results" copy is deferred (would add 2 keys for marginal value).
- **Forward success** still confirms via the in-row green checkmark + success
  haptic (discoverable in-context) — no toast needed.

## Verification

- Cannot compile on Linux (no Xcode); relies on CI `iOS Tests` (macOS runner,
  `xcodegen generate` + `build-for-testing`).
- Static review: `EmptyStateView` init signature matched; `MeeshyColors.error`
  public; `import MeeshyUI` added (matches `ProfileUserPostsList` convention);
  SF Symbols `wifi.slash` / `exclamationmark.arrow.circlepath` valid iOS 16+;
  `errorMessage` fully removed (grep = 0); `theme` still referenced (7×); catalog
  re-parses as valid JSON with 1276 keys (+11).
- No open iOS PR touches `ForwardPickerSheet` (checked #2175–#2205).
