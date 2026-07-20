# Iteration-178i — Localization + VoiceOver for the send-history card (`MessageViewsDetailView`)

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Localization (i18n) + Accessibility (VoiceOver) — message send-history card
**File touched:** `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsDetailView.swift` (1 file, 0 logic, 0 new test)

## Component

`MessageViewsDetailView` is the "Who has seen" tab of the message detail sheet,
presented from `MessageMoreSheet` (long-press a message → details). Its
**send-history card** (`sendAttemptsCard` → `sendAttemptRow` +
`sendAttemptTransportLabel`) lists the local `SendAttemptRecord` entries for a
sent message (spec `2026-07-08 message-send-failure-retry-flow`): a title, an
attempt count, the first-attempt timestamp, and one row per attempt (outcome
icon, attempt number, transport pill, optional error, monospaced time).

## Findings

The screen already localizes its sub-filter labels via the
`String(localized:defaultValue:bundle:)` idiom (English base defaults — see the
`ViewsFilter` enum). The send-history card, by contrast, shipped its copy as
**raw French literals**:

1. `Text("Historique d'envoi")` — card title.
2. `"\(count) tentative\(count > 1 ? "s" : "")"` — a **manual plural hack**. The
   `+ "s"` rule is English-shaped and wrong across locales; it is exactly the
   anti-pattern automatic grammar agreement exists to remove.
3. `label: "1ère tentative"` — first-attempt meta row.
4. `Text("Tentative \(n)")` — per-attempt row title.
5. Transport labels `"Temps réel"`, `"Repli temps réel"`, `"Re-tentative auto"`
   (`"REST"` is a proper noun, left as-is).

Accessibility on the same card:

- Each attempt row was swept by VoiceOver as disconnected fragments — the
  outcome icon, the attempt number, the transport pill, the error line, and the
  monospaced time — with no single coherent element.
- The success/failure outcome was conveyed **only** by icon color (green
  `checkmark.circle.fill` / red `xmark.circle.fill`) — a color-only channel a
  VoiceOver or color-blind user cannot perceive.

## Fix

Single file, 0 logic, 0 new test. Every key ships an inline English
`defaultValue` (matching the file's own `ViewsFilter` convention); no
`.xcstrings` catalog edit.

- Localized the 6 string sites under a new `message-detail.send-history.*` key
  family (`title`, `attempt-count`, `first-attempt`, `attempt-number`,
  `outcome.succeeded`, `outcome.failed`, `transport.realtime`,
  `transport.realtime-fallback`, `transport.auto-retry`).
- Replaced the manual plural with **automatic grammar agreement**:
  `defaultValue: "^[\(sendAttempts.count) attempt](inflect: true)"`. The runtime
  morphology engine inflects the noun for the count in the active locale — no
  `.stringsdict`, no `? "s" : ""`.
- `.accessibilityLabel` on the outcome icon ("Succeeded" / "Failed") — the
  status is now carried as text, satisfying "never rely on color alone."
- `.accessibilityElement(children: .combine)` on the attempt row — VoiceOver now
  lands one focus stop per attempt: "Succeeded, Attempt 2, Real-time, 14:03:22".

## Rationale

Localization readiness and "avoid hardcoded strings" are explicit in the i18n
review scope; this card was a raw-French island on an otherwise
localization-ready screen, and its manual plural was a latent mistranslation for
every non-English locale. The accessibility split (text-carried outcome +
combined row) is the canonical Apple pattern and removes a color-only signal —
all without touching the visual design or any behavior.

## Verification

- **Static review:** all modifiers are standard SwiftUI iOS 16+ APIs;
  `String(localized:)` automatic grammar agreement (`inflect:`) is iOS 15+.
- **No local iOS compiler** in this environment — gate is CI `ios-tests`
  (`xcodegen generate` + build-for-testing on the full file set).
- No test references `MessageViewsDetailView` (grep = 0). The single call site
  (`MessageMoreSheet:277`) is unchanged.
- Not in scope, verified sound: `formatDateTimeFR` / `formatTimeWithSecondsFR`
  use `date.formatted(.dateTime…)` = locale-aware (the `FR` suffix is a
  misnomer, not a hardcoded-locale bug); fonts already Dynamic-Type text styles.

## Status

**SOLDÉ** — send-history card fully localized + VoiceOver-coherent. Do not
revisit. The wider `MessageViewsDetailView` still carries raw French strings in
its delivery/read/media sub-sections (`deliveryBadge`, `emptyStateView` texts,
`metaInfoRow` labels "ID"/"Type"/"Source"/"Langue"/"Chiffrement"/"Pièces
jointes", "Pas encore écouté/visionné", etc.) — candidates for a follow-up
i18n iteration.
