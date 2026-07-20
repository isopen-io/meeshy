# Iteration-169i — Localization + VoiceOver for `MessageEditsDetailView`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Localization (i18n) + Accessibility (VoiceOver) — message edit-history detail tab
**File touched:** `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageEditsDetailView.swift` (1 file, 0 logic, 0 new test)

## Component

`MessageEditsDetailView` renders the "Edit history" tab of the message
detail sheet (extracted from the legacy `MessageDetailSheet.editsTabContent`).
It shows:
- a **timeline banner** summarizing the history ("Historique — 3 versions
  précédentes" + a count badge), or an empty variant ("Aucune modification"),
- the **current** (post-edit) content as an anchor row,
- one **revision row** per prior version (header "Version N", timestamp,
  content), each with a colored vertical bar indicating current vs. past,
- an **empty-state** hint when there is no history.

Revisions are injected via `editRevisions: [EditRevision]` (no network state,
no behavior). It has zero test coverage.

## Findings

Two gaps, both matching the pattern fixed in sibling views this track already
addressed (`MessageReactionsDetailView`, `MessageForwardDetailView`,
`AttachmentLoadingTile`, `UploadProgressBar`):

1. **Hardcoded, unlocalized French string literals** flowing straight into
   `Text(...)` — the only strings in the file bypassing the codebase's inline
   `String(localized:defaultValue:bundle:)` idiom:
   - `"Aucune modification"` / `"Historique"` (banner title, line 24)
   - `"Ce message n'a pas ete modifie"` and
     `"\(count) version(s) precedente(s)"` (banner detail, line 25)
   - `"L'historique des modifications apparait ici"` (empty hint, line 33)
   - `"Actuel"` (current-version header, line 41)
   - `"Version \(n)"` (revision header, line 50)

   Every sibling in the same `MessageDetail/` folder already uses
   `String(localized:)`; this view shipped raw French literals.

2. **Zero accessibility modifiers in the whole file** (`grep accessibility`
   = 0 hits). Two concrete consequences:
   - The **current-vs-past distinction is encoded purely by color** — the
     vertical bar is `accent` at full opacity for the current row and
     `accent.opacity(0.4)` for prior revisions. A VoiceOver user (or anyone
     who can't perceive the opacity delta) has no way to tell them apart from
     the bar. (The header text "Actuel" / "Version N" does carry it, but the
     row was swept as disconnected `Text` fragments with no grouping.)
   - The banner's trailing count `Capsule` badge and pencil icon were read as
     loose fragments; the count "3" announced alone is ambiguous.

## Fix

Applied the codebase's idiomatic label/value split and localized every string:

- **Localization.** Extracted six localized helpers
  (`bannerTitle`, `bannerDetail`, `emptyHintText`, `currentVersionLabel`,
  `versionLabel`, `revisionAccessibilityValue`), each using
  `String(localized: "message-detail.edits.*", defaultValue: "<FR>", bundle: .main)`.
  Plural handling for the banner detail mirrors the existing manual
  interpolation convention (no `.stringsdict`, consistent with 167i).
- **Revision rows.** `.accessibilityElement(children: .ignore)` collapses the
  fragmented children into one element; `.accessibilityLabel(header)` carries
  the identity ("Actuel" / "Version 3" — the same distinction the color bar
  conveyed, now available to VoiceOver as text); `.accessibilityValue` carries
  the state (timestamp + content). The decorative color bar is
  `.accessibilityHidden(true)` so it no longer relies on color alone.
- **Banner.** `.accessibilityElement(children: .combine)` groups the title +
  detail into one spoken phrase; `.accessibilityAddTraits(.isHeader)` marks it
  as the section header for the edits list (VoiceOver rotor navigation); the
  redundant count badge is `.accessibilityHidden(true)` (the detail phrase
  already states the count).

## Rationale

- **Never rely only on color** (HIG / a11y): the current-vs-past state now
  reaches VoiceOver through the header label, not just the bar opacity.
- **Localization-ready**: no raw French literal remains; keys follow the
  `message-detail.edits.*` namespace, auto-extracted into
  `Localizable.xcstrings` at build time (inline `defaultValue` convention —
  no catalog hand-edit, consistent with all prior iterations).
- **Dynamic Type**: unchanged — the view already used semantic fonts
  (`.footnote`, `.caption2`, `.subheadline`) that scale automatically.

## Verification

- No Xcode toolchain in this Linux CI container — verified by code review.
- `grep` confirms **no** test or SDK file references `MessageEditsDetailView`
  or the `message-detail.edits` keys → zero blast radius.
- Zero logic change: the same strings render identically in French (the
  `defaultValue`s are byte-for-byte the previous literals); only the delivery
  path (localized lookup) and the accessibility tree changed.
- Committed catalog does not carry prior-iteration keys
  (`message-detail.reactions.*`, `upload.progress.*`) → confirms the
  inline-only, build-time-extraction convention this change follows.

## Remaining improvements (out of scope for 169i)

- The banner/row helpers (`timelineBanner`, `emptyStateView`) are duplicated
  verbatim from `MessageDetailSheet` (noted in the source comment). A future
  iteration could extract them into a shared `MeeshyUI` component if a third
  consumer appears — deferred (SDK-purity grain test: they are app-side
  presentation, and only two consumers exist today).
- Timestamps use hour+minute only (`formatTimeFR`); a relative/date-aware
  format could improve clarity for older edits — deferred (parity with the
  visible label is preserved as-is).
