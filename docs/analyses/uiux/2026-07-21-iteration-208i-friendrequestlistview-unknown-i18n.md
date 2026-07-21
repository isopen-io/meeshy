# Iteration 208i — iOS UI/UX

**Screen:** `FriendRequestListView` (received friend-request list).
**Type:** Internationalization (i18n).
**File:** `apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift`

## Problem

`friendRequestRow(_:)` derives the sender's display name with a **hardcoded French
literal** fallback:

```swift
let name = sender?.name ?? "Inconnu"   // line 99
```

This `name` is not cosmetic — it drives:
- the avatar seed (`MeeshyAvatar(name:)` + `DynamicColorGenerator.colorForName(name)`),
- the visible primary `Text(name)` (line 113),
- the combined VoiceOver announcement of the row.

So when a request arrives without a resolved sender name, every non-French user
sees the raw string **"Inconnu"** as the person's name and hears it via VoiceOver —
a localization defect (hardcoded UI string, WCAG/i18n).

## Prior art / sibling

The direct sibling `RequestsTab.swift` (the received/sent request rows in the
Contacts hub) already localizes the *exact same* fallback through the shared
build-extracted key `common.unknown`:

```swift
// RequestsTab.swift:119 (received) and :221 (sent)
let name = sender?.name ?? String(localized: "common.unknown", defaultValue: "Inconnu", bundle: .main)
```

`ThreadView.swift:95/159` uses the same key for its own name fallback. The key is
referenced by **4** source sites and extracted at build (no `.xcstrings` entry
needed — same convention as its siblings), so reusing it adds **0 new i18n keys**.

Iteration 142i already migrated this screen's empty state to the native
`AdaptiveContentUnavailableView`; the `"Inconnu"` literal was the last
hardcoded user-visible English/French string in the file.

## Fix

Mirror the sibling verbatim:

```swift
let name = sender?.name ?? String(localized: "common.unknown", defaultValue: "Inconnu", bundle: .main)
```

- `defaultValue: "Inconnu"` is byte-identical to the former literal → **0 visual
  change** in French, correct localization elsewhere.
- `Foundation` is already transitively imported (`import SwiftUI`); no new import.
- `String` result binds `MeeshyAvatar(name:)`, `colorForName`, and `Text(name)`
  exactly as before.

## Scope

- **1 file, 1 line.**
- 0 logic / 0 network / 0 layout / 0 new i18n key / 0 new test / 0 visual change.
- iOS 16 floor: `String(localized:defaultValue:bundle:)` needs no `@available` guard.

## Collision check

`search_pull_requests repo:isopen-io/meeshy is:open FriendRequestListView` →
`total_count: 0`. The file is absent from every open PR in the `laughing-thompson`
swarm. Iteration number **208i** chosen strictly above the highest doc'd/in-flight
iteration (207i doc'd, 206i = PR #2224).

## Verification

- iOS build/tests are not runnable in this Linux container (no Xcode/Swift
  toolchain) → **gate = CI `iOS Tests`** (compile Xcode 26.1.1 / Swift 6.2, run
  simulator iOS 18.2).
- Static parity: insertion is line-for-line identical to `RequestsTab.swift:119`.
- No test references `friendRequestRow` (grep across `MeeshyTests` = 0).

## Follow-ups (209i+)

- Audit other `?? "Inconnu"` / `?? "Unknown"` name fallbacks across the app for the
  same `common.unknown` consolidation (verify swarm contention first).
