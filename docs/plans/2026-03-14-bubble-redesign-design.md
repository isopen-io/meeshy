# Bubble Redesign — Design Document

**Goal:** Redesign message bubbles to align with the Meeshy Indigo brand identity, improve visual distinction between own and received messages, and add an inline sender identity bar for group conversations.

**Architecture:** Modify ThemedMessageBubble color scheme (brand Indigo for own messages, blended conversation accent + Indigo for others), extract a reusable `UserIdentityBar` component in MeeshyUI, and add a centralized `UserColorCache` actor in the SDK for caching computed colors.

**Tech Stack:** SwiftUI, MeeshySDK (Theme, Cache), MeeshyUI (Components)

---

## 1. Bubble Color Scheme

### Own Messages (isMe = true)
- **Background:** Brand Indigo gradient `#6366F1 -> #4338CA` (topLeading -> bottomTrailing)
- **Text:** `Color.white`
- **Meta text (time, checkmarks):** `Color.white@70%`
- **Shadow:** `indigo500.opacity(0.3)`, radius 6, y 3
- **No border**
- This is constant across ALL conversations (brand identity)

### Others' Messages (isMe = false)
- **Background:** Blended color gradient `blended -> blended@80%`
  - `blended = blend(conversationAccentColor x 30%, brandIndigo x 70%)`
  - Each conversation has its own unique-but-Indigo-family bubble tint for received messages
- **Dark mode fallback:** `blended@35% -> blended@20%` (subtle tinted, same as current opacity approach)
- **Light mode fallback:** `blended@25% -> blended@15%`
- **Border:** `blended@50% -> blended@20%`, 1pt (dark), `blended@40%` (light)
- **Text:** Theme `textPrimary`
- **Meta text:** Theme `textSecondary@60%`

### Blend Formula
```
blend(color1, weight1, color2, weight2):
  h = color1.hue * weight1 + color2.hue * weight2
  s = color1.saturation * weight1 + color2.saturation * weight2
  b = color1.brightness * weight1 + color2.brightness * weight2
  return Color(h, s, b)
```

### Result
- Own messages always carry the Meeshy signature Indigo
- Others' messages stay in the Indigo chromatic family but with a subtle warm/cool shift from the conversation accent
- Visual distinction is clear: full Indigo (mine) vs tinted Indigo variant (others)

---

## 2. Bubble Layout

### Symmetric Margins
- Both sides: 16pt horizontal padding (unchanged)
- Remove the asymmetric Spacer approach
- Own messages: trailing alignment (right)
- Others' messages: leading alignment (left)

### Content-Sized Bubbles
- Bubble width adapts to content
- Max width: ~75% of screen width (prevents full-bleed text)
- Short text = narrow bubble, long text = wide bubble
- Corner radius: 18pt (unchanged)

### Avatar Removal from Exterior
- The 32pt external avatar (leading side) is removed entirely
- No more invisible 32pt spacer for alignment
- In group conversations, the avatar moves inside the bubble footer (see Section 3)
- In DM conversations, no avatar on bubbles at all

---

## 3. UserIdentityBar (Group Conversations Only)

### Component: `UserIdentityBar`
Location: `packages/MeeshySDK/Sources/MeeshyUI/Components/UserIdentityBar.swift`

Reusable component showing user identity inline. Designed for message bubbles but usable in search results, comment threads, member lists, etc.

### Layout (inside bubble, below content)
```
┌─────────────────────────────────────────────┐
│  [message content: text/image/audio/etc]    │
│                                             │
│  ┌──────┐  Display Name          ── 19:47  │
│  │Avatar│  @username                        │
│  └──────┘                                   │
└─────────────────────────────────────────────┘
       reactions overlay on top
```

### Props
- `name: String` — resolved via `getUserDisplayName()`
- `username: String?` — prefixed with @ when displayed
- `avatarURL: String?` — user avatar
- `accentColor: String` — for avatar fallback gradient
- `timestamp: Date?` — optional, shown trailing-aligned
- `avatarMode: AvatarMode` — default `.messageBubble` (32pt)
- `presenceState: PresenceState` — online/away/offline dot
- `moodEmoji: String?` — mood badge on avatar
- `onAvatarTap: (() -> Void)?` — profile navigation
- `contextMenuItems: [AvatarContextMenuItem]?` — avatar long press menu

### Typography
- Display name: `.system(size: 13, weight: .semibold)`, `textPrimary`
- @username: `.system(size: 11)`, `textSecondary`
- Timestamp: `.system(size: 11)`, `textSecondary`, trailing alignment

### Visibility Rules
- Shown ONLY when `!isDirect && isLastInGroup && !isMe`
- In DM: never shown
- On own messages: never shown (meta row with time + checkmarks stays)

### Separator
- Thin divider (0.5pt, `textMuted@20%`) between message content and the identity bar
- 8pt vertical padding above and below the bar

---

## 4. UserColorCache (SDK)

### Actor: `UserColorCache`
Location: `packages/MeeshySDK/Sources/MeeshySDK/Theme/UserColorCache.swift`

Centralized cache for computed colors to avoid redundant calculations across the app.

### API
```swift
public actor UserColorCache {
    public static let shared = UserColorCache()

    /// Returns hex string of blended color (conversation accent 30% + brand Indigo 70%)
    public func blendedColor(for conversationAccent: String) -> String

    /// Returns hex string for a user's name-based color
    public func colorForUser(name: String) -> String

    /// Clear all cached values
    public func invalidateAll()
}
```

### Implementation
- Internal storage: `[String: String]` dictionary (key -> hex result)
- `blendedColor(for:)`: key = `"blend:\(accent)"`, computed via HSB blend
- `colorForUser(name:)`: key = `"user:\(name)"`, delegates to `DynamicColorGenerator.colorForName()` and caches result
- Actor isolation ensures thread safety
- No disk persistence needed — computed values are lightweight, cache lives for the session
- `invalidateAll()` called on logout via `CacheCoordinator`

### Blend Function
Added to `DynamicColorGenerator` as a static utility:
```swift
static func blend(_ hex1: String, weight1: CGFloat, _ hex2: String, weight2: CGFloat) -> String
```
Blends two hex colors in HSB space with given weights, returns hex string.

---

## 5. Files Impact

### New Files
1. `packages/MeeshySDK/Sources/MeeshySDK/Theme/UserColorCache.swift` — centralized color cache actor
2. `packages/MeeshySDK/Sources/MeeshyUI/Components/UserIdentityBar.swift` — reusable identity bar component

### Modified Files
3. `packages/MeeshySDK/Sources/MeeshySDK/Theme/ColorGeneration.swift` — add `blend()` static function
4. `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift` — bubble colors (brand Indigo for me, blended for others), integrate UserIdentityBar footer for last-in-group in non-DM
5. `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift` — remove external avatar, symmetric margins, pass `isDirect` to bubble
6. `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift` — call `UserColorCache.shared.invalidateAll()` in `invalidateAll()`

### Unchanged
- `MeeshyAvatar.swift` — used as-is inside UserIdentityBar
- `UserDisplayName.swift` — used as-is for name resolution
- `MeeshyColors.swift`, `ThemeManager.swift` — brand colors referenced, not modified

---

## 6. Visual Summary

### DM Conversation
```
                              ┌──────────────────┐
                              │ My message text   │  <- Brand Indigo gradient
                              │            19:47 ✓✓│
                              └──────────────────┘

┌──────────────────┐
│ Their message     │  <- Blended (accent 30% + Indigo 70%)
│          19:48    │
└──────────────────┘
```

### Group Conversation
```
                              ┌──────────────────┐
                              │ My message text   │  <- Brand Indigo gradient
                              │            19:47 ✓✓│
                              └──────────────────┘

┌──────────────────────────────────┐
│ Their message text               │  <- Blended color
│                                  │
│ ┌────┐ Alice D.          19:48  │
│ │ AV │ @alice                    │
│ └────┘                           │
└──────────────────────────────────┘
        😂2 ❤️1                      <- reactions overlay
```
