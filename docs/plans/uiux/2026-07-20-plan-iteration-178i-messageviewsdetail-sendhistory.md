# Plan — Iteration-178i — Localize + VoiceOver for the send-history card (`MessageViewsDetailView`)

**Date:** 2026-07-20
**Scope:** iOS only
**Base:** `main` HEAD `3c4d772`
**Working branch:** `claude/laughing-thompson-4hn4bq`

## Target

`MessageViewsDetailView` — the "Who has seen" tab of the message detail sheet
(`MessageMoreSheet` → `MessageViewsDetailView`). Within it, the **send-history
card** (`sendAttemptsCard` / `sendAttemptRow` / `sendAttemptTransportLabel`)
renders the local `SendAttemptRecord` list (spec `message-send-failure-retry-flow`).

## Findings

The screen already uses the `String(localized:defaultValue:bundle:)` idiom for
its sub-filter labels (English base defaults). The send-history card, however,
shipped its user-facing copy as **raw French literals**, bypassing that idiom:

1. `Text("Historique d'envoi")` — card title, not localized.
2. `"\(count) tentative\(count > 1 ? "s" : "")"` — a manual plural hack (an
   i18n anti-pattern; the `+ "s"` rule is English-shaped and wrong for most
   locales).
3. `label: "1ère tentative"` — first-attempt meta row, not localized.
4. `Text("Tentative \(n)")` — per-attempt row title, not localized.
5. Transport labels `"Temps réel"`, `"Repli temps réel"`, `"Re-tentative auto"`
   — not localized (`"REST"` is a proper noun, kept as-is).

Accessibility gaps on the same card:
- Each attempt row swept as fragmented VoiceOver stops (icon, attempt number,
  transport pill, error, monospaced time).
- Outcome was conveyed **only** by icon color (green check / red cross) — a
  color-only channel, violating "never rely on color alone."

Not in scope (verified sound): the `*FR` date helpers use
`date.formatted(.dateTime…)`, which is **locale-aware** (device locale) — the
`FR` suffix is a misnomer, not a hardcoded-locale bug. Left untouched (rename
would churn call sites for zero behavior change). Fonts already use Dynamic
Type text styles (`.caption`, `.caption2, design: .monospaced`).

## Change

Single file, 0 logic, 0 new test. All keys use inline English `defaultValue`
(matching the file's own `ViewsFilter` convention) — no `.xcstrings` edit.

- Localize the 6 string sites above under the `message-detail.send-history.*`
  key family.
- Replace the manual plural with automatic grammar agreement:
  `^[\(count) attempt](inflect: true)` — the morphology engine inflects
  "attempt"/"attempts" (and the translated noun) at runtime, no `.stringsdict`.
- `.accessibilityLabel` on the outcome icon ("Succeeded" / "Failed") — carries
  the status as text, not color.
- `.accessibilityElement(children: .combine)` on the attempt row — one focus
  stop reading "Succeeded/Failed, Attempt N, <transport>, <error>, <time>".

## Verification

- Static review: all APIs are standard SwiftUI iOS 16+ (`String(localized:)`
  automatic grammar agreement is iOS 15+). No compiler available in this
  environment; gate is CI `ios-tests`.
- No test references `MessageViewsDetailView` (grep = 0). Single call site
  (`MessageMoreSheet`) unchanged.
