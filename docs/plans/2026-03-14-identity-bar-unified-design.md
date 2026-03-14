# UserIdentityBar Unified — Design Document

**Goal:** Refactor UserIdentityBar into a flexible layout engine with 4 configurable zones, merging the message meta row (flags, translate icon, time, checkmarks) into the identity bar to eliminate duplication and provide a reusable component across 3 contexts: message bubble, comment, and listing.

**Architecture:** Replace the current fixed-layout UserIdentityBar with a zone-based component that accepts an ordered list of typed elements per zone. Provide 3 static factory presets for common contexts. The component does zero formatting — all data is pre-formatted by the caller.

**Tech Stack:** SwiftUI, MeeshySDK (MeeshyUI target)

---

## 1. Component Layout

```
┌──────────────────────────────────────────────────────┐
│ [Avatar?]  [leadingPrimary ...]   [trailingPrimary ...]   │
│            [leadingSecondary ...] [trailingSecondary ...]  │
└──────────────────────────────────────────────────────┘
```

- **Avatar**: Optional. When visible, anchored left, spans both lines vertically.
- **4 zones**: `leadingPrimary`, `trailingPrimary`, `leadingSecondary`, `trailingSecondary`. Each zone receives an ordered array of `IdentityBarElement`.
- **Constraint**: At least `avatar` OR `.name` in a zone must be present.
- **Line 2 hidden**: If both `leadingSecondary` and `trailingSecondary` are empty, the second line is not rendered.

---

## 2. IdentityBarElement Enum

The component is a **dumb layout engine**. Each element is a self-contained renderable unit. The caller decides what to display and in which zone.

```swift
public enum IdentityBarElement: Identifiable {
    case name
    case username(String)                          // "@alice"
    case roleBadge(ConversationRole)               // Icon only, no label
    case time(String)                              // Pre-formatted: "19:47", "il y a 2h", "1d"
    case delivery(DeliveryStatus)                  // ✓ / ✓✓ / ✓✓ colored
    case flags([String], active: String?, onTap: ((String) -> Void)?)
    case translateButton(action: () -> Void)       // SF Symbol "translate", NOT globe
    case presence(PresenceState)                   // "En ligne" / colored dot
    case memberSince(String)                       // Pre-formatted: "Membre dep. Jan 2025"
    case actionButton(String, action: () -> Void)  // Pill button
    case actionMenu(String, [ActionMenuItem])       // Button + dropdown
    case text(String)                              // Free-form text
}
```

### Rendering Specs

| Element | Font | Color | Notes |
|---------|------|-------|-------|
| `.name` | system 13 semibold | textPrimary | Uses `name` property of component |
| `.username` | system 11 | textSecondary | |
| `.roleBadge` | system 11 | per-role color | Icon only: admin=👑, moderator=🛡️, etc. |
| `.time` | system 11 medium | textSecondary | Pre-formatted string |
| `.delivery` | system 10 | varies | Existing checkmark rendering logic |
| `.flags` | system 10-12 | — | Emoji flags, active flag slightly larger with underline |
| `.translateButton` | system 10 medium | #4ECDC4 | SF Symbol `translate` |
| `.presence` | system 11 | green/gray/orange | Dot + label |
| `.memberSince` | system 11 | textSecondary | |
| `.actionButton` | system 12 medium | brand indigo | Pill style |
| `.actionMenu` | system 12 medium | brand indigo | Pill + chevron.down |
| `.text` | system 11 | textSecondary | |

---

## 3. Component API

```swift
public struct UserIdentityBar: View {
    // Identity (at least one required)
    public var avatar: AvatarConfig?
    public var name: String?

    // Zones — ordered arrays of elements
    public var leadingPrimary: [IdentityBarElement]
    public var trailingPrimary: [IdentityBarElement]
    public var leadingSecondary: [IdentityBarElement]
    public var trailingSecondary: [IdentityBarElement]
}

public struct AvatarConfig {
    public var url: String?
    public var accentColor: String
    public var mode: AvatarMode
    public var moodEmoji: String?
    public var presenceState: PresenceState
    public var onTap: (() -> Void)?
    public var contextMenuItems: [AvatarContextMenuItem]?
}
```

### Layout Logic

```
HStack(spacing: 8) {
    if let avatar { MeeshyAvatar(...) }

    VStack(alignment: .leading, spacing: 2) {
        // Line 1
        HStack(spacing: 4) {
            ForEach(leadingPrimary)  { render($0) }
            Spacer(minLength: 4)
            ForEach(trailingPrimary) { render($0) }
        }

        // Line 2 (only if non-empty)
        if !leadingSecondary.isEmpty || !trailingSecondary.isEmpty {
            HStack(spacing: 4) {
                ForEach(leadingSecondary)  { render($0) }
                Spacer(minLength: 4)
                ForEach(trailingSecondary) { render($0) }
            }
        }
    }
}
```

---

## 4. Presets (Static Factories)

### `.messageBubble(...)`

For group conversations, last message of a sender group, not isMe.

```
┌─────────────────────────────────────────┐
│  [contenu message]                      │
│  🧑 Alice D. 👑              19:47 ✓✓  │
│     @alice            🇫🇷🇬🇧  translate  │
└─────────────────────────────────────────┘
```

Zone mapping:
- `leadingPrimary`: [.name] + [.roleBadge] if role
- `trailingPrimary`: [.time("19:47")] + [.delivery(.read)] if delivery
- `leadingSecondary`: [.username("@alice")] if username
- `trailingSecondary`: [.flags([...])] if non-empty + [.translateButton] if callback

**No Divider** between message content and identity bar — direct transition.

### `.comment(...)`

For post/story comment authors.

```
│  🧑 Alice D. 👑                il y a 2h │
│     @alice              🇫🇷🇬🇧  translate  │
```

Zone mapping:
- `leadingPrimary`: [.name] + [.roleBadge] if role
- `trailingPrimary`: [.time("il y a 2h")]
- `leadingSecondary`: [.username("@alice")] if username
- `trailingSecondary`: [.flags([...])] if non-empty + [.translateButton] if callback

### `.listing(...)`

For search results, member lists, user listings.

```
│  🧑 Alice D. 👑              [Ajouter ▾] │
│     @alice                    🟢 En ligne  │
```

Zone mapping:
- `leadingPrimary`: [.name] + [.roleBadge] if role
- `trailingPrimary`: [.actionButton/actionMenu] if action, else empty
- `leadingSecondary`: [.username("@alice")] if username
- `trailingSecondary`: [.presence(.online)] or [.memberSince("...")] or empty

---

## 5. Integration in ThemedMessageBubble

### Current State (before)
- `messageMetaRow`: flags + translate icon + time + checkmarks (every message)
- `UserIdentityBar`: avatar + name + @username + time (last in group only)
- Divider between content and identity bar
- Both display time separately → duplication

### New State (after)
- **When identity bar visible** (last in group, !isMe, !isDirect): `UserIdentityBar.messageBubble(...)` replaces BOTH `messageMetaRow` and old `UserIdentityBar`. No Divider.
- **When identity bar not visible** (all other messages): `messageMetaRow` remains as-is (flags + translate + time + checkmarks).

### Removal
- Delete the `Divider()` between content and identity bar
- Delete the old `UserIdentityBar` instantiation block
- Conditionally skip `messageMetaRow` when identity bar is shown

---

## 6. Files Impact

### Modified
1. `packages/MeeshySDK/Sources/MeeshyUI/Primitives/UserIdentityBar.swift` — Complete rewrite: zone-based layout engine + `IdentityBarElement` enum + `AvatarConfig` struct + 3 preset factories
2. `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift` — Replace `messageMetaRow` + old `UserIdentityBar` with `.messageBubble(...)` when identity bar visible; remove Divider

### Unchanged
- `ConversationView+MessageRow.swift` — already passes `isDirect` and `isLastInGroup`
- `UserColorCache.swift`, `CacheCoordinator.swift`, `ColorGeneration.swift` — not impacted
- `MeeshyAvatar.swift` — used as-is inside the new component

---

## 7. Visual Summary

### Message (group, last in sender group)
```
┌─────────────────────────────────────────┐
│  Salut tout le monde, comment ça va ?   │
│  🧑 Alice D. 👑              19:47 ✓✓  │
│     @alice            🇫🇷🇬🇧  translate  │
└─────────────────────────────────────────┘
       😂2 ❤️1                   <- reactions overlay
```

### Message (non-last, or isMe, or DM)
```
┌─────────────────────────────────────────┐
│  Bonjour tout le monde !                │
│          🇫🇷🇬🇧  translate  19:47 ✓✓     │
└─────────────────────────────────────────┘
```

### Comment
```
│  🧑 Alice D. 👑                il y a 2h │
│     @alice              🇫🇷🇬🇧  translate  │
│  Super post, merci pour le partage !      │
```

### Listing
```
│  🧑 Alice D. 👑              [Ajouter ▾] │
│     @alice                    🟢 En ligne  │
```
