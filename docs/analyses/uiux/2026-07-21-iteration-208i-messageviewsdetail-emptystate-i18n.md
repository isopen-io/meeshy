# Iteration-208i — `MessageViewsDetailView` empty-state i18n

**Date**: 2026-07-21
**Track**: iOS (suffix `i`)
**Type**: Localization (i18n) — remove hardcoded strings
**Branch**: `claude/laughing-thompson-hycbxw`
**Base**: `main` HEAD (resynced; prior already-merged content discarded)
**Scope**: 1 file — `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsDetailView.swift`

## Problem
`MessageViewsDetailView` (the "Détails / Vues" tab of `MessageMoreSheet` — delivery
receipts, read receipts, attachment sub-lists) rendered **five empty-state messages as
hardcoded French string literals** passed directly to the local `emptyStateView(icon:text:accent:)`
helper:

| Line | Section | Literal |
|------|---------|---------|
| 488 | Delivery receipts empty | `"Aucune confirmation de distribution"` |
| 524 | Read receipts empty | `"Personne n'a lu ce message"` |
| 561 | Unseen list empty | `"Tout le monde a recu le message"` |
| 607 | Audio attachment empty | `"Aucun audio attache"` |
| 631 | Video attachment empty | `"Aucune video attachee"` |

These were the only **un-extractable** strings in the empty-state family. The direct
sibling `MessageEditsDetailView` already localizes its empty state via
`String(localized: "message-detail.edits.empty", …)` — this screen was the odd one out.
Hardcoded literals are invisible to the string-extraction pipeline, so they can never be
translated (violates the routine's "Avoid hardcoded strings" mandate and the app's
localization-ready requirement).

## Fix
Wrapped each literal in the project's established inline localization form, reusing the
in-file `message-detail.views.*` key namespace (siblings `…views.read`, `…views.not-seen`,
`…views.delivered` already exist):

```swift
text: String(localized: "message-detail.views.delivered.empty",
             defaultValue: "Aucune confirmation de distribution", bundle: .main)
```

New keys (5): `message-detail.views.{delivered,read,not-seen,audio,video}.empty`.

- **`defaultValue` = the exact prior French literal** → because the String Catalog holds
  no entry for these keys, `String(localized:defaultValue:)` returns the defaultValue
  verbatim → **zero visible-text change** in the current build, while the strings become
  extractable for translation. Matches the app-wide + `sourceLanguage: "fr"` convention
  (e.g. `forward.empty` = "Aucune conversation" in the sibling `MessageForwardDetailView`).
- The `emptyStateView(text: String)` helper is unchanged — it already takes a `String`, so
  passing the localized result is type-identical.

## Non-goals / deliberately untouched
- **Fixed 28pt empty-state glyph** — kept (doctrine 74i/86i: decorative illustration glyph,
  parity across the `MessageViewsDetailView` / `MessageEditsDetailView` /
  `MessageReactionsDetailView` family; the shared `EmptyStateView` primitive was **not**
  substituted because its `maxHeight: .infinity` + Spacers would change this inline block's
  layout — out of a zero-visual i18n pass).
- **`timelineBanner` "Pas encore vu" + manual plural `detail:`** (line ~565) — left as-is:
  it involves count pluralization (the `inflect`/explicit-plural area guarded by
  `ExplicitPluralLabelTests` + #2165), a separate concern from empty-state wrapping.
- **Meta-info tab labels** ("ID", "Type", "Source", "Langue", "Chiffrement", "Oui/Non",
  "Modifie", "Pieces jointes", "Transfere de", "Conversation", "Reponse a") — a larger,
  distinct i18n surface; **deferred** to keep 1 coherent surface/iteration.

## Verification
- Grep guard: 0 remaining `emptyStateView(… text: "…")` hardcoded literals in the file;
  all 5 call sites now route through `String(localized:)`. `emptyStateView` helper signature
  unchanged; type-checks by inspection (`String` in → `String` param).
- 0 logic / 0 network / 0 layout / 0 visual change; behavior-neutral (same French text
  displayed). No new test added — consistent with prior i18n-only iterations (e.g. 184i,
  "0 test neuf"); existing `ExplicitPluralLabelTests` (which exercises this file's
  `sendAttemptCountLabel`) remains valid.
- No String Catalog edit (inline-only convention, per swarm doctrine "0 xcstrings").
- **Collision check**: `list_pull_requests` (18 open) — no open PR modifies
  `MessageViewsDetailView.swift`. Last merges to the file: 195i (`df9657f`) + #2165 plural
  fix — both landed; this change is orthogonal (empty-state text vs filter capsules/plurals).
- Gate = CI `iOS Tests` (iOS cannot be compiled in this Linux routine environment).

## Status
✅ Resolved. Do not re-flag `MessageViewsDetailView`'s 5 empty-state strings — now
extractable via `message-detail.views.*.empty`.

### Remaining / adjacent (defer, 1/iteration, collision-check first)
- `MessageViewsDetailView` meta-info tab labels (ID/Type/Source/Langue/Chiffrement/…) —
  hardcoded French; larger i18n surface.
- `MessageViewsDetailView` tab-label `defaultValue`s are **English** ("Read", "Not seen",
  "Sent", …) whereas the app source language is `fr` and the empty states are French — a
  pre-existing intra-file EN/FR `defaultValue` inconsistency worth a dedicated normalization
  pass (decide one source language and align).
- Same empty-state i18n pattern likely applies to other `MessageDetail/*DetailView`
  siblings — audit `MessageReactionsDetailView`, `MessageForwardDetailView` for hardcoded
  literals (the latter's `forward.empty` is already localized).
