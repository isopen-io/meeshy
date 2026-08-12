# Iteration 207i — `CallsTab` call-journal row VoiceOver label (type / age / duration)

**Track**: iOS UI/UX (suffix `i`)
**Date**: 2026-07-21
**Branch**: `claude/laughing-thompson-hvvudd`
**Base**: `main` HEAD `8792cb9`
**File**: `apps/ios/Meeshy/Features/Contacts/CallsTab.swift` (+ source-level test)

## Surface
`CallJournalRow` — one row of the call history list (Contacts → Calls tab). Each row
visually shows: avatar, name, a **direction icon**, a **`video.fill` badge** (only for
video calls), the **relative time** (`record.startedAt.relativeTimeString`), and a
**`· duration`** segment when the call had a duration.

## Defect (WCAG 1.3.1 Info & Relationships / 4.1.2 Name, Role, Value)
The row applies `.accessibilityElement(children: .combine)` **and then** an explicit
`.accessibilityLabel("\(name), \(accessibilityDirection)")`. Per SwiftUI semantics, an
explicit `.accessibilityLabel` **replaces** the text that `children: .combine` would have
merged. The result: VoiceOver announced only **name + direction** (e.g. "Jean, appel émis"),
silently dropping three pieces of information that sighted users get from the same row:

1. **audio vs video** — conveyed visually by the `video.fill` badge / icon alone;
2. **when** the call happened — the relative-time label;
3. **how long** it lasted — the duration label.

The `.combine` scope itself is correct and must stay: an earlier audit (2026-07-06/08)
found that grouping the *whole* row swallowed the reachable `CallRowDialButton` redial
menu, so the combine is deliberately scoped to the tappable Button only. The bug is purely
that the overriding label was under-specified.

## Fix
Replace the two-part label with `rowAccessibilityLabel(name:)`, a pure private helper that
recomposes **exactly** what the row renders:

```
name, direction, {audio|video type}, relativeTime[, {Durée} durationLabel]
```

- Call type reuses the **existing** keys `calls.type.audio` / `calls.type.video` already
  used by the sibling `CallDetailSheet` → the row and the detail sheet now describe a call
  identically (cross-screen consistency).
- Duration reuses the existing `calls.detail.duration` key as its prefix word.
- **Zero new i18n keys**; **0 visual change**; **0 logic/network change**. VoiceOver layer only.

## Verification
- Source-level guard added to the existing `CallsTabAccessibilityTests`
  (`test_callJournalRow_accessibilityLabelIncludesTypeTimeAndDuration`) — mirrors the file's
  established pattern (the two pre-existing tests guard `CallRowDialButton` hint and the
  filter-chip `.isSelected` trait). It asserts the composed label references the type keys,
  `relativeTimeString`, and `durationLabel`.
- Gate = CI `iOS Tests`. No open PR modifies `CallsTab.swift` (verified via
  `list_pull_requests` — only incidental sibling references in other PR bodies).

## Status
✅ Resolved. Do not re-flag `CallJournalRow`'s VoiceOver label — it now restates the full
visible content (name, direction, type, age, duration).

### Remaining / adjacent (defer, 1/iteration, collision-check first)
- `CallDetailSheet` `statusLine` combine is fine; its `detailRow`s are individually combined.
- Other list rows whose explicit `.accessibilityLabel` overrides a `.combine` (audit pattern:
  grep `children: .combine` followed by `.accessibilityLabel(` on the same modifier chain).
