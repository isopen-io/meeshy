# Plan — Iteration-195i — Siri snippet views (i18n + tokens + VoiceOver)

**Date:** 2026-07-20 · **Scope:** iOS only · **Base:** `main` HEAD `98ecd36` (194i #2174)
**Working branch:** `claude/laughing-thompson-1lwf1p` · **Iteration:** 195i (strictly > 194i in flight)

## Target
`apps/ios/Meeshy/Features/Intents/MeeshyAppIntents.swift` — `NotificationCheckView` +
`SiriTipsView` (Siri/Shortcuts result snippets). Absent from every open PR (checked
`list_pull_requests`, ~40 open) → 0 swarm collision.

## Steps
1. [x] Reset working branch from latest `main` (`98ecd36`).
2. [x] Scout the app for the cleanest isolated win (Explore agent) → Siri snippet file.
3. [x] `import MeeshyUI`.
4. [x] i18n: 5 hardcoded literals → `String(localized:defaultValue:bundle:)`
   (keys `siri.notifications.unreadCount`, `siri.tips.header`, `siri.tip.sendMessage`,
   `siri.tip.call`, `siri.tip.translate`, `siri.tip.checkNotifications`).
5. [x] Tokens: `.blue→info`, `.green→success`, `.purple→purple600`, `.orange→warning`
   (hue-preserving; 4 distinct tip accents kept).
6. [x] a11y: `.accessibilityElement(children: .combine)` on unread header + each tip row;
   `.accessibilityHidden(true)` on decorative tip SF Symbol.
7. [x] Analysis doc + this plan.
8. [ ] Commit + push + open PR. Gate = CI `iOS Tests`.

## Constraints honored
0 logic · 0 network · 0 layout/visual-hue change · 0 SDK change · 0 new test · no
hand-edit of `Localizable.xcstrings` (Xcode extracts at build; `defaultValue` = fallback).
`AppShortcut` phrases untouched (already framework-localized).

## Review
Pure consolidation onto existing SoT (`String(localized:)`, `MeeshyColors`,
VoiceOver grouping). See analysis doc `2026-07-20-iteration-195i-meeshyappintents-siri.md`
for full rationale, verification status, and deferred follow-ups (OnboardingStepViews
demo strings, AboutView raw hex accents).
