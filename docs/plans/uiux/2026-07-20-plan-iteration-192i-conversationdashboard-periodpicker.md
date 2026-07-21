# Plan — Iteration-192i — `ConversationDashboardView` period picker (i18n + VoiceOver)

**Date:** 2026-07-20
**Scope:** iOS only
**Working branch:** `claude/laughing-thompson-lbtam1`
**Base:** latest `origin/main`

## Problem

`ConversationDashboardView.ChartPeriod` (activity chart range selector) had two
defects, both surfaced as *Remaining improvements* in the 184i analysis:

1. **i18n bug** — the enum raw values (`"7j"`, `"30j"`, `"Tout"`) were rendered
   directly as UI text via `Text(period.rawValue)`. `"Tout"` is hardcoded
   French; `"7j"`/`"30j"` are French-flavoured abbreviations (`j` = *jours*).
   The rest of the file already localizes every visible string via
   `String(localized:)`, so the picker was the lone violation.
2. **a11y — no selected state** — each pill signalled selection only through
   foreground color + font weight + capsule fill. No
   `.accessibilityAddTraits(.isSelected)`, and VoiceOver read the cryptic
   compact glyph (`"7j"`) with no descriptive label (WCAG 1.4.1 Use of Color).

## Fix

- Drop the display-facing French raw values; add two localized computed
  properties on `ChartPeriod`:
  - `shortLabel` — compact localized pill text (`7j`/`7d`/`7T`, `Tout`/`All`/…).
  - `accessibilityLabel` — descriptive localized VoiceOver label
    (`7 derniers jours` / `Last 7 days` / …).
- `periodPicker`: render `period.shortLabel`, add
  `.accessibilityLabel(period.accessibilityLabel)` and
  `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` on each pill Button.
- 6 new `Localizable.xcstrings` keys (fr/en/es/de/pt-BR).

## Non-goals

- No visual change — pill layout, capsule, colors, spring animation, haptics all
  preserved. `shortLabel` in each locale keeps the compact 2–4 char footprint.
- No logic change — `chartPeriod` switch sites (`.week`/`.month`/`.all`) untouched.

## Verification

- Source-level guard tests added to
  `ConversationDashboardViewAccessibilityTests.swift`.
- CI gate: `iOS Tests` (macOS runner).
