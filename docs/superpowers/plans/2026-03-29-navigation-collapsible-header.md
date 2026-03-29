# Navigation & Collapsible Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all static headers with a reusable collapsible header, fix floating button visibility with hub/deep route classification, and migrate New Conversation to a sheet.

**Architecture:** Typed `[Route]` path replaces `NavigationPath` for route introspection. `Route.isHub` computed property controls floating button visibility. `CollapsibleHeader` is a generic SwiftUI component in MeeshyUI that interpolates between expanded (large title, left-aligned) and collapsed (small title, centered) states based on scroll offset.

**Tech Stack:** SwiftUI, MeeshyUI (SDK), NavigationStack with typed path

**Spec:** `docs/superpowers/specs/2026-03-29-navigation-collapsible-header-design.md`

**Depends on:** Nothing (this is the foundation)
**Blocks:** Contacts Hub plan (uses CollapsibleHeader + `case contacts` route)

---

### Task 1: Router — Typed Path & Route Classification

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Navigation/Router.swift`
- Test: `apps/ios/MeeshyTests/Unit/Navigation/RouterTests.swift`

- [ ] **Step 1: Write failing tests for Route.isHub and Router navigation**

Create `apps/ios/MeeshyTests/Unit/Navigation/RouterTests.swift`:

```swift
import XCTest
@testable import Meeshy

@MainActor
final class RouterTests: XCTestCase {

    // MARK: - Route.isHub

    func test_isHub_profile_returnsTrue() {
        XCTAssertTrue(Route.profile.isHub)
    }

    func test_isHub_settings_returnsTrue() {
        XCTAssertTrue(Route.settings.isHub)
    }

    func test_isHub_communityList_returnsTrue() {
        XCTAssertTrue(Route.communityList.isHub)
    }

    func test_isHub_contacts_returnsTrue() {
        XCTAssertTrue(Route.contacts.isHub)
    }

    func test_isHub_links_returnsTrue() {
        XCTAssertTrue(Route.links.isHub)
    }

    func test_isHub_conversation_returnsFalse() {
        let conv = Conversation.stub()
        XCTAssertFalse(Route.conversation(conv).isHub)
    }

    func test_isHub_editProfile_returnsFalse() {
        XCTAssertFalse(Route.editProfile.isHub)
    }

    func test_isHub_communityDetail_returnsFalse() {
        XCTAssertFalse(Route.communityDetail("123").isHub)
    }

    // MARK: - Router.isHubRoute / isDeepRoute

    func test_isHubRoute_emptyPath_returnsTrue() {
        let router = Router()
        XCTAssertTrue(router.isHubRoute)
    }

    func test_isDeepRoute_emptyPath_returnsFalse() {
        let router = Router()
        XCTAssertFalse(router.isDeepRoute)
    }

    func test_isHubRoute_afterPushProfile_returnsTrue() {
        let router = Router()
        router.push(.profile)
        XCTAssertTrue(router.isHubRoute)
    }

    func test_isDeepRoute_afterPushConversation_returnsTrue() {
        let router = Router()
        router.push(.conversation(.stub()))
        XCTAssertTrue(router.isDeepRoute)
    }

    func test_pop_removesLastRoute() {
        let router = Router()
        router.push(.profile)
        router.push(.editProfile)
        XCTAssertEqual(router.path.count, 2)
        router.pop()
        XCTAssertEqual(router.path.count, 1)
        XCTAssertTrue(router.isHubRoute)
    }

    func test_popToRoot_clearsAllRoutes() {
        let router = Router()
        router.push(.profile)
        router.push(.editProfile)
        router.popToRoot()
        XCTAssertTrue(router.path.isEmpty)
        XCTAssertTrue(router.isHubRoute)
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — `Route.isHub` does not exist, `case .contacts` does not exist

- [ ] **Step 3: Implement Router changes**

Update `apps/ios/Meeshy/Features/Main/Navigation/Router.swift`:

1. Add `case contacts` to Route enum
2. Remove `case .newConversation`
3. Add `Route.isHub` extension
4. Replace `NavigationPath` with `[Route]`
5. Replace `isInConversation` with `isHubRoute`/`isDeepRoute`
6. Fix `navigateToConversation` and deep link handlers to use `push()`

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI
import os

enum Route: Hashable {
    case conversation(Conversation)
    case settings
    case profile
    case contacts
    case communityList
    case communityDetail(String)
    case communityCreate
    case communitySettings(Community)
    case communityMembers(String)
    case communityInvite(String)
    case notifications
    case userStats
    case links
    case affiliate
    case trackingLinks
    case shareLinks
    case communityLinks
    case dataExport
    case postDetail(String)
    case bookmarks
    case friendRequests
    case editProfile
}

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

@MainActor
final class Router: ObservableObject {
    @Published var path: [Route] = []
    @Published var deepLinkProfileUser: ProfileSheetUser?
    @Published var pendingShareContent: SharedContentType? = nil

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "router")

    var currentRoute: Route? { path.last }

    var isHubRoute: Bool {
        currentRoute?.isHub ?? true
    }

    var isDeepRoute: Bool {
        !path.isEmpty && !isHubRoute
    }

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

    // MARK: - Deep Link Handling
    // ... (keep existing deep link code, but replace self.path.append() with self.push())
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Navigation/Router.swift apps/ios/MeeshyTests/Unit/Navigation/RouterTests.swift
git commit -m "refactor(ios): typed [Route] path, hub/deep classification, remove newConversation route"
```

---

### Task 2: ScrollOffsetPreferenceKey — Extract to MeeshyUI

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Navigation/ScrollOffsetPreferenceKey.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift` (remove local copy)

- [ ] **Step 1: Create shared ScrollOffsetPreferenceKey**

Create `packages/MeeshySDK/Sources/MeeshyUI/Navigation/ScrollOffsetPreferenceKey.swift`:

```swift
import SwiftUI

public struct ScrollOffsetPreferenceKey: PreferenceKey {
    nonisolated(unsafe) public static var defaultValue: CGFloat = 0

    public static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
```

- [ ] **Step 2: Remove local copy from ConversationListView**

In `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`, remove the private `ScrollOffsetPreferenceKey` struct and add `import MeeshyUI` if not already present.

- [ ] **Step 3: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Navigation/ScrollOffsetPreferenceKey.swift apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift
git commit -m "refactor(sdk): extract ScrollOffsetPreferenceKey to MeeshyUI"
```

---

### Task 3: CollapsibleHeader Component

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Navigation/CollapsibleHeader.swift`

- [ ] **Step 1: Create CollapsibleHeader**

Create `packages/MeeshySDK/Sources/MeeshyUI/Navigation/CollapsibleHeader.swift`:

```swift
import SwiftUI

public struct CollapsibleHeader<TrailingContent: View>: View {
    let title: String
    let scrollOffset: CGFloat
    let showBackButton: Bool
    let onBack: (() -> Void)?
    let titleColor: Color
    let backArrowColor: Color
    let backgroundColor: Color
    let trailing: () -> TrailingContent

    public init(
        title: String,
        scrollOffset: CGFloat,
        showBackButton: Bool = true,
        onBack: (() -> Void)? = nil,
        titleColor: Color,
        backArrowColor: Color,
        backgroundColor: Color,
        @ViewBuilder trailing: @escaping () -> TrailingContent = { EmptyView() }
    ) {
        self.title = title
        self.scrollOffset = scrollOffset
        self.showBackButton = showBackButton
        self.onBack = onBack
        self.titleColor = titleColor
        self.backArrowColor = backArrowColor
        self.backgroundColor = backgroundColor
        self.trailing = trailing
    }

    private var progress: CGFloat {
        min(1, max(0, -scrollOffset / 60))
    }

    private var headerHeight: CGFloat {
        lerp(90, 48, progress)
    }

    private var titleSize: CGFloat {
        lerp(28, 17, progress)
    }

    private var arrowSize: CGFloat {
        lerp(24, 16, progress)
    }

    private func lerp(_ a: CGFloat, _ b: CGFloat, _ t: CGFloat) -> CGFloat {
        a + (b - a) * t
    }

    public var body: some View {
        VStack(spacing: 0) {
            ZStack {
                // Collapsed: centered title
                HStack {
                    if showBackButton {
                        Color.clear.frame(width: 44)
                    }
                    Spacer()
                    Text(title)
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundColor(titleColor)
                    Spacer()
                    trailing()
                        .frame(minWidth: 44, minHeight: 44)
                }
                .opacity(progress)

                // Expanded: left-aligned large title with back arrow above
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        if showBackButton {
                            Button {
                                HapticFeedback.light()
                                onBack?()
                            } label: {
                                Image(systemName: "chevron.left")
                                    .font(.system(size: arrowSize, weight: .semibold))
                                    .foregroundColor(backArrowColor)
                                    .frame(minWidth: 44, minHeight: 44)
                                    .contentShape(Rectangle())
                            }
                            .accessibilityLabel("Retour")
                        }
                        Spacer()
                        trailing()
                            .frame(minWidth: 44, minHeight: 44)
                    }

                    Text(title)
                        .font(.system(size: titleSize, weight: .bold, design: .rounded))
                        .foregroundColor(titleColor)
                        .padding(.leading, showBackButton ? 4 : 16)
                }
                .opacity(1 - progress)
            }
            .frame(height: headerHeight)
            .padding(.horizontal, 12)
            .background(backgroundColor)

            // Bottom divider (appears on collapse)
            Divider()
                .opacity(Double(progress) * 0.3)
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.7), value: progress)
    }
}
```

- [ ] **Step 2: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Navigation/CollapsibleHeader.swift
git commit -m "feat(sdk): add CollapsibleHeader reusable component"
```

---

### Task 4: RootView — Navigation Fix & Menu Ladder Update

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift`

- [ ] **Step 1: Update floating button visibility**

Replace both `if !router.isInConversation {` with `if !router.isDeepRoute {`

- [ ] **Step 2: Add Feed dismissal on route push**

Add after the NavigationStack:
```swift
.onChange(of: router.path) { _, newPath in
    if !newPath.isEmpty && showFeed {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showFeed = false
        }
    }
}
```

- [ ] **Step 3: Update menu ladder to 5 items**

Replace the `menuItems` array (around line 713) with:
```swift
let menuItems: [(icon: String, color: String, action: () -> Void)] = [
    ("person.fill", "9B59B6", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.profile) }),
    ("link.badge.plus", "F8B500", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.links) }),
    ("bell.fill", "FF6B6B", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; showNotifications = true }),
    ("person.2.fill", "6366F1", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.contacts) }),
    ("gearshape.fill", "45B7D1", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.settings) })
]
```

- [ ] **Step 4: Add showNewConversation sheet + contacts route destination**

Add `@State private var showNewConversation = false` to state vars.

Add `onNewConversation: { showNewConversation = true }` to `ConversationListView` init.

Add `.sheet(isPresented: $showNewConversation) { NewConversationView() }` modifier.

Add route destination:
```swift
case .contacts:
    ContactsHubView()  // placeholder — will be implemented in contacts plan
        .navigationBarHidden(true)
```

Remove `case .newConversation:` from the navigationDestination switch.

- [ ] **Step 5: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded (ContactsHubView may need a placeholder)

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/RootView.swift
git commit -m "feat(ios): hub/deep nav fix, 5-item menu ladder, new conversation sheet"
```

---

### Task 5: Apply CollapsibleHeader to ConversationListView

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`

- [ ] **Step 1: Add onNewConversation callback parameter**

Add `var onNewConversation: (() -> Void)?` to the view's properties.

- [ ] **Step 2: Replace static header with CollapsibleHeader**

Add `@State private var scrollOffset: CGFloat = 0` state.

Replace the existing header with:
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
            onNewConversation?()
        } label: {
            Image(systemName: "plus.circle.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundColor(MeeshyColors.indigo500)
        }
        .accessibilityLabel("Nouvelle conversation")
    }
)
```

Add scroll offset tracking to the ScrollView content.

- [ ] **Step 3: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeded

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift
git commit -m "feat(ios): collapsible header on ConversationListView"
```

---

### Task 6: Apply CollapsibleHeader to ProfileView

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ProfileView.swift`

- [ ] **Step 1: Replace static header with CollapsibleHeader**

Add `@State private var scrollOffset: CGFloat = 0`.

Replace the `header` computed property with `CollapsibleHeader` usage. Keep the Edit/Save button as trailing content.

Add scroll offset tracking to the ScrollView.

- [ ] **Step 2: Build and verify**

Run: `./apps/ios/meeshy.sh build`

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ProfileView.swift
git commit -m "feat(ios): collapsible header on ProfileView"
```

---

### Task 7: Apply CollapsibleHeader to SettingsView

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/SettingsView.swift`

- [ ] **Step 1: Replace static header with CollapsibleHeader**

Same pattern as Task 6. No trailing content.

- [ ] **Step 2: Build and verify**

Run: `./apps/ios/meeshy.sh build`

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/SettingsView.swift
git commit -m "feat(ios): collapsible header on SettingsView"
```

---

### Task 8: Apply CollapsibleHeader to CommunityListView

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/CommunityListView.swift`

- [ ] **Step 1: Replace static header with CollapsibleHeader**

Keep the `+` create community button as trailing content.

- [ ] **Step 2: Build and verify**

Run: `./apps/ios/meeshy.sh build`

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/CommunityListView.swift
git commit -m "feat(ios): collapsible header on CommunityListView"
```

---

### Task 9: Apply CollapsibleHeader to LinksHubView & NotificationListView

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/LinksHubView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/NotificationListView.swift`

- [ ] **Step 1: Replace static headers with CollapsibleHeader**

LinksHubView: keep existing `+` trailing button.
NotificationListView: back button dismisses the sheet.

- [ ] **Step 2: Build and verify**

Run: `./apps/ios/meeshy.sh build`

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/LinksHubView.swift apps/ios/Meeshy/Features/Main/Views/NotificationListView.swift
git commit -m "feat(ios): collapsible header on LinksHubView and NotificationListView"
```

---

### Task 10: Create ContactsHubView Placeholder & Final Build

**Files:**
- Create: `apps/ios/Meeshy/Features/Contacts/ContactsHubView.swift`

- [ ] **Step 1: Create placeholder ContactsHubView**

```swift
import SwiftUI
import MeeshyUI

struct ContactsHubView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss
    @State private var scrollOffset: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            CollapsibleHeader(
                title: "Contacts",
                scrollOffset: scrollOffset,
                onBack: { dismiss() },
                titleColor: theme.textPrimary,
                backArrowColor: MeeshyColors.indigo500,
                backgroundColor: theme.backgroundPrimary
            )

            ScrollView {
                GeometryReader { geo in
                    Color.clear.preference(
                        key: ScrollOffsetPreferenceKey.self,
                        value: geo.frame(in: .named("scroll")).minY
                    )
                }
                .frame(height: 0)

                Text("Contacts Hub — En cours de developpement")
                    .foregroundColor(theme.textMuted)
                    .padding(.top, 40)
            }
            .coordinateSpace(name: "scroll")
            .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollOffset = $0 }
        }
        .background(theme.backgroundPrimary.ignoresSafeArea())
    }
}
```

- [ ] **Step 2: Full build and test**

Run: `./apps/ios/meeshy.sh build && ./apps/ios/meeshy.sh test`
Expected: Build succeeded, all tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Contacts/ContactsHubView.swift
git commit -m "feat(ios): add ContactsHubView placeholder with collapsible header"
```
