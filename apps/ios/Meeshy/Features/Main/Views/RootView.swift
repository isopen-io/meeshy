import SwiftUI

struct RootView: View {
    @StateObject private var theme = ThemeManager.shared
    @StateObject private var storyViewModel = StoryViewModel()
    @StateObject private var statusViewModel = StatusViewModel()
    @StateObject private var conversationViewModel = ConversationListViewModel()
    @State private var showConversation = false
    @State private var showFeed = false
    @State private var showMenu = false
    @State private var selectedConversation: Conversation?
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

            // 2. Main content
            if showConversation {
                ConversationView(
                    conversation: selectedConversation,
                    replyContext: pendingReplyContext,
                    onBack: {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                            showConversation = false
                            pendingReplyContext = nil
                        }
                    }
                )
                .transition(
                    .asymmetric(
                        insertion: .move(edge: .trailing)
                            .combined(with: .opacity),
                        removal: .move(edge: .trailing)
                            .combined(with: .scale(scale: 0.95))
                            .combined(with: .opacity)
                    )
                )
            } else {
                ConversationListView(
                    isScrollingDown: $isScrollingDown,
                    feedIsVisible: $showFeed,
                    onSelect: { conversation in
                        selectedConversation = conversation
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                            showConversation = true
                        }
                    },
                    onStoryViewRequest: { groupIndex, _ in
                        selectedStoryGroupIndexFromConv = groupIndex
                        showStoryViewerFromConv = true
                    }
                )
                .transition(
                    .asymmetric(
                        insertion: .scale(scale: 0.97)
                            .combined(with: .opacity),
                        removal: .scale(scale: 0.95)
                            .combined(with: .opacity)
                    )
                )
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
            if !showConversation {
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
            if !showConversation {
                menuLadder
            }
        }
        .environmentObject(storyViewModel)
        .environmentObject(statusViewModel)
        .environmentObject(conversationViewModel)
        .task {
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
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: showConversation)
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
            selectedConversation = conversation
            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                showConversation = true
            }
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
                (theme.mode.isDark ? "sun.max.fill" : "moon.fill", theme.mode.isDark ? "F8B500" : "9B59B6", {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        theme.mode = theme.mode.isDark ? .light : .dark
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
            .animation(.spring(response: 0.4, dampingFraction: 0.65).delay(delay), value: showMenu)
    }
}

// MARK: - Themed Floating Button
struct ThemedFloatingButton: View {
    let icon: String?
    let colors: [String]
    var showLogo: Bool = false
    var badge: Int = 0
    let action: () -> Void

    @ObservedObject private var theme = ThemeManager.shared
    @State private var isPressed = false

    var body: some View {
        Button(action: {
            HapticFeedback.light()
            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = false }
            }
            action()
        }) {
            ZStack {
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 48, height: 48)
                    .overlay(
                        Circle()
                            .stroke(
                                LinearGradient(
                                    colors: colors.map { Color(hex: $0).opacity(0.5) },
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1.5
                            )
                    )
                    .shadow(color: Color(hex: colors[0]).opacity(0.35), radius: 10, y: 5)

                if showLogo {
                    AnimatedLogoView(color: .white, lineWidth: 2.5)
                        .frame(width: 24, height: 24)
                } else if let icon = icon {
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(
                            LinearGradient(
                                colors: colors.map { Color(hex: $0) },
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                }

                // Badge
                if badge > 0 {
                    Text("\(badge)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 18, height: 18)
                        .background(
                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: [Color(hex: "FF6B6B"), Color(hex: "E91E63")],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .shadow(color: Color(hex: "FF6B6B").opacity(0.5), radius: 4)
                        )
                        .offset(x: 16, y: -16)
                }
            }
            .scaleEffect(isPressed ? 0.9 : 1)
        }
    }
}

// MARK: - Themed Action Button
struct ThemedActionButton: View {
    let icon: String
    let color: String
    var badge: Int = 0
    let action: () -> Void

    @State private var isPressed = false
    @State private var isGlowing = false

    var body: some View {
        Button(action: {
            HapticFeedback.light()
            withAnimation(.spring(response: 0.15, dampingFraction: 0.5)) { isPressed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.5)) { isPressed = false }
            }
            action()
        }) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: color), Color(hex: color).opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 46, height: 46)
                    .shadow(
                        color: Color(hex: color).opacity(isGlowing ? 0.65 : 0.45),
                        radius: isGlowing ? 14 : 10,
                        y: 4
                    )

                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.white)
                    .scaleEffect(isPressed ? 1.2 : 1.0)
                    .rotationEffect(.degrees(isPressed ? -8 : 0))

                if badge > 0 {
                    Text("\(min(badge, 99))")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(Color(hex: color))
                        .frame(width: 16, height: 16)
                        .background(Circle().fill(Color.white))
                        .offset(x: 15, y: -15)
                        .pulse(intensity: 0.08)
                }
            }
            .scaleEffect(isPressed ? 0.82 : 1)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
                isGlowing = true
            }
        }
    }
}

// MARK: - Themed Feed Overlay
struct ThemedFeedOverlay: View {
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel = FeedViewModel()
    @EnvironmentObject var storyViewModel: StoryViewModel
    @EnvironmentObject var statusViewModel: StatusViewModel
    @StateObject private var discoverStatusViewModel = StatusViewModel(mode: .discover)
    @State private var composerText = ""
    @FocusState private var isComposerFocused: Bool
    @State private var showStoryViewer = false
    @State private var selectedGroupIndex = 0
    @State private var showStatusComposer = false

    var body: some View {
        ZStack {
            // Background
            ZStack {
                theme.backgroundGradient

                Circle()
                    .fill(Color(hex: "4ECDC4").opacity(theme.mode.isDark ? 0.1 : 0.06))
                    .frame(width: 300, height: 300)
                    .blur(radius: 80)
                    .offset(x: -80, y: -100)
                    .floating(range: 20, duration: 5.0)

                Circle()
                    .fill(Color(hex: "FF6B6B").opacity(theme.mode.isDark ? 0.1 : 0.06))
                    .frame(width: 250, height: 250)
                    .blur(radius: 70)
                    .offset(x: 100, y: 200)
                    .floating(range: 18, duration: 6.0)
            }
            .ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 14) {
                    Spacer().frame(height: 70)

                    // Story Tray
                    StoryTrayView(viewModel: storyViewModel) { groupIndex in
                        selectedGroupIndex = groupIndex
                        showStoryViewer = true
                    }

                    // Discover statuses
                    StatusBarView(viewModel: discoverStatusViewModel, onAddStatus: {
                        showStatusComposer = true
                    })

                    // Composer (padding is included in the component)
                    ThemedFeedComposer(text: $composerText, isFocused: _isComposerFocused)

                    // Feed posts with infinite scroll
                    ForEach(Array(viewModel.posts.enumerated()), id: \.element.id) { index, post in
                        FeedPostCard(post: post)
                            .staggeredAppear(index: index, baseDelay: 0.06)
                            .onAppear {
                                Task { await viewModel.loadMoreIfNeeded(currentPost: post) }
                            }
                    }

                    // Loading indicator
                    if viewModel.isLoadingMore {
                        ProgressView()
                            .tint(Color(hex: "4ECDC4"))
                            .padding()
                    }
                }
                .padding(.bottom, 100)
            }
            .refreshable {
                await viewModel.refresh()
                await storyViewModel.loadStories()
                await statusViewModel.loadStatuses()
                await discoverStatusViewModel.refresh()
            }
        }
        .task {
            if viewModel.posts.isEmpty {
                await viewModel.loadFeed()
            }
            await storyViewModel.loadStories()
            await statusViewModel.loadStatuses()
            await discoverStatusViewModel.loadStatuses()
            discoverStatusViewModel.subscribeToSocketEvents()
        }
        .fullScreenCover(isPresented: $showStoryViewer) {
            StoryViewerView(
                viewModel: storyViewModel,
                groups: storyViewModel.storyGroups,
                currentGroupIndex: selectedGroupIndex,
                isPresented: $showStoryViewer
            )
        }
        .sheet(isPresented: $showStatusComposer) {
            StatusComposerView(viewModel: statusViewModel)
                .presentationDetents([.medium])
        }
    }
}

// MARK: - Themed Feed Composer
struct ThemedFeedComposer: View {
    @Binding var text: String
    @FocusState var isFocused: Bool
    @ObservedObject private var theme = ThemeManager.shared
    @State private var showAttachmentMenu = false

    // Attachment options (without mic - mic is the toggle button when expanded)
    private let attachmentOptions: [(icon: String, color: String)] = [
        ("photo.on.rectangle.angled", "9B59B6"),
        ("camera.fill", "FF6B6B"),
        ("doc.fill", "3498DB"),
        ("location.fill", "2ECC71")
    ]

    private var hasTextToPublish: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            // Main composer card
            HStack(alignment: .top, spacing: 12) {
                // Avatar
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: "FF6B6B"), Color(hex: "4ECDC4")],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 40, height: 40)
                    .overlay(
                        Text("M")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                    )

                // Multi-line text input
                ZStack(alignment: .topLeading) {
                    // Placeholder
                    if text.isEmpty {
                        Text("Partager quelque chose avec le monde...")
                            .font(.system(size: 14))
                            .foregroundColor(theme.textMuted)
                            .padding(.horizontal, 4)
                            .padding(.top, 8)
                    }

                    // TextEditor for multi-line support
                    TextEditor(text: $text)
                        .focused($isFocused)
                        .foregroundColor(theme.textPrimary)
                        .font(.system(size: 14))
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 36, maxHeight: 100)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(theme.inputBackground)
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(
                                    isFocused ?
                                    Color(hex: "4ECDC4").opacity(0.5) :
                                    theme.inputBorder,
                                    lineWidth: 1
                                )
                        )
                )

                // Right column: (+)/mic button and Publish button
                VStack(spacing: 8) {
                    // Toggle button: (+) when closed, mic when open
                    Button {
                        HapticFeedback.light()
                        if showAttachmentMenu {
                            // Mic action when menu is open
                            // TODO: Start voice recording
                        } else {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                showAttachmentMenu = true
                            }
                        }
                    } label: {
                        ZStack {
                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: showAttachmentMenu ?
                                            [Color(hex: "F8B500"), Color(hex: "FF9500")] :
                                            [Color(hex: "4ECDC4"), Color(hex: "45B7D1")],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 32, height: 32)
                                .shadow(color: (showAttachmentMenu ? Color(hex: "F8B500") : Color(hex: "4ECDC4")).opacity(0.4), radius: 6, y: 3)

                            Image(systemName: showAttachmentMenu ? "mic.fill" : "plus")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white)
                        }
                    }

                    // Publish button (below + button)
                    if hasTextToPublish {
                        Button {
                            text = ""
                            isFocused = false
                            showAttachmentMenu = false
                            HapticFeedback.success()
                        } label: {
                            ZStack {
                                Circle()
                                    .fill(
                                        LinearGradient(
                                            colors: [Color(hex: "FF6B6B"), Color(hex: "E91E63")],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .frame(width: 32, height: 32)
                                    .shadow(color: Color(hex: "FF6B6B").opacity(0.5), radius: 6, y: 3)

                                Image(systemName: "paperplane.fill")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(.white)
                                    .rotationEffect(.degrees(45))
                                    .offset(x: -1, y: 1)
                            }
                        }
                        .transition(.scale.combined(with: .opacity))
                    }
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(theme.surfaceGradient(tint: "4ECDC4"))
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(theme.border(tint: "4ECDC4", intensity: 0.25), lineWidth: 1)
                    )
            )

            // Attachment menu overlay - floating icons without background
            if showAttachmentMenu {
                HStack(spacing: 12) {
                    ForEach(attachmentOptions, id: \.icon) { option in
                        Button {
                            HapticFeedback.light()
                            // TODO: Handle attachment selection
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                showAttachmentMenu = false
                            }
                        } label: {
                            Image(systemName: option.icon)
                                .font(.system(size: 18, weight: .medium))
                                .foregroundColor(Color(hex: option.color))
                                .shadow(color: Color(hex: option.color).opacity(0.5), radius: 4, y: 2)
                        }
                        .transition(.scale.combined(with: .opacity))
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    Capsule()
                        .fill(theme.mode.isDark ? Color(hex: "1E1E2E").opacity(0.92) : Color.white.opacity(0.92))
                        .shadow(color: Color.black.opacity(0.2), radius: 12, y: 6)
                )
                .offset(x: -8, y: -50)
                .transition(.scale(scale: 0.5, anchor: .bottomTrailing).combined(with: .opacity))
                .zIndex(100)
            }
        }
        .padding(.horizontal, 16)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isFocused)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: text.isEmpty)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showAttachmentMenu)
        .onChange(of: isFocused) { focused in
            // Hide attachment menu when focusing on text
            if focused && showAttachmentMenu {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showAttachmentMenu = false
                }
            }
        }
    }
}

// MARK: - Themed Feed Card
struct ThemedFeedCard: View {
    let item: FeedItem
    @ObservedObject private var theme = ThemeManager.shared
    @State private var isLiked = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack(spacing: 12) {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: item.color), Color(hex: item.color).opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 44, height: 44)
                    .overlay(
                        Text(String(item.author.prefix(1)))
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                    )
                    .shadow(color: Color(hex: item.color).opacity(0.4), radius: 6, y: 3)

                VStack(alignment: .leading, spacing: 2) {
                    Text(item.author)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(theme.textPrimary)

                    Text("2h")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color(hex: item.color))
                }

                Spacer()

                Button {} label: {
                    Image(systemName: "ellipsis")
                        .foregroundColor(theme.textMuted)
                }
            }

            // Content
            Text(item.content)
                .font(.system(size: 15))
                .foregroundColor(theme.textSecondary)
                .lineLimit(3)

            // Actions
            HStack(spacing: 20) {
                FeedActionButton(icon: isLiked ? "heart.fill" : "heart", color: "FF6B6B", count: item.likes + (isLiked ? 1 : 0), isActive: isLiked) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { isLiked.toggle() }
                }
                FeedActionButton(icon: "bubble.right", color: "4ECDC4", count: Int.random(in: 0...30))
                FeedActionButton(icon: "arrow.2.squarepath", color: "9B59B6", count: Int.random(in: 0...15))

                Spacer()

                Button {} label: {
                    Image(systemName: "bookmark")
                        .foregroundColor(Color(hex: "F8B500"))
                }
            }
            .padding(.top, 4)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(theme.surfaceGradient(tint: item.color))
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .stroke(theme.border(tint: item.color), lineWidth: 1)
                )
                .shadow(color: Color(hex: item.color).opacity(theme.mode.isDark ? 0.15 : 0.1), radius: 8, y: 4)
        )
    }
}

// MARK: - Feed Action Button
struct FeedActionButton: View {
    let icon: String
    let color: String
    let count: Int
    var isActive: Bool = false
    var action: (() -> Void)? = nil

    @State private var bounce = false

    var body: some View {
        Button(action: {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.5)) {
                bounce = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                bounce = false
            }
            action?()
        }) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .scaleEffect(bounce ? 1.3 : 1)
                    .rotationEffect(.degrees(bounce ? -15 : 0))
                Text("\(count)")
                    .font(.system(size: 13, weight: .medium))
            }
            .foregroundColor(Color(hex: color).opacity(isActive ? 1 : 0.7))
            .scaleEffect(isActive ? 1.1 : 1)
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.5), value: isActive)
        .animation(.spring(response: 0.25, dampingFraction: 0.5), value: bounce)
    }
}

// MARK: - Legacy Support
struct FeedOverlay: View {
    var body: some View { ThemedFeedOverlay() }
}

struct ColorfulFeedOverlay: View {
    var body: some View { ThemedFeedOverlay() }
}

struct ColorfulFeedComposer: View {
    @Binding var text: String
    @FocusState var isFocused: Bool
    var body: some View { ThemedFeedComposer(text: $text, isFocused: _isFocused) }
}

struct ColorfulFeedCard: View {
    let author: String
    let content: String
    let time: String
    let color: String
    var body: some View {
        ThemedFeedCard(item: FeedItem(author: author, content: content, likes: 0, color: color))
    }
}

struct ColorfulFeedAction: View {
    let icon: String
    let color: String
    let count: Int
    var body: some View { FeedActionButton(icon: icon, color: color, count: count) }
}

struct ColorfulQuickActionButton: View {
    let icon: String
    let color: String
    var badge: Int = 0
    let action: () -> Void
    var body: some View { ThemedActionButton(icon: icon, color: color, badge: badge, action: action) }
}

struct QuickActionButton: View {
    let icon: String
    let color: String
    var badge: Int = 0
    let action: () -> Void
    var body: some View { ThemedActionButton(icon: icon, color: color, badge: badge, action: action) }
}

struct FeedComposer: View {
    @Binding var text: String
    @FocusState var isFocused: Bool
    var body: some View { ThemedFeedComposer(text: $text, isFocused: _isFocused) }
}

struct LegacyFeedCard: View {
    let author: String
    let content: String
    let time: String
    var body: some View {
        ThemedFeedCard(item: FeedItem(author: author, content: content))
    }
}

struct FeedAction: View {
    let icon: String
    let count: Int
    var body: some View { FeedActionButton(icon: icon, color: "4ECDC4", count: count) }
}
