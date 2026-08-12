# Plan — Iteration 208i — `MessageViewsDetailView.deliveryBadge` i18n + VoiceOver

## Goal
Remove the last un-localized surface in `MessageViewsDetailView.swift`: the
delivery-status pill (`deliveryBadge`) rendered five hardcoded, non-accented
French literals. Localize by reusing the canonical `bubble.delivery.*` SSOT
keys, and group the badge for VoiceOver.

## Steps
1. Replace the five `label = "…"` literals in `deliveryBadge(accent:)` with
   `String(localized: "bubble.delivery.{read,delivered,sent,sending,failed}",
   defaultValue:, bundle: .main)` — the exact keys/defaults already shipped by
   `BubbleDeliveryCheck.swift` (0 new keys).
2. Add `.accessibilityElement(children: .combine)` on the badge `HStack` so
   the decorative SF Symbol + status text read as one VoiceOver element.
3. Docs: analysis + this plan + `branch-tracking.md` pointer.

## Constraints
- iOS-only. 1 code file. 0 logic / 0 network / 0 new i18n key / 0 xcstrings
  churn / 0 new test.
- Do **not** touch `MessageDetailSheet.swift` (twin badge — in flight across
  open PRs #2178/#2181/#2182/#2185).

## Gate
CI `iOS Tests` (no Swift toolchain on Linux authoring host).
