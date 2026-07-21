# Iteration 208i — `MessageViewsDetailView.deliveryBadge` i18n + VoiceOver

**Track**: iOS UI/UX (suffix `i`). **Date**: 2026-07-21.
**Branch**: `claude/laughing-thompson-13jyn0` (from `origin/main` HEAD `22465a5`).
**File**: `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsDetailView.swift`

## Problem

`deliveryBadge(accent:)` — the delivery-status pill at the top of the message
"Views / Seen by" detail sheet — rendered its status label from **five
hardcoded, non-accented French string literals**:

| level | old literal | defect |
|---|---|---|
| 3 | `"Lu"` | not localized (en/es/de/pt-BR see French) |
| 2 | `"Distribue"` | not localized **and** missing accent (`Distribué`) |
| 1 | `"Envoye"` | not localized **and** missing accent (`Envoyé`) |
| 0 | `"Envoi..."` | not localized |
| default | `"Echec"` | not localized **and** missing accent (`Échec`) |

This was the **only** un-localized surface left in an otherwise fully
localized file (the `sendAttemptsCard`, outcome, transport, and views-count
helpers all already use `String(localized:defaultValue:)`). It broke the
i18n contract for the four non-French locales and shipped incorrect French
accents even for the base locale.

Secondary: the badge's `HStack { Image(systemName:) ; Text(label) }` had no
accessibility grouping, so the unlabeled SF Symbol could be announced as a
separate VoiceOver stop alongside the status text.

## Fix

1. **i18n via SSOT key reuse (0 new keys).** The canonical delivery-status
   labels already exist as inline build-extracted keys in
   `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleDeliveryCheck.swift`:
   `bubble.delivery.read` / `.delivered` / `.sent` / `.sending` / `.failed`.
   The badge now reuses those exact keys with their canonical `defaultValue`s
   (`Lu` / `Distribué` / `Envoyé` / `Envoi en cours` / `Échec de l'envoi`),
   eliminating a divergent hardcoded copy of labels that already had a single
   source of truth. Result: correct accents in French, full localization in
   de/en/es/pt-BR, and app-wide consistency of the delivery vocabulary.
2. **VoiceOver**: `.accessibilityElement(children: .combine)` on the badge
   `HStack` collapses the decorative icon + status text into one element
   that reads the localized status (e.g. "Distribué"), instead of a possible
   separate SF-Symbol announcement.

## Scope / risk

- **1 file**, +6 / −5 lines. 0 logic / 0 network / 0 new i18n key / 0
  `.xcstrings` edit / 0 new test.
- The keys are build-extracted by Xcode string extraction (same mechanism
  that already ships them from `BubbleDeliveryCheck.swift`) — no catalog
  churn, no reordering of existing keys.
- Visual: label text changes slightly for two states (`Envoi...` →
  `Envoi en cours`, `Echec` → `Échec de l'envoi`) so the whole app speaks
  one delivery vocabulary; the capsule auto-sizes (`.padding(.horizontal, 8)`).
  Icon, colors, layout, and `deliveryStatusLevel` semantics unchanged.
- Collision check: `list_pull_requests` / `search_pull_requests` — the only
  open PR referencing this file (#2224, 206i) modifies
  `MessageReactionsDetailView.swift` and cites `MessageViewsDetailView` only
  as prior art. This file is modified by **zero** open PRs.

## Verification

- All five `switch` branches assign `label` a `String` (unchanged type).
- Insertion of `.accessibilityElement(children: .combine)` on the returned
  `HStack` mirrors the established grouping doctrine (185i/193i).
- iOS build not runnable under Linux (no Xcode/Swift toolchain) →
  **gate = CI `iOS Tests`** (compile Xcode 26.1.1 / Swift 6.2, run sim iOS 18.2).

## Status: RESOLVED (pending CI)

**⚠️ Do not re-flag** `MessageViewsDetailView.deliveryBadge` — i18n + badge
VoiceOver grouping solved 208i.

### Follow-ups (208i+)
- `MessageDetailSheet.swift` carries a twin `deliveryBadge` (line ~1054) with
  the same class of hardcoded literals — **currently in flight** across open
  PRs #2178/#2181/#2182/#2185, so deferred until that swarm settles.
- Other bare-count filter bars flagged by 206i: `MessageReportDetailView`,
  `MessageLanguageDetailView`, `ConversationInfoSheet` tab counters.
