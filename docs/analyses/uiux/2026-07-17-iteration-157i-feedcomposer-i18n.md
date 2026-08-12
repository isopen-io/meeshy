# Iteration 157i — Localization: `FeedView+Attachments` post-composer toasts & attachment labels

**Date:** 2026-07-17
**Scope:** iOS only — `apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift`
**Axis:** Localization (i18n) + DRY / Single Source of Truth
**Branch:** `claude/laughing-thompson-5h7uia`

## Context

The parallel iOS swarm (iterations 140i→156i, PRs #1966→#2001) is saturating the
**Dynamic Type + VoiceOver** sweep axis, one view per iteration. `FeedView+Attachments`
is already largely Dynamic-Type-migrated (its residual `.font(.system(size:))` are all
intentionally-frozen decorative/chrome glyphs already carrying `.accessibilityHidden` or a
tap-frame label, per doctrine 82i). Re-sweeping it would be redundant.

A **different, un-swept, genuine defect** remains on this surface: user-facing strings that
are **not localization-ready** — hardcoded French literals passed straight to
`FeedbackToastManager`, plus two duplicated attachment-label helpers returning hardcoded
French. Several literals also carry **accent typos** ("publie", "Echec") that ship to users.

The routine mandates: *"Avoid hardcoded strings"*, *"localized strings"*, *"Every screen
must be localization-ready"*, and *"Single Source of Truth — no reimplementation"*.

## Findings

### F1 — 5 post-publish toasts hardcoded French (×2 code paths = 10 sites)
`publishPostWithAttachments` (FeedView extension) and `publishPost` /
`publishAudioFromSheet` / `publishAudioPost` (FeedComposerSheet) emit success/error toasts
via string literals — untranslatable, and the source strings themselves are wrong French:

| Original literal | Defect |
|---|---|
| `"Post en attente d'envoi"` | not localized |
| `"Post publie"` | not localized **+ missing accent** (`publié`) |
| `"Echec de la publication du post"` | not localized **+ missing accent** (`Échec`) |
| `"Post audio publie"` | not localized **+ missing accent** |
| `"Echec de la publication du post audio"` / `"Echec de la publication"` | not localized **+ accent** |

### F2 — Attachment tile labels hardcoded French, duplicated, diverging from SSOT
`feedLabelForAttachment` and `sheetLabelForAttachment` each returned hardcoded
`"Photo"` / `"Vidéo"` / `"Audio"` / `"Fichier"` / `"Position"`. The app already has a
single source of truth for attachment-type labels — the `attachment.label.*` keys used by
`ConversationView+Composer.attachmentLabel` (message composer) and `FeedCommentsSheet`.
The feed post composer reimplemented them in raw French, so a pending attachment reads
differently between a message and a post — a consistency + i18n defect.

## Fix (this iteration)

- **F1:** every toast → `String(localized: "feed.post.toast.<case>", defaultValue: <fr>, bundle: .main)`,
  matching the file's own established pattern (`feed.draft.recovered` L146, `feed.attachment.remove` L418).
  5 new source keys (source language = `fr`), all accent-corrected:
  `feed.post.toast.pendingOffline / .published / .publishError / .audioPublished / .audioPublishError`.
  The two divergent audio-error literals are unified onto one descriptive key.
- **F2:** both helpers now return the shared `attachment.label.{photo,video,audio,file,location}`
  keys with the **identical** default values the sibling `ConversationView+Composer` uses —
  no new keys, SSOT reuse, cross-surface consistency.

Keys are referenced **code-only via `defaultValue`** (the project's established convention,
`sourceLanguage: fr`) — **no `Localizable.xcstrings` edit**, no logic change, no new type,
no test change. Pure localization/DRY swap: 1 file, +23/−20.

## Verification

- iOS toolchain is macOS-only; this runs on Linux → gate is CI **`iOS Tests`** (Xcode 26.1.1 / sim 18.2).
- Static review: `String(localized:defaultValue:bundle:)` is already used ~throughout this
  file; `showSuccess`/`showError` take `String`; the reused `attachment.label.*` keys/defaults
  are copied verbatim from `ConversationView+Composer.swift:1031-1035`. Zero behavioral risk.
- `grep` confirms **0** remaining hardcoded toast/label literals in the file.

## Completion status

**RESOLVED (pending CI):** `FeedView+Attachments` post-composer strings are now
localization-ready and attachment labels reuse the app-wide SSOT.

### Deliberately NOT changed (out of scope / would add churn)
- The 6 toolbar `.accessibilityLabel(String(localized: "Ajouter une photo", …))` labels use
  the French sentence as the key. They are **already translation-ready** (stable key). Rekeying
  to dotted keys would orphan any existing translations for cosmetic gain — left as-is.
- Residual `.font(.system(size:))` are all frozen decorative/chrome glyphs (doctrine 82i/86i) —
  already correct; **do not re-flag**.
