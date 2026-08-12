# Iteration-201i — `SyncPill` VoiceOver i18n

**Date**: 2026-07-21
**Scope**: iOS only
**Surface**: `apps/ios/Meeshy/Features/Main/Components/SyncPill.swift`
**Type**: i18n gap (VoiceOver-facing hardcoded French literals)

## Context

`SyncPill` is the inline rotating status chip surfaced at the top of the main
screen by `ConnectionBanner`. It cycles through connection state, queued offline
operations, and stuck in-flight work in a single discreet capsule.

The component is already fully VoiceOver-instrumented:
`.accessibilityElement(children: .ignore)` + `.accessibilityLabel(accessibilityText)`
+ `.accessibilityHint(...)`, and all visible text runs through the entry's
`label` (built upstream). Fonts are already `MeeshyFont.relative` (Dynamic Type).

## Defect

Two — not one — hardcoded French string literals remained in the accessibility
layer, the only un-localized strings in an otherwise clean file. A VoiceOver user
in `de` / `en` / `es` / `pt-BR` heard French:

1. **`.accessibilityHint`** (line 162):
   ```swift
   .accessibilityHint(visibleEntry?.source != nil
       ? "Touchez pour ouvrir l'emplacement de l'opération."
       : "")
   ```
   Inconsistent with the app-wide `String(localized:)` convention, and directly
   below a `.accessibilityLabel(accessibilityText)` that *does* resolve through a
   localized computed property.

2. **`accessibilityText`** multi-signal branch (line 230):
   ```swift
   return "\(entries.count) signaux. Actif : \(entry.label)."
   ```
   Read to VoiceOver whenever more than one signal is queued.

## Fix

- Wrap both in `String(localized:defaultValue:bundle:.main)`, keeping the original
  French text as `defaultValue` (the catalog source language is `fr`).
- Add **2 new keys** to `apps/ios/Meeshy/Localizable.xcstrings` with all **5
  languages** (`de/en/es/fr/pt-BR`):
  - `sync.pill.a11y.openLocation.hint`
  - `sync.pill.a11y.multiple` — positional placeholders `%1$lld` / `%2$@`
    (established catalogue idiom, cf. `story.mine.row.a11y`) so translations can
    reorder count vs. label.

### Why positional placeholders

`accessibilityText` interpolates an `Int` (count) then a `String` (label). Using
`%1$lld` / `%2$@` in the catalogue lets languages that prefer "Active: X. N
signals." reorder without breaking argument binding.

## Impact

- 2 files: `SyncPill.swift` (+2/−2 net), `Localizable.xcstrings` (+70 pure
  insertions, **0 reflow** of the 1265 existing keys → 1267 total).
- 0 business logic / 0 network / 0 layout / 0 visual change / 0 new test.
- No new decorative glyphs, no selected-state changes.

## Verification

- Catalogue re-parsed as valid JSON; both keys carry all 5 language units.
- `git diff` on the catalogue shows only additions (no deletions → no reflow).
- Grep confirms no remaining hardcoded literals in `SyncPill.swift`.
- Build is not reproducible on the Linux CI host (no Swift toolchain) → the
  authoritative gate is the CI **iOS Tests** workflow (which runs
  `xcodegen generate` + compile).

## Completion

**RESOLVED (201i).** Do not re-flag `SyncPill` for i18n / VoiceOver — both
literals localized; label / hint / value are complete and fonts are already
relative.

### Remaining sibling candidates (202i+)

- `StoryViewerView+Content.swift:156` — `"Video de la story"` / `"Image de la
  story"` hardcoded on an a11y label (large file, decorative background layer).
- Other `accessibilityHint` / `accessibilityLabel` French literals not routed
  through `String(localized:)` (grep excluding `String(localized`).
