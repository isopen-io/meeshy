# Iteration-194i — Surface swallowed errors in `ForwardPickerSheet`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** UX (error feedback / action feedback) — remove dead error state
**File touched:** `apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift` (1 file, minimal logic, 0 new i18n key, 0 SDK change, 0 new test)

## Component

`ForwardPickerSheet` is the sheet that forwards a `Message` into another
conversation. It loads the conversation list (cache-first), lets the user
search, and each row has a send affordance (`paperplane.circle.fill`) that
forwards the message inline (multi-target: several rows can each be forwarded,
armed → sending `ProgressView` → sent `checkmark.circle.fill`).

## Finding

The view declared `@State private var errorMessage: String? = nil` and wrote to
it in **two** failure paths:

1. `refreshConversations()` catch (conversation-list load failure).
2. `forwardTo(_:)` catch (the actual forward action failure).

**`errorMessage` was never rendered anywhere in `body`.** It was dead state:
every failure was silently swallowed. The consequences:

- **Forward failure** (the primary user action) produced only a
  `HapticFeedback.error()` buzz — no words, nothing for a VoiceOver user, no
  explanation for a sighted user. The paperplane simply reset and the message
  looked like it might have sent. This violates the routine's *"feedback after
  actions"* / *"error states"* / *"error recovery"* objectives.
- **Cold-load failure** left the sheet on the `"Aucune conversation"` empty
  state — a **misleading** signal (reads as "you have no conversations" when it
  is actually a network error).

## Fix

Routed both paths through the established **app-tier feedback toast**
(`FeedbackToastManager.shared.showError`), which is the canonical channel for
*local user-action* feedback per the two-tier toast doctrine (CLAUDE.md
« Notifications In-App »). The toast overlay is mounted at app root
(`MeeshyApp.swift:131`), renders globally, is VoiceOver-announced, and
`showError` already fires the error haptic — so the explicit
`HapticFeedback.error()` in `forwardTo` was removed to avoid a double buzz.

- **`forwardTo(_:)`** — on catch, `FeedbackToastManager.shared.showError(…)`
  with the existing `common.error.format` key (`"Erreur: %@"`). The forward
  failure is now spoken and shown, not swallowed.
- **`refreshConversations(silent:)`** — added a `silent` flag so the two call
  sites behave per **cache-first doctrine**:
  - `.stale` → `silent: true` — background revalidation over cached data stays
    silent (no toast; the user already sees data). Instant App / SWR rule.
  - `.expired`/`.empty` → `silent: false` — a **cold-load** failure now surfaces
    a toast instead of a misleading empty state.
- Removed the dead `@State errorMessage` declaration entirely.

**0 new i18n key**: reuses `common.error.format`, already referenced in this
same file. No layout, color, navigation, or forward-logic change.

## Rationale

Forwarding is a deliberate, consequential action (it posts a message into
another conversation). Silent failure is the worst outcome — the user cannot
tell whether it worked, and a VoiceOver user gets nothing at all. The fix uses
the platform-correct, already-mounted feedback channel rather than inventing an
inline banner (which would fight the sheet layout and duplicate the toast
system). Distinguishing silent revalidation from cold-load failure keeps the
cache-first "no noise on background refresh" guarantee while still surfacing the
genuinely user-relevant errors.

## Verification

- **Static review:** `FeedbackToastManager` is `@MainActor` and lives in the app
  target (`Meeshy/Features/Main/Services/`), same module as `ForwardPickerSheet`
  — no new import. SwiftUI's `View` is MainActor-isolated, so the direct call
  compiles (identical call convention to `DiscoverTab`, `ReportUserView`, etc.).
- **No dead refs:** `grep errorMessage` on the file = 0 remaining references.
- **No visual/logic change:** message preview, rows, avatars, search, cache-first
  load, the armed→sending→sent send-button states, and the forward network call
  are untouched. Only the failure branches changed.
- **No test churn:** no test references `ForwardPickerSheet`
  (`MeeshyTests`/`MeeshyUITests` = 0). `common.error.format` mapping unchanged.
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  Xcode build runs in CI. Confirm `iOS Tests` is green before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `ForwardPickerSheet.conversationRow` — the row's `MeeshyAvatar` is a separate
  VoiceOver element from the combined title/type text; a `.combine` over the
  whole row (avatar + text) would read as one utterance before the send button.
  Deferred (avatar carries its own mood-tap handler → non-trivial grouping).
- `attachmentThumbnail` in the message preview has no `.accessibilityLabel`
  (decorative-ish; low priority).

**Status: RESOLVED for `ForwardPickerSheet` swallowed-error feedback.**
