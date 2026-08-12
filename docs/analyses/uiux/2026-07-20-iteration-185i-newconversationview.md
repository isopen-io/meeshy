# Iteration-185i — VoiceOver: expose online / blocked status in the New-Conversation user row

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver / WCAG 1.4.1) — New-Conversation user-search row
**File touched:** `apps/ios/Meeshy/Features/Main/Views/NewConversationView.swift` (1 file, 0 logic, 0 test, 0 catalog edit)

## Component

`NewConversationView` is the screen for starting a new conversation: a search
field over people, each rendered by `userRow(_:)`. The row is a single `Button`
(tap = toggle selection) whose trailing area shows a small state cluster:

- a **green dot** (`Circle().fill(MeeshyColors.success)`) when `user.isOnline == true`,
- a **"Bloqué" badge** + `hand.raised.fill` glyph when the user is blocked,
- a selection checkmark (`checkmark.circle.fill` / `circle`).

## Finding

Online status was conveyed **only** by the green dot's colour/shape. The dot is
a bare `Circle` (not an accessibility element), so VoiceOver never announced it.
The row carried no explicit `.accessibilityLabel`, so the button's derived label
was just the concatenation of its two visible `Text` nodes — **"displayName,
@username"** — with no mention of whether the person is online.

```swift
if user.isOnline == true {
    Circle().fill(MeeshyColors.success).frame(width: 8, height: 8)   // ← colour-only status
}
// …
.disabled(isBlocked)
.accessibilityAddTraits(isSelected ? .isSelected : [])               // ← selection handled; status not
```

This is a WCAG 1.4.1 ("Use of Color") violation: a sighted user sees at a glance
who is online, a VoiceOver user does not. The **"Bloqué"** state is slightly
better — it renders visible text the button label would pick up — but once we
override the label to inject online status, the blocked status must be composed
in explicitly so it is not lost.

## Fix

Mirror the shipped `ContactsListTab.resultRow` idiom (175i, merged), which
composes an accessibility label of the form `"{name}, en ligne"` /
`"{name}, hors ligne"` using the lowercase status key `contacts.list.online.lower`.

A small pure helper composes the row label and is applied to the `Button`:

```swift
.accessibilityLabel(userRowAccessibilityLabel(for: user, isBlocked: isBlocked))
.accessibilityAddTraits(isSelected ? .isSelected : [])

private func userRowAccessibilityLabel(for user: SearchedUser, isBlocked: Bool) -> String {
    var parts = [user.displayName ?? user.username, "@\(user.username)"]
    if isBlocked {
        parts.append(String(localized: "new_conversation.user.blocked", defaultValue: "Bloqué", bundle: .main))
    } else if user.isOnline == true {
        parts.append(String(localized: "contacts.list.online.lower", defaultValue: "en ligne", bundle: .main))
    }
    return parts.joined(separator: ", ")
}
```

Design notes:
- **No `.accessibilityElement(children: .ignore)`.** A SwiftUI `Button` already
  presents as one accessibility element; an explicit `.accessibilityLabel`
  cleanly overrides the derived label while preserving the `.isButton` and
  `.isSelected` traits. Adding `.ignore` on a Button risks stripping the button
  trait — the 181i / 177i "combine on interactive children" hazard in reverse.
- **Offline is silent, matching the visual.** The dot is only drawn for
  `isOnline == true`; when nil/false nothing is shown, so nothing is announced.
  (We do not fabricate "hors ligne" for the unknown `Bool?` case.)
- **Key reuse, zero new catalog surface.** `contacts.list.online.lower`
  ("en ligne") and `new_conversation.user.blocked` ("Bloqué") already exist —
  no new localization keys, single source of truth for the status words.
- **Zero visual change.** Only the VoiceOver label changes; the dot, badge and
  checkmark render identically.

## Verification

- Single file; no logic, no ViewModel change. `NewConversationViewModelTests`
  exercises the ViewModel (untouched) and is unaffected.
- No test references `userRow` accessibility. Gate = CI `iOS Tests` (compile +
  suites).

## Status

**RESOLVED (185i).** The New-Conversation row now announces online / blocked
status to VoiceOver. Remaining sibling gap (out of app-view scope): the SDK
`MeeshyAvatar` presence dot (`packages/MeeshySDK/.../Primitives/MeeshyAvatar.swift`)
labels by `name` only — track separately as SDK work.
