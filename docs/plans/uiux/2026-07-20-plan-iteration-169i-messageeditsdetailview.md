# Plan — Iteration-169i — `MessageEditsDetailView` localization + VoiceOver

**Date:** 2026-07-20 · **Scope:** iOS only · **Base:** `main` HEAD `3c4d772a5`

## Goal
Close the i18n + VoiceOver gaps on the message edit-history detail panel
(`MessageEditsDetailView`) without touching layout, the timeline visual, or the
per-conversation accent identity.

## Findings (pre-work)
The view — extracted from the old `MessageDetailSheet.editsTabContent` — is the
only moderate-size, self-contained `MessageDetail/` sub-view exhibiting BOTH
gaps at once:
1. **6 raw French literals** bypassing the codebase's inline
   `String(localized:defaultValue:bundle:)` idiom (banner title/detail, empty
   state, "Actuel", "Version N", inline plural).
2. **Zero accessibility.** No `.accessibilityElement/Label/Value` anywhere.
   VoiceOver swept the banner (decorative pencil icon + title + detail + count
   capsule), each timeline row (accent bar + header + time + content), and the
   empty state as disconnected fragments. Edit count was conveyed only by the
   capsule badge (a visual-only channel).

## Steps
1. [ ] Add localized-string helpers (`message.edits.*`, inline French default) —
   replaces the 6 raw literals; keep the FR plural inline (167i precedent).
2. [ ] Group the banner into one a11y element (label = title, value = detail
   phrase carrying the count).
3. [ ] Group each timeline row (label = "Actuel"/"Version N", value = time +
   content) so VoiceOver reads one coherent revision per swipe.
4. [ ] Combine the empty state + hide its decorative icon.
5. [ ] Verify no test references the view; `MessageDetailSheet` call site
   unchanged.
6. [ ] Push branch, open PR, confirm `ios-tests` green, merge, update tracking.

## Non-goals
- No `.xcstrings` catalog edit (inline `defaultValue` doctrine).
- No layout / font / timeline / accent change (all text already Dynamic Type).
- No SDK change (`EditRevision` / `Message` value types untouched).
- No behavior change (revisions still injected via `editRevisions`, no network).
