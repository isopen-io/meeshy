# Iteration-195i — VoiceOver labels for `DownloadBadgeView` media controls

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — icon-only interactive controls without labels
**Files touched:** `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift` (+4 lines), `apps/ios/Meeshy/Localizable.xcstrings` (+2 keys × 5 locales) — 0 logic, 0 visual change, 0 new test

## Component

`DownloadBadgeView` renders the download affordance overlaid on an
image/video attachment whose bytes have not yet arrived (auto-download
gated by `MediaDownloadPolicyEngine`). It has three states:

- `idleBadge` — a `Button` (SF Symbol `arrow.down.to.line` + optional
  file-size pill) that **starts the download**. Per `apps/ios/CLAUDE.md`
  ("Attachment Size Display Before Download") this badge is the **only**
  affordance to fetch the media for image/video cells.
- `downloadingBadge` — a `Button` (progress ring + percentage + a
  `"410 KB / 850 KB"` byte label) that **cancels the in-flight download**.
- cached → `EmptyView` (no control).

## Findings

Both interactive `Button`s were **icon/shape-only with no
`.accessibilityLabel`**, so VoiceOver never announced the action:

1. `idleBadge` (line ~85): the `Button` label is a symbol + a size
   `Text`. SwiftUI's default combine exposed only the visible text, so
   VoiceOver read **"850 KB, button"** — the byte size, never
   *"Download"*. A blind user reaching the disc over undownloaded media
   hears a bare number and cannot tell the control fetches the file. This
   is the sole fetch affordance, so the media was effectively
   **unreachable** via VoiceOver.

2. `downloadingBadge` (line ~153): the `Button` label is a progress ring
   + a monospaced `"KB / KB"` `Text`. VoiceOver read only that byte
   string, never *"Cancel download"* — a user could not discover that
   activating it aborts the transfer.

Verified the three call sites in
`Bubble/BubbleStandardLayout+Media.swift` (lines 155, 483, 881) do **not**
wrap the badge with a label on any parent, so no label existed anywhere in
the tree. This is a **WCAG 4.1.2 (Name/Role/Value)** failure and matches
the doctrine rule "Every `Button`, `Image`, and custom interactive element
MUST have `.accessibilityLabel()`". The spot is flagged **P0** in the
internal `apps/ios/Documentation/ACCESSIBILITY_AUDIT.md` (line 392) with no
remediation yet.

## Fix

Mirror the proven sibling `ShareLinkDetailView.swift:132`
(`.accessibilityLabel(label)` on an icon action button):

1. `idleBadge` → `.accessibilityLabel("Télécharger")` +
   `.accessibilityValue(totalSizeText)`. The explicit label replaces the
   flattened child text with the **action**, while the size is preserved
   as the element's **value** — VoiceOver now reads *"Télécharger,
   850 Ko, bouton"*. When `totalSizeText` is empty (`fileSize == 0`) the
   value is `""` → nothing extra announced, matching the visual (no pill).
2. `downloadingBadge` → `.accessibilityLabel("Annuler le
   téléchargement")` + `.accessibilityValue(downloader.progress
   .formatted(.percent))`. VoiceOver now reads *"Annuler le
   téléchargement, 50 %, bouton"*; the value re-reads on each progress
   change (computed `progress` → body re-eval). `.formatted(.percent)` is
   locale-aware, so **no new key** is needed for the value.

Both values are runtime `String`s, so `.accessibilityValue` binds to the
`StringProtocol` overload (no unintended key-localization of `"850 KB"`).

Two new i18n keys added, fully localized in all 5 catalog locales
(de/en/es/fr/pt-BR, source `fr`):
- `a11y.media.download.action` → Télécharger / Download / Herunterladen /
  Descargar / Baixar
- `a11y.media.download.cancel` → Annuler le téléchargement / Cancel
  download / Download abbrechen / Cancelar descarga / Cancelar download

## Constraints honoured

- **0 logic change** — no download/cancel/progress/layout code touched;
  purely additive accessibility modifiers.
- **0 visual change** — the on-screen badge is byte-for-byte identical;
  only the accessibility tree changed.
- **0 new test** — no test references the view; behaviour is unchanged.
- **2 new i18n keys** — unavoidable (no generic "Download" verb key
  existed); both fully translated across all 5 locales, so no
  untranslated fallback ships.

## Verification

- Build not runnable in this Linux CI container (no Xcode). Change is four
  standard SwiftUI accessibility modifiers plus two catalog entries.
- `Localizable.xcstrings` re-parsed as valid JSON after the edit; both
  keys present with all 5 locales; diff is purely additive (+70 lines, 0
  deletions) with no reordering of existing keys.
- Signature parity: `String(localized:defaultValue:bundle:)` matches the
  in-file sibling usage in `ShareLinkDetailView.swift:140`.
- Gate = CI `iOS Tests`.

## Status

**RESOLVED.** `DownloadBadgeView`'s download and cancel buttons now expose
their action to VoiceOver with a meaningful value (size / progress). Do
not reintroduce a bare icon-only `Button` here without
`.accessibilityLabel`. Update `ACCESSIBILITY_AUDIT.md` line 392 (P0) as
addressed on next audit sweep.

### Remaining candidates (distinct files — verify contention first)
- `CameraView` capture buttons (`photoButton` line ~169,
  `videoRecordButton` line ~185) — pure-shape labels, no
  `.accessibilityLabel`; `videoRecordButton` also needs
  `.accessibilityValue` for its record/idle state. Caveat: file shows
  in-progress a11y work on its top bar — verify no open PR first.
- `CameraView.modeTab` (line ~152) — Photo/Video selector signals
  selection by weight/opacity only (Pattern 2); no `.isSelected` sibling
  exists app-wide yet.
