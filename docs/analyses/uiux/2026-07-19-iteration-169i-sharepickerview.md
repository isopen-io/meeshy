# Iteration-169i — `SharePickerView` VoiceOver loading states + native search polish

**Date**: 2026-07-19
**Surface**: `apps/ios/Meeshy/Features/Main/Views/SharePickerView.swift`
**Scope**: iOS only — accessibility (VoiceOver) + native platform polish. Single file.

## Context

`SharePickerView` is the "Partager avec…" sheet reached when forwarding a
message, sharing a URL/text/image, or re-sharing a story to a conversation.
390 lines, only 8 `accessibility*` references before this pass — thin coverage
for a flow that a VoiceOver user drives entirely by feedback.

Dynamic Type was already solved (the two `.font(.system(size: 26))` glyphs are
deliberately-frozen control-sized action glyphs — documented in-file, doctrine
74i/86i). This pass does **not** touch them.

## Findings

| # | Issue | Severity | HIG / rule |
|---|-------|----------|-----------|
| F1 | The full-screen `loadingState` `ProgressView` has **no `accessibilityLabel`** — VoiceOver announces nothing while conversations load. Loading perception is invisible to non-sighted users. | P1 | "Use `.accessibilityValue()`/label for stateful controls"; loading feedback |
| F2 | The in-row **sending** `ProgressView` (per-conversation, while a share is in flight) has **no `accessibilityLabel`** — the row silently shows a spinner. The adjacent "sent" checkmark IS labelled (`share.sent`), so the sending state is the only unlabelled leg of the 3-state control. | P1 | Never rely on a mute spinner to convey progress |
| F3 | The send button's VoiceOver label uses `conv.name`, but the row **displays** `conv.displayName`. For direct conversations these can differ → VoiceOver announces a different name than what is shown. | P2 | Consistency; clarity at point of use |
| F4 | The custom search `TextField` has no `.submitLabel(.search)` — the keyboard return key reads "return" instead of the native "Search" affordance used elsewhere (`GlobalSearchView`, `ConversationView+MessageRow`). | P3 | Prefer native system affordances |

Non-findings (deliberately left):
- `.system(size: 26)` action glyphs — frozen control size (documented).
- `contentPreviewBanner`, `shareRow` text group — already `.accessibilityElement(children: .combine)`.
- Custom search field vs `.searchable()` — the content-preview banner sits above the
  field; hoisting search into the nav bar would displace the banner. Out of scope
  (larger refactor, changes layout). Kept custom field, added native return key only.

## Fixes applied

- **F1** — `loadingState` `ProgressView` → `.accessibilityLabel("share.loading")`
  ("Chargement des conversations…").
- **F2** — in-row sending `ProgressView` → `.accessibilityLabel("share.sending")`
  ("Envoi en cours…").
- **F3** — send button label now interpolates `conv.displayName` (matches the row title).
- **F4** — search `TextField` → `.submitLabel(.search)`.

3 code-only i18n keys added via `String(localized:defaultValue:bundle:.main)`
(auto-extracted, 0 `.xcstrings` edits — parity with 162i/164i conventions):
`share.loading`, `share.sending`. (`share.sent` already existed.)

1 file, 0 logic change, 0 visual change, 0 network, 0 new test.
`SharePickerViewModelTests` exercises the ViewModel (untouched) → 0 regression.

Gate = CI `iOS Tests`.

## Verification status

- ⏳ CI `iOS Tests` (compile + suites)
- Manual reasoning: labels are additive modifiers on existing views; no state,
  layout, or control-flow change.
