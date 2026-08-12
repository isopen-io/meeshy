# Plan — Iteration-178i — `CategoryPickerView` i18n + VoiceOver + Dynamic Type

**Date:** 2026-07-20 · **Scope:** iOS only (MeeshyUI SDK primitive) · **Base:** `main` HEAD `cfc839e`

## Goal
Close the localization, VoiceOver, and Dynamic Type gaps on the conversation
category selector/creator without touching layout, colors, or behavior.

## Steps
1. [x] Localize the 3 hardcoded French strings via
   `String(localized:defaultValue:bundle:.module)` (the MeeshyUI idiom):
   TextField placeholder, "Nouvelle catégorie" button, + a new create-confirm
   a11y label.
2. [x] VoiceOver: add `.accessibilityLabel` to the icon-only create-confirm
   button (`checkmark.circle.fill`) — previously mute.
3. [x] VoiceOver: add conditional `.accessibilityAddTraits(.isSelected)` to the
   category row so the selected state is announced (was color/icon-only, WCAG
   1.4.1).
4. [x] Mark the 3 decorative SF Symbols (`folder.fill`, `checkmark`,
   `folder.badge.plus`, `plus.circle.fill`) `.accessibilityHidden(true)`.
5. [x] Dynamic Type: migrate 7 `.font(.system(size:))` → `MeeshyFont.relative`
   (none are in fixed frames — mechanical swap, weight preserved).
6. [ ] Push branch, open PR, confirm `iOS Tests` green, merge, update tracking.

## Non-goals
- No `.xcstrings` catalog edit (code-only `defaultValue` doctrine, parité 164i).
- No logic / layout / color / animation change.
- No change to sibling `CategoryPickerField.swift` (separate future candidate).
