# Iteration 208i — `ContactsListTab` contact row VoiceOver label (handle / last-seen)

**Track**: iOS UI/UX (suffix `i`)
**Date**: 2026-07-21
**Branch**: `claude/laughing-thompson-dj6dd5`
**Base**: `main` HEAD `22465a5`
**File**: `apps/ios/Meeshy/Features/Contacts/ContactsListTab.swift` (+ source-level test)

## Surface
`contactRow(_:index:)` — one row of the friends/contacts list (Contacts → list tab). Each
row visually shows: avatar (with presence dot + mood), the display **name**, the
**`@username`**, and a **presence detail** line that is either "En ligne" (online) or
"Vu {relative time}" (offline with a known `lastActiveAt`), plus a trailing disclosure
chevron.

## Defect (WCAG 1.3.1 Info & Relationships / 4.1.2 Name, Role, Value)
The row applies `.accessibilityElement(children: .combine)` **and then** an explicit
`.accessibilityLabel("\(name), \(online ? "en ligne" : "hors ligne")")`. Per SwiftUI
semantics, an explicit `.accessibilityLabel` **replaces** the text that `children: .combine`
would have merged. The result: VoiceOver announced only **name + a generic online/offline
flag** (e.g. "Alice, hors ligne"), silently dropping two pieces of information that sighted
users read from the same row:

1. **the `@username`** — the identifying handle, useful to disambiguate contacts who share
   a display name;
2. **when the contact was last seen** — the "Vu il y a X" relative time shown for offline
   contacts was flattened to a bare "hors ligne".

This is the same class of defect fixed for `CallJournalRow` in 207i: an explicit label
overriding a `children: .combine` under-states what the row renders.

## Fix
Replace the inline two-part label with `contactRowAccessibilityLabel(_:isOnline:)`, a pure
private helper that recomposes **exactly** what the row renders:

```
name, @username, {en ligne | vu {relativeTime} | hors ligne}
```

- **Zero new i18n keys** — reuses the keys already rendered in the visible row:
  `contacts.list.online.lower`, `contacts.list.offline.lower`, and `contacts.list.last-seen`
  (with `relativeTimeString.lowercased()`, mirroring line 178).
- The `@username` reuses the same `"@\(user.username)"` interpolation the visible row uses.
- Mirrors the proven `CallsTab.rowAccessibilityLabel(name:)` idiom (207i).

## Scope
- **1 code file** (`ContactsListTab.swift`): −1/+15 net (new helper + call site).
- **1 test file** (`ContactsListTabAccessibilityTests.swift`): source-level guard mirroring
  `CallsTabAccessibilityTests`.
- **0 logic / 0 network / 0 layout / 0 visual / 0 new i18n key.**
- The `.combine` scope is preserved (the avatar's `onMoodTap` stays reachable because the
  combine is scoped to the tappable Button, and the label only enriches its spoken text).
- iOS 16 floor → all APIs (`.accessibilityLabel`, `String(localized:)`) need no guard.

## Verification
- No open PR touches `ContactsListTab.swift` (`search_pull_requests … ContactsListTab` → 0;
  `list_pull_requests` open set → 0 match). 205i (merged) touched only the empty state.
- iOS build not runnable under Linux (no Xcode/Swift toolchain) → gate = CI `iOS Tests`.

## Completion
Resolved. **⚠️ Do not re-flag** the `ContactsListTab` contact-row VoiceOver label for the
dropped handle / last-seen (solved 208i).

### Track for 209i+
Other list rows where an explicit `.accessibilityLabel` overrides `children: .combine` and
under-states the visible content (audit: `children: .combine)` immediately followed by
`.accessibilityLabel(` on the same modifier chain). Verify swarm collision via
`list_pull_requests` first.
