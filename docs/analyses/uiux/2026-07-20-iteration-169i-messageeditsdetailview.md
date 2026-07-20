# Iteration-169i — Localization + VoiceOver for `MessageEditsDetailView`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Localization (i18n) + Accessibility (VoiceOver) — message edit-history detail panel
**File touched:** `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageEditsDetailView.swift` (1 file, 0 logic, 0 new test)

## Component

`MessageEditsDetailView` is the reusable edit-history panel extracted from the
old `MessageDetailSheet.editsTabContent`. It is presented from
`MessageMoreSheet.swift:286` (the message "more" / detail sheet). It renders a
timeline banner (edit count), the current post-edit version as an anchor, the
chronological previous revisions below it, or an empty state when the message
was never edited. Revisions are injected via `editRevisions` — no network
state, no behavior of its own.

## Findings

The Explore pass over `MessageDetail/` confirmed the codebase is otherwise
strongly localized (nearly everything uses `String(localized:defaultValue:
bundle:)`). This view was the cleanest moderate-size offender exhibiting BOTH
gaps at once:

1. **6 hardcoded, unlocalized French literals.** Every user-facing string was a
   raw literal passed into the banner/row/empty-state builders — bypassing the
   codebase's inline `String(localized:defaultValue:bundle:)` idiom, and shipped
   without accents (`"Ce message n'a pas ete modifie"`, `"apparait"`,
   `"precedente"`):
   - banner title `"Aucune modification"` / `"Historique"`
   - banner detail `"Ce message n'a pas ete modifie"` / the inline-pluralized
     `"N version(s) precedente(s)"`
   - empty state `"L'historique des modifications apparait ici"`
   - row headers `"Actuel"` and `"Version N"`

2. **Zero accessibility.** The view had no `.accessibilityElement` /
   `.accessibilityLabel` / `.accessibilityValue` anywhere. VoiceOver swept:
   - the **banner** as disconnected fragments — the decorative
     `pencil.and.list.clipboard` icon, the title, the detail line, and the count
     capsule (edit count conveyed **only** by the capsule badge, a visual-only
     channel);
   - each **timeline row** as fragments — a decorative accent bar, the header,
     the timestamp, and the content, with no single element carrying "which
     revision, when, what text";
   - the **empty state** icon + text ungrouped.

## Fix

Applied the idiomatic Apple label/value split (same shape as 167i
`UploadProgressBar` and 159i `AttachmentLoadingTile`) and localized every
string:

- **Localization:** seven `String(localized: "message.edits.*", defaultValue:
  …, bundle: .main)` helpers replace the 6 literals, with proper accents in the
  French defaults. The FR plural stays inline in the `defaultValue`
  (`version\(count > 1 ? "s" : "")`), matching the 167i precedent — no
  `.xcstrings` catalog edit.
- **Banner:** `.accessibilityElement(children: .ignore)` +
  `.accessibilityLabel(text)` (the title — "Historique" / "Aucune
  modification") + `.accessibilityValue(detail)` (the phrase already carrying
  the count — "3 versions précédentes"). The decorative icon is
  `.accessibilityHidden(true)`.
- **Each timeline row:** `.accessibilityElement(children: .ignore)` +
  `.accessibilityLabel(header)` ("Actuel" / "Version 2") +
  `.accessibilityValue(…)` (time + content — "14:32, {message text}"), so
  VoiceOver reads one coherent revision per swipe instead of four fragments.
- **Empty state:** `.accessibilityElement(children: .combine)` with the
  decorative icon `.accessibilityHidden(true)`.

## Verification

- **Layout / visual identity:** untouched — no font, spacing, timeline, capsule,
  or accent-color change. All text was already Dynamic Type
  (`.caption2` / `.footnote` / `.subheadline` / `.system(.caption)`); the only
  fixed size is the decorative 28pt empty-state glyph (now a11y-hidden).
- **Call site:** `MessageMoreSheet.swift:286` unchanged — the
  `(message:editRevisions:)` signature is identical.
- **Tests:** grep confirms no test references the view (0 hits in
  `MeeshyTests/`); no behavior to test — the change is presentation-only.
- **Key collisions:** grep confirms `message.edits.*` keys are new (0 prior
  uses).

## Remaining improvements (future iterations)
- `MessageViewsDetailView.swift` (~997 lines) — ~11 raw French literals
  (`"Historique d'envoi"`, `"Type"`, `"Source"`, `"Langue"`, `"Chiffrement"`,
  `"Tentative N"`…) + no a11y on the filter chips / success-failure status
  icons. Better as a focused pass on one section (e.g. `sendAttemptsCard`).
- `MessageLanguageDetailView.swift` / `MessageTranscriptionDetailView.swift` —
  fully localized but a11y=0 on interactive `Button`s + status icons.
- `MessageReportDetailView.swift` — fully localized but a11y=0 on the report-type
  rows, submit button, and details `TextField`.

## Status
**RESOLVED** — `MessageEditsDetailView` is now fully localization-ready
(`message.edits.*`, inline French defaults) and VoiceOver-coherent (banner, each
revision row, and empty state each read as one labelled element). No further
work needed on this component.
