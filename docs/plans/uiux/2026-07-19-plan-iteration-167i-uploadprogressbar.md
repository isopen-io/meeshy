# Plan — Iteration-167i — `UploadProgressBar` localization + VoiceOver

**Date:** 2026-07-19 · **Scope:** iOS only · **Base:** `main` HEAD `efedb69e4`

## Goal
Close the i18n + VoiceOver gaps on the attachment upload progress card without
touching layout, animation, or the Indigo visual identity.

## Steps
1. [x] Localize the files counter (`upload.progress.files-count`, inline French
   default) — replaces the raw `"…fichiers"` literal.
2. [x] Add label/value accessibility helpers (`accessibilityLabelText`,
   `accessibilityValueText`) + `isUploading`.
3. [x] Group the card into one accessibility element
   (`.accessibilityElement(children: .ignore)` + label + value +
   `.updatesFrequently` while uploading).
4. [x] Verify no test references the view; three call sites unchanged.
5. [ ] Push branch, open PR, confirm `ios-tests` green, merge, update tracking.

## Non-goals
- No `.xcstrings` catalog edit (inline `defaultValue` doctrine).
- No layout / font / animation change (Dynamic Type already handled).
- No SDK change (`UploadQueueProgress` value type untouched).
