# Iteration-167i — MessageEditsDetailView i18n + VoiceOver

**Date:** 2026-07-18
**Scope:** iOS only
**Component:** `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageEditsDetailView.swift`
**Type:** Localization (i18n) + Accessibility (VoiceOver)

## Context

`MessageEditsDetailView` is the "Edit history" tab of the message detail sheet
(extracted from the legacy `MessageDetailSheet.editsTabContent`). It shows the
current message content plus its previous revisions on a timeline. It is a
sibling of the in-flight MessageDetail a11y series (144i Views, 155i Reactions,
160i Forward, 166i Transcription).

Unlike its already-polished siblings, this view still shipped **hardcoded French
string literals** — a direct localization defect: French-only users saw correct
text, but no other locale could ever translate these labels.

## Findings (before)

### i18n (primary)
Six user-facing strings were raw French literals with **no** `String(localized:)`:

| Literal | Location |
|---------|----------|
| `"Aucune modification"` / `"Historique"` | banner title |
| `"Ce message n'a pas ete modifie"` | empty banner detail |
| `"N version(s) precedente(s)"` (inline FR pluralization) | banner detail |
| `"L'historique des modifications apparait ici"` | empty-state placeholder |
| `"Actuel"` | current-version row header |
| `"Version N"` | revision row header |

### VoiceOver (secondary)
- Timeline banner icon exposed as an unlabeled decorative image.
- Count badge (e.g. "3") read separately, duplicating the "3 versions
  précédentes" detail already announced.
- Revision rows read as 3 separate fragments (header / timestamp / content).
- Empty-state icon exposed; container not combined.

### Dynamic Type
Already correct — semantic fonts throughout (`.footnote`, `.caption2`,
`.subheadline`, `.system(.caption, design: .monospaced)`); the lone
`.system(size: 28)` is a fixed decorative empty-state glyph.

## Fix

- Route all six literals through `String(localized:defaultValue:bundle:)`,
  **preserving the exact current French text** as `defaultValue` → French
  rendering is byte-identical (zero visible/snapshot change), while the strings
  become translatable. New key namespace `edits.*`.
- Pluralization: the app has **no** `.stringsdict`; it selects singular/plural
  keys inline (cf. existing `forward.members-count` style). A small
  `revisionCountLabel(_:)` helper picks `edits.history.detail.one` /
  `edits.history.detail.other` by count.
- VoiceOver: hide the decorative banner icon, empty-state glyph, and the
  redundant count badge; `.accessibilityElement(children: .combine)` on the
  banner, each revision row, and the empty-state container → one coherent
  announcement each.

## New i18n keys (7)

`edits.empty.title`, `edits.history.title`, `edits.empty.detail`,
`edits.history.detail.one`, `edits.history.detail.other`,
`edits.empty.placeholder`, `edits.current`, `edits.version`.
All carry the original French as `defaultValue` (ASCII-exact, no accent drift).

## Constraints respected

- **1 file, 0 logic/layout/networking change** — pure string routing + a11y annotations.
- **French output unchanged** (defaultValue == prior literal).
- **0 new tests** — no new testable behavior (string selection is trivial;
  rendering identical in the base locale).

## Verification status

- Static review: `String(format:%d)` args are `Int` (counts); French defaults
  match prior literals exactly. ✅
- No open-PR contention: `MessageEditsDetailView` is not touched by any open PR
  (siblings Transcription 166i / StatsTimelineChart 165i are separate files). ✅
- Swift compile / `ios-tests` CI: gated on the PR (no local macOS toolchain). ⏳

## Remaining / follow-ups

- `MessageDetailSheet` legacy inline copies (`editsTabContent` etc.) may carry
  the same hardcoded-string gap — candidate for a sweep if still live.
- Proper accented French could later replace the ASCII `defaultValue`s once a
  translator pass is done (deliberately deferred to keep this change zero-diff
  in the base locale).
