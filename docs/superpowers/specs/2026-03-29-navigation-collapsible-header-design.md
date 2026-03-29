# Navigation & Collapsible Header — Design Spec

**Date**: 2026-03-29
**Status**: Approved
**Scope**: iOS app — reusable collapsible header, navigation architecture fix, new conversation sheet migration

## Problem

1. **No collapsible header** — All screens use small static headers. The app needs a modern large-title-to-small-title scroll transition.
2. **Broken navigation from Feed** — When in Feed overlay and opening a menu item, floating buttons disappear and there is no way to navigate back to Feed or elsewhere.
3. **New Conversation as route** — Currently pushed as a navigation route, but should be a sheet accessible from a `+` button next to the "Conversations" title.

## Solution

Three interconnected changes:
1. A reusable `CollapsibleHeader` component applied to all major screens
2. A hub/deep route classification that controls floating button visibility
3. Migration of New Conversation from route to sheet

---

## 1. Collapsible Header Component

### Behavior
- **Expanded** (scroll at top): Large back arrow (`chevron.left`, size 24) + large title (size 28, bold, left-aligned)
- **Collapsed** (scroll offset < -60pt): Small back arrow (`chevron.left`, size 16) + small title (size 17, bold, centered)
- Smooth animated transition based on scroll offset
- Threshold: 60pt of scroll downward

### API

```swift
struct CollapsibleHeader<TrailingContent: View>: View {
    let title: String
    let scrollOffset: CGFloat
    let showBackButton: Bool
    let onBack: (() -> Void)?
    let trailing: () -> TrailingContent

    // Theme colors passed as parameters (no @ObservedObject on ThemeManager)
    let titleColor: Color
    let backArrowColor: Color
    let backgroundColor: Color

    init(
        title: String,
        scrollOffset: CGFloat,
        showBackButton: Bool = true,
        onBack: (() -> Void)? = nil,
        titleColor: Color,
        backArrowColor: Color,
        backgroundColor: Color,
        @ViewBuilder trailing: @escaping () -> TrailingContent = { EmptyView() }
    )
}
```

### Parameters
- `title`: Screen title text
- `scrollOffset`: Current vertical scroll offset (from `ScrollOffsetPreferenceKey`)
- `showBackButton`: `false` for root screens (Conversations, Feed)
- `onBack`: Back action (defaults to `router.pop()`)
- `trailing`: Optional trailing content (e.g., `+` button for Conversations)
- `titleColor`, `backArrowColor`, `backgroundColor`: Theme colors passed as values (avoids `@ObservedObject` on `ThemeManager.shared` — leaf view rule)

### Scroll Offset Tracking
Reuse existing `ScrollOffsetPreferenceKey` pattern from `ConversationListView`. Each screen wraps its content in a `ScrollView` with an offset-tracking `GeometryReader`:

```swift
ScrollView {
    GeometryReader { geo in
        Color.clear.preference(
            key: ScrollOffsetPreferenceKey.self,
            value: geo.frame(in: .named("scroll")).minY
        )
    }
    .frame(height: 0)

    // Content here
}
.coordinateSpace(name: "scroll")
.onPreferenceChange(ScrollOffsetPreferenceKey.self) { offset = $0 }
```

**Note**: `scrollOffset` is positive at rest (0) and becomes negative as user scrolls down (content moves up). `offset < -30` means scrolled down 30pt.

### Visual Transition
```
scrollOffset = 0 (top):
┌─────────────────────────────┐
│ ←  (large, 24pt)            │
│                              │
│ Contacts  (28pt, bold, left) │
│                              │
└─────────────────────────────┘

scrollOffset < -60pt (scrolled down):
┌─────────────────────────────┐
│ ←      Contacts       [+]   │  (16pt arrow, 17pt title centered)
└─────────────────────────────┘
```

### Interpolation
- `progress = min(1, max(0, -scrollOffset / 60))` (0 = expanded, 1 = collapsed)
- Title size: `lerp(28, 17, progress)`
- Title alignment: animated from `.leading` to `.center`
- Back arrow size: `lerp(24, 16, progress)`
- Header height: `lerp(90, 48, progress)`
- All transitions use `.spring(response: 0.4, dampingFraction: 0.7)`

### Accessibility
- Back button: `.accessibilityLabel("Retour")`, minimum 44x44pt touch target (use `.frame(minWidth: 44, minHeight: 44)` with `.contentShape(Rectangle())`)
- Title: uses Dynamic Type-friendly `.system(size:weight:design:)` fonts
- Trailing content: caller is responsible for accessibility labels

### File Location
`packages/MeeshySDK/Sources/MeeshyUI/Navigation/CollapsibleHeader.swift`

Placed in MeeshyUI (not the app) so it is reusable across the SDK and app.

### Scroll Offset Preference Key
Extract `ScrollOffsetPreferenceKey` from `ConversationListView` into a shared location:
`packages/MeeshySDK/Sources/MeeshyUI/Navigation/ScrollOffsetPreferenceKey.swift`

---

## 2. Navigation Architecture Fix

### Replace `NavigationPath` with Typed `[Route]` Path

The current `NavigationPath` is type-erased and does not expose its elements. This makes hub/deep classification impossible. **Replace with a typed array**:

```swift
// Router.swift — BEFORE
@Published var path = NavigationPath()

// Router.swift — AFTER
@Published var path: [Route] = []
```

SwiftUI supports `NavigationStack(path: Binding<[Route]>)` directly when `Route: Hashable`. This eliminates the need for a parallel `routeStack` and avoids desync on swipe-to-back gestures (the system mutates the typed array directly).

### Route Classification via `Route.isHub`

Add a computed property directly on the `Route` enum:

```swift
extension Route {
    var isHub: Bool {
        switch self {
        case .profile, .settings, .communityList, .contacts, .links:
            return true
        default:
            return false
        }
    }
}
```

Router computed properties:

```swift
var currentRoute: Route? { path.last }

var isHubRoute: Bool {
    currentRoute?.isHub ?? true  // root (empty path) = hub
}

var isDeepRoute: Bool {
    !path.isEmpty && !isHubRoute
}
```

Remove the old `isInConversation` property.

### Update all direct `path` mutations

All code that directly manipulates `path` must use the typed API:

```swift
func push(_ route: Route) {
    path.append(route)
}

func pop() {
    guard !path.isEmpty else { return }
    path.removeLast()
}

func popToRoot() {
    path.removeAll()
}

func navigateToConversation(_ conversation: Conversation) {
    popToRoot()
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
        self.push(.conversation(conversation))
    }
}
```

**Important**: Audit ALL direct `path.append()` calls in `Router.swift` (including `navigateToConversation` and `handleDeepLink`) — they all must use `push()` for consistency.

### NavigationStack binding change in RootView

```swift
// BEFORE
NavigationStack(path: $router.path) {

// AFTER
NavigationStack(path: $router.path) {  // Same syntax, but path is now [Route]
```

The `navigationDestination(for: Route.self)` remains unchanged.

### Add `case contacts` to Route enum

```swift
enum Route: Hashable {
    // ... existing cases
    case contacts  // NEW
}
```

### Complete Route Classification

**Hub Routes** (floating buttons visible):
| Route | Screen |
|-------|--------|
| root (empty path) | Conversation list |
| `.profile` | Mon profil |
| `.settings` | Parametres |
| `.communityList` | Communautes |
| `.contacts` | Hub contacts |
| `.links` | Liens |

**Deep Routes** (floating buttons hidden):
All other routes: `.conversation`, `.editProfile`, `.communityDetail`, `.communityCreate`, `.communitySettings`, `.communityMembers`, `.communityInvite`, `.notifications`, `.userStats`, `.affiliate`, `.trackingLinks`, `.shareLinks`, `.communityLinks`, `.dataExport`, `.postDetail`, `.bookmarks`, `.friendRequests`

### Floating Button Visibility Change

In `RootView.swift`, replace both occurrences of:
```swift
if !router.isInConversation {
```

With:
```swift
if !router.isDeepRoute {
```

This applies to `draggableFloatingButtons` and `menuLadder` visibility guards.

### Feed Context Preservation

The Feed overlay is rendered at zIndex 50, **above** the NavigationStack. When a hub route is pushed while Feed is open:

1. Menu items keep setting `showMenu = false` before pushing — no change
2. **Hide Feed when any route is pushed** (since Feed is above the NavigationStack, it would obscure the pushed view):

```swift
// In RootView, observe route changes:
.onChange(of: router.path) { _, newPath in
    if !newPath.isEmpty && showFeed {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showFeed = false
        }
    }
}
```

3. When user pops back to root, Feed does NOT auto-reopen (it was explicitly closed). This is correct behavior — the user chose to navigate away from Feed.

### Menu Ladder — 5 items

Remove theme toggle (index 4) AND new conversation (index 1). Add contacts. The theme toggle is already in Settings.

**New menu ladder (5 items)**:
1. Profile (`person.fill`, `9B59B6`)
2. Links (`link.badge.plus`, `F8B500`)
3. Notifications (`bell.fill`, `FF6B6B`) — triggers `showNotifications = true` (sheet)
4. Contacts (`person.2.fill`, `6366F1`) — `router.push(.contacts)`
5. Settings (`gearshape.fill`, `45B7D1`)

---

## 3. New Conversation → Sheet Migration

### Remove from Router
Delete `case .newConversation` from `Route` enum.

### Remove from Menu Ladder
Remove the menu item for new conversation.

### Remove from navigationDestination
Delete `case .newConversation:` from the route switch in RootView.

### Add `+` Button in Conversation List Header
In `ConversationListView`, the `CollapsibleHeader` trailing content:

```swift
CollapsibleHeader(
    title: "Conversations",
    scrollOffset: scrollOffset,
    showBackButton: false,
    titleColor: theme.textPrimary,
    backArrowColor: MeeshyColors.indigo500,
    backgroundColor: theme.backgroundPrimary,
    trailing: {
        Button {
            onNewConversation()
        } label: {
            Image(systemName: "plus.circle.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundColor(MeeshyColors.indigo500)
        }
        .accessibilityLabel("Nouvelle conversation")
    }
)
```

### Sheet Presentation
`ConversationListView` takes an `onNewConversation` callback. In `RootView.swift`:

```swift
@State private var showNewConversation = false

ConversationListView(
    // ...existing params
    onNewConversation: { showNewConversation = true }
)

// Sheet modifier on NavigationStack:
.sheet(isPresented: $showNewConversation) {
    NewConversationView()
}
```

---

## 4. Screens to Update with CollapsibleHeader

Each screen gets the `CollapsibleHeader` replacing its current static header:

| Screen | File | Back Button | Trailing Content |
|--------|------|-------------|------------------|
| Conversations | `ConversationListView.swift` | No | `+` (new conversation) |
| Profile | `ProfileView.swift` | Yes | Edit button (existing) |
| Settings | `SettingsView.swift` | Yes | — |
| Communities | `CommunityListView.swift` | Yes | `+` (create community, existing) |
| Contacts | `ContactsHubView.swift` (new) | Yes | — |
| Links | `LinksHubView.swift` | Yes | `+` (existing) |
| Notifications | `NotificationListView.swift` | Yes (dismiss sheet) | — |

**Feed**: Feed is a ZStack overlay, not a full-screen with scroll. The collapsible header does NOT apply to Feed. If Feed needs a header, it will be handled separately.

---

## Modified Files Summary

| File | Changes |
|------|---------|
| **New: `CollapsibleHeader.swift`** | Reusable component in MeeshyUI/Navigation/ |
| **New: `ScrollOffsetPreferenceKey.swift`** | Extracted shared utility in MeeshyUI/Navigation/ |
| `Router.swift` | Replace `NavigationPath` with `[Route]`. Add `Route.isHub`, `isHubRoute`, `isDeepRoute`. Remove `isInConversation`. Remove `case .newConversation`. Add `case contacts`. |
| `RootView.swift` | Replace `isInConversation` with `isDeepRoute`. Add `showNewConversation` sheet. Update menu ladder (5 items). Add `onChange` for Feed dismissal on route push. |
| `ConversationListView.swift` | Replace static header with `CollapsibleHeader`. Add `onNewConversation` callback. Remove local `ScrollOffsetPreferenceKey` (moved to shared). |
| `ProfileView.swift` | Replace static header with `CollapsibleHeader`. |
| `SettingsView.swift` | Replace static header with `CollapsibleHeader`. |
| `CommunityListView.swift` | Replace static header with `CollapsibleHeader`. |
| `LinksHubView.swift` | Replace static header with `CollapsibleHeader`. |
| `NotificationListView.swift` | Replace static header with `CollapsibleHeader`. |
| `ContactsHubView.swift` (new, from contacts spec) | Uses `CollapsibleHeader`. |

## Testing

### Unit Tests Required
- `Route.isHub` returns `true` for each hub route, `false` for each deep route
- `Router.isHubRoute` returns `true` at root (empty path)
- `Router.isDeepRoute` returns `false` at root
- `Router.push` / `pop` / `popToRoot` correctly update typed `path`
- `CollapsibleHeader` progress interpolation: verify lerp values at offset 0, -30, -60, -90

### Integration Verification
- Swipe-to-back from hub route → floating buttons remain visible
- Swipe-to-back from deep route → floating buttons reappear
- Open Feed → tap menu item → Feed closes, hub opens, buttons visible
- Push deep route from hub → buttons disappear
- Pop back to hub → buttons reappear

## Design Language

- Title font expanded: `.system(size: 28, weight: .bold, design: .rounded)`
- Title font collapsed: `.system(size: 17, weight: .bold, design: .rounded)`
- Back arrow expanded: `chevron.left` at size 24, weight `.semibold`
- Back arrow collapsed: `chevron.left` at size 16, weight `.semibold`
- Colors: `titleColor` param for title, `backArrowColor` param for back arrow (no hardcoded ThemeManager reference)
- Animation: `.spring(response: 0.4, dampingFraction: 0.7)` (within project convention range 0.4-0.7)
- Header background: `backgroundColor` param with bottom divider on collapse (opacity animated)

## Out of Scope

- Feed overlay header (Feed is not a full-screen, does not apply)
- Notifications migration from route to sheet-only (keep route for deep link/handleNotificationTap compatibility)
- Animated tab bar for contacts (covered in contacts hub spec)
- Anonymous user pipeline (separate spec)
