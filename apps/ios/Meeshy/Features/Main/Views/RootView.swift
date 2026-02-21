import SwiftUI
import MeeshySDK

// Components extracted to RootViewComponents.swift:
// ThemedFloatingButton, ThemedActionButton, ThemedFeedOverlay,
// ThemedFeedComposer, ThemedFeedCard, FeedActionButton, legacy wrappers

struct RootView: View {
    @StateObject private var theme = ThemeManager.shared
    @StateObject private var storyViewModel = StoryViewModel()
    @StateObject private var statusViewModel = StatusViewModel()
    @StateObject private var conversationViewModel = ConversationListViewModel()
    @StateObject private var router = Router()
    @Environment(\.colorScheme) private var systemColorScheme
    @State private var showFeed = false
    @State private var showMenu = false
    @State private var notificationCount = 3
    @State private var pendingReplyContext: ReplyContext?
    @State private var showStoryViewerFromConv = false
    @State private var selectedStoryGroupIndexFromConv = 0

    // Free-position button coordinates (persisted as "x,y" strings, 0-1 normalized)
    @AppStorage("feedButtonPosition") private var feedButtonPosition: String = "0.0,0.0"  // Top-left default
    @AppStorage("menuButtonPosition") private var menuButtonPosition: String = "1.0,0.0" // Top-right default

    // Scroll visibility state (passed from ConversationListView)
    @State private var isScrollingDown = false

    // Helper to get ButtonPosition for menu ladder alignment
    private var menuButtonPos: ButtonPosition {
        let parts = menuButtonPosition.split(separator: ",")
        guard parts.count == 2,
              let x = Double(parts[0]),
              let y = Double(parts[1]) else {
            return .topRight
        }
        return ButtonPosition(x: CGFloat(x), y: CGFloat(y))
    }

    var body: some View {
        ZStack {
            // 1. Dynamic Background
            themedBackground

            // 2. Main content — NavigationStack
            NavigationStack(path: $router.path) {
                ConversationListView(
                    isScrollingDown: $isScrollingDown,
                    feedIsVisible: $showFeed,
                    onSelect: { conversation in
                        router.push(.conversation(conversation))
                    },
                    onStoryViewRequest: { groupIndex, _ in
                        selectedStoryGroupIndexFromConv = groupIndex
                        showStoryViewerFromConv = true
                    }
                )
                .navigationBarHidden(true)
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .conversation(let conv):
                        ConversationView(
                            conversation: conv,
                            replyContext: pendingReplyContext
                        )
                        .navigationBarHidden(true)
                    }
                }
            }

            // 3. Feed overlay
            if showFeed {
                ThemedFeedOverlay()
                    .transition(
                        .asymmetric(
                            insertion: .move(edge: .bottom)
                                .combined(with: .opacity),
                            removal: .move(edge: .bottom)
                                .combined(with: .scale(scale: 0.95))
                                .combined(with: .opacity)
                        )
                    )
                    .zIndex(50)
            }

            // 4. Draggable Floating buttons
            if !router.isInConversation {
                draggableFloatingButtons
            }

            // 5. Menu dismiss overlay
            if showMenu {
                Color.clear
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }
                    }
                    .zIndex(99)
            }

            // 6. Menu ladder
            if !router.isInConversation {
                menuLadder
            }
        }
        .environmentObject(router)
        .environmentObject(storyViewModel)
        .environmentObject(statusViewModel)
        .environmentObject(conversationViewModel)
        .task {
            // Connect Socket.IO early so the backend knows we're online
            MessageSocketManager.shared.connect()
            await storyViewModel.loadStories()
            await statusViewModel.loadStatuses()
            await conversationViewModel.loadConversations()
        }
        .fullScreenCover(isPresented: $showStoryViewerFromConv) {
            if selectedStoryGroupIndexFromConv < storyViewModel.storyGroups.count {
                StoryViewerView(
                    viewModel: storyViewModel,
                    groups: storyViewModel.storyGroups,
                    currentGroupIndex: selectedStoryGroupIndexFromConv,
                    isPresented: $showStoryViewerFromConv,
                    onReplyToStory: { replyContext in
                        showStoryViewerFromConv = false
                        handleStoryReply(replyContext)
                    }
                )
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: showFeed)
        .animation(.spring(), value: showMenu)
    }

    // MARK: - Handle Story Reply
    private func handleStoryReply(_ context: ReplyContext) {
        // Find the conversation for the story author
        let authorName: String
        switch context {
        case .story(_, let name, _): authorName = name
        case .status(_, let name, _, _): authorName = name
        }

        if let conversation = conversationViewModel.conversations.first(where: { $0.name == authorName && $0.type == .direct }) {
            pendingReplyContext = context
            router.navigateToConversation(conversation)
        }
    }

    // MARK: - Themed Background
    private var themedBackground: some View {
        ZStack {
            theme.backgroundGradient

            // Animated ambient orbs - now with floating motion
            ForEach(Array(theme.ambientOrbs.enumerated()), id: \.offset) { index, orb in
                Circle()
                    .fill(Color(hex: orb.color).opacity(orb.opacity))
                    .frame(width: orb.size, height: orb.size)
                    .blur(radius: orb.size * 0.25)
                    .offset(x: orb.offset.x, y: orb.offset.y)
                    .floating(
                        range: CGFloat(15 + index * 8),
                        duration: Double(4.0 + Double(index) * 1.2)
                    )
                    .scaleEffect(1.0)
                    .pulse(intensity: 0.06)
            }
        }
        .ignoresSafeArea()
    }

    // MARK: - Draggable Floating Buttons (Free Position)
    private var draggableFloatingButtons: some View {
        FreeFloatingButtonsContainer(
            leftPosition: $feedButtonPosition,
            rightPosition: $menuButtonPosition,
            onLeftTap: {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    showFeed.toggle()
                }
            },
            onRightTap: {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showMenu.toggle()
                }
            },
            isSearchBarVisible: !isScrollingDown,
            leftContent: {
                // Feed button content
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: "FF6B6B"), Color(hex: "4ECDC4")],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )

                    if showFeed {
                        // Animated logo when feed is open (with breathing effect)
                        AnimatedLogoView(color: .white, lineWidth: 3, continuous: true)
                            .frame(width: 26, height: 26)
                    } else {
                        Image(systemName: "square.stack.fill")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundColor(.white)
                    }
                }
            },
            rightContent: {
                // Menu button content
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: showMenu ? [Color(hex: "FF6B6B"), Color(hex: "4ECDC4")] : [Color(hex: "9B59B6"), Color(hex: "4ECDC4")],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )

                    Image(systemName: showMenu ? "person.3.fill" : "gearshape.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)

                    // Badge
                    if !showMenu && notificationCount > 0 {
                        NotificationBadge(count: notificationCount)
                    }
                }
            }
        )
        .zIndex(100)
    }

    // MARK: - Legacy Floating Buttons (kept for reference)
    private var floatingButtons: some View {
        VStack {
            HStack {
                // Left - Feed button
                ThemedFloatingButton(
                    icon: showFeed ? nil : "square.stack.fill",
                    colors: ["FF6B6B", "4ECDC4"],
                    showLogo: showFeed
                ) {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        showFeed.toggle()
                    }
                }

                Spacer()

                // Right - Menu button
                ThemedFloatingButton(
                    icon: showMenu ? "person.3.fill" : "gearshape.fill",
                    colors: showMenu ? ["FF6B6B", "4ECDC4"] : ["9B59B6", "4ECDC4"],
                    badge: showMenu ? 0 : notificationCount
                ) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showMenu.toggle()
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)

            Spacer()
        }
        .zIndex(100)
    }

    // MARK: - Menu Ladder (positioned relative to menu button)
    private var menuLadder: some View {
        GeometryReader { geometry in
            let safeArea = geometry.safeAreaInsets
            let size = geometry.size
            let pos = menuButtonPos

            // Calculate button position on screen
            let minEdgePadding: CGFloat = 20
            let topSafeZone: CGFloat = 50
            let bottomSafeZone: CGFloat = isScrollingDown ? 50 : 110
            let buttonSize: CGFloat = 52
            let halfButton = buttonSize / 2

            let minX = safeArea.leading + minEdgePadding + halfButton
            let maxX = size.width - safeArea.trailing - minEdgePadding - halfButton
            let minY = safeArea.top + topSafeZone + halfButton
            let maxY = size.height - safeArea.bottom - bottomSafeZone - halfButton

            let buttonX = minX + (maxX - minX) * pos.x
            let buttonY = minY + (maxY - minY) * pos.y

            // Menu items configuration
            let menuItemSize: CGFloat = 46
            let menuSpacing: CGFloat = 12

            // Determine if menu should expand up or down
            let expandDown = pos.y < 0.5

            // Calculate menu position
            let menuX = pos.isLeft ? buttonX : buttonX
            let menuStartY = expandDown ? buttonY + halfButton + 16 : buttonY - halfButton - 16

            // Menu items
            let menuItems: [(icon: String, color: String, action: () -> Void)] = [
                ("person.fill", "9B59B6", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false } }),
                ("plus.message.fill", "4ECDC4", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false } }),
                ("link.badge.plus", "F8B500", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false } }),
                ("bell.fill", "FF6B6B", { notificationCount = 0; withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false } }),
                (theme.preference.icon, theme.preference.tintColor, {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        theme.cyclePreference(systemScheme: systemColorScheme)
                    }
                }),
                ("gearshape.fill", "45B7D1", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false } })
            ]

            ForEach(Array(menuItems.enumerated()), id: \.offset) { index, item in
                let yOffset = expandDown
                    ? CGFloat(index) * (menuItemSize + menuSpacing)
                    : -CGFloat(index) * (menuItemSize + menuSpacing)

                let itemY = menuStartY + yOffset

                // Special handling for notifications badge
                if item.icon == "bell.fill" {
                    ThemedActionButton(icon: item.icon, color: item.color, badge: notificationCount, action: item.action)
                        .position(x: menuX, y: itemY)
                        .menuAnimation(showMenu: showMenu, delay: Double(index) * 0.04)
                } else {
                    ThemedActionButton(icon: item.icon, color: item.color, action: item.action)
                        .position(x: menuX, y: itemY)
                        .menuAnimation(showMenu: showMenu, delay: Double(index) * 0.04)
                }
            }
        }
        .ignoresSafeArea()
        .zIndex(showMenu ? 151 : -1)
        .allowsHitTesting(showMenu)
    }
}

// MARK: - Menu Animation Modifier
extension View {
    func menuAnimation(showMenu: Bool, delay: Double) -> some View {
        self
            .scaleEffect(showMenu ? 1 : 0.3)
            .opacity(showMenu ? 1 : 0)
            .rotationEffect(.degrees(showMenu ? 0 : -30))
            .animation(
                .spring(response: showMenu ? 0.4 : 0.25, dampingFraction: 0.65)
                    .delay(showMenu ? delay : 0),
                value: showMenu
            )
    }
}
