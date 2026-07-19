# Plan — Iteration-176i — `StatusComposerView` VoiceOver selection traits

**Date:** 2026-07-19 · **Scope:** iOS only · **Base:** `main` HEAD `e7c8686`

## Goal
Make the mood-emoji grid and the visibility-audience rail announce their
selected state to VoiceOver, so the composer's two core choices are no longer
conveyed by color/fill alone — without touching layout, animation, or the
Indigo visual identity.

## Steps
1. [x] Add `.accessibilityAddTraits(selectedEmoji == emoji ? .isSelected : [])`
   to `emojiButton(_:)` — native emoji name preserved as the label.
2. [x] Add `.accessibilityAddTraits(selectedVisibility == vis ? .isSelected : [])`
   to the visibility capsule `Button`.
3. [x] Mark the decorative leading visibility icon `.accessibilityHidden(true)`
   (localized `vis.label` text already carries the meaning).
4. [x] Verify no test references the view; no new i18n key; no logic change.
5. [ ] Push branch, open PR, confirm `iOS Tests` green, merge, update tracking.

## Non-goals
- No new string / no `.xcstrings` edit (no user-facing copy added).
- No layout / font / color / animation change (Dynamic Type + i18n already sound).
- No SDK change (`PostVisibility`, `StatusViewModel` untouched).
