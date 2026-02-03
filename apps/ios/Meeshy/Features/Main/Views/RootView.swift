import SwiftUI

struct RootView: View {
    @StateObject private var theme = ThemeManager.shared
    @State private var showConversation = false
    @State private var showFeed = false
    @State private var showMenu = false
    @State private var selectedConversation: Conversation?
    @State private var notificationCount = 3

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
                ConversationView(conversation: selectedConversation) {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                        showConversation = false
                    }
                }
                .transition(.move(edge: .trailing))
            } else {
                ConversationListView(
                    isScrollingDown: $isScrollingDown,
                    onSelect: { conversation in
                        selectedConversation = conversation
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                            showConversation = true
                        }
                    }
                )
            }

            // 3. Feed overlay
            if showFeed {
                ThemedFeedOverlay()
                    .transition(.move(edge: .bottom))
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
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: showConversation)
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: showFeed)
        .animation(.spring(), value: showMenu)
    }

    // MARK: - Themed Background
    private var themedBackground: some View {
        ZStack {
            theme.backgroundGradient

            // Animated ambient orbs
            ForEach(Array(theme.ambientOrbs.enumerated()), id: \.offset) { index, orb in
                Circle()
                    .fill(Color(hex: orb.color).opacity(orb.opacity))
                    .frame(width: orb.size, height: orb.size)
                    .blur(radius: orb.size * 0.25)
                    .offset(x: orb.offset.x, y: orb.offset.y)
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
                        // Animated logo when feed is open
                        AnimatedLogoView(color: .white, lineWidth: 3)
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
            .animation(.spring(response: 0.35, dampingFraction: 0.7).delay(delay), value: showMenu)
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
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: color), Color(hex: color).opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 46, height: 46)
                    .shadow(color: Color(hex: color).opacity(0.55), radius: 10, y: 4)

                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.white)

                if badge > 0 {
                    Text("\(min(badge, 99))")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(Color(hex: color))
                        .frame(width: 16, height: 16)
                        .background(Circle().fill(Color.white))
                        .offset(x: 15, y: -15)
                }
            }
            .scaleEffect(isPressed ? 0.85 : 1)
        }
    }
}

// MARK: - Themed Feed Overlay
struct ThemedFeedOverlay: View {
    @ObservedObject private var theme = ThemeManager.shared
    @State private var composerText = ""
    @FocusState private var isComposerFocused: Bool

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

                Circle()
                    .fill(Color(hex: "FF6B6B").opacity(theme.mode.isDark ? 0.1 : 0.06))
                    .frame(width: 250, height: 250)
                    .blur(radius: 70)
                    .offset(x: 100, y: 200)
            }
            .ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(spacing: 14) {
                    Spacer().frame(height: 70)

                    // Composer
                    ThemedFeedComposer(text: $composerText, isFocused: _isComposerFocused)

                    // Feed items
                    ForEach(SampleData.feedItems) { item in
                        ThemedFeedCard(item: item)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 100)
            }
        }
    }
}

// MARK: - Themed Feed Composer
struct ThemedFeedComposer: View {
    @Binding var text: String
    @FocusState var isFocused: Bool
    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                // Avatar with animated logo
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: "FF6B6B"), Color(hex: "4ECDC4")],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 44, height: 44)
                    .overlay(
                        AnimatedLogoView(color: .white, lineWidth: 2)
                            .frame(width: 22, height: 22)
                    )
                    .shadow(color: Color(hex: "FF6B6B").opacity(0.3), radius: 6, y: 3)

                TextField("Quoi de neuf ?", text: $text)
                    .focused($isFocused)
                    .foregroundColor(theme.textPrimary)
                    .font(.system(size: 15))

                Spacer()

                // Media button
                Button {} label: {
                    Image(systemName: "photo.on.rectangle")
                        .font(.system(size: 18))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color(hex: "9B59B6"), Color(hex: "4ECDC4")],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                }
            }

            if isFocused || !text.isEmpty {
                HStack(spacing: 16) {
                    ForEach([("camera.fill", "FF6B6B"), ("face.smiling", "F8B500"), ("location.fill", "4ECDC4")], id: \.0) { icon, color in
                        Button {} label: {
                            Image(systemName: icon)
                                .foregroundColor(Color(hex: color))
                        }
                    }

                    Spacer()

                    Button {
                        text = ""
                        isFocused = false
                    } label: {
                        Text("Publier")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(
                                Capsule()
                                    .fill(
                                        text.isEmpty ?
                                        LinearGradient(colors: [theme.inputBorder, theme.inputBorder], startPoint: .leading, endPoint: .trailing) :
                                        LinearGradient(colors: [Color(hex: "FF6B6B"), Color(hex: "E91E63")], startPoint: .leading, endPoint: .trailing)
                                    )
                                    .shadow(color: text.isEmpty ? .clear : Color(hex: "FF6B6B").opacity(0.4), radius: 6, y: 3)
                            )
                    }
                    .disabled(text.isEmpty)
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(theme.surfaceGradient(tint: "4ECDC4"))
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .stroke(
                            isFocused ?
                            LinearGradient(colors: [Color(hex: "FF6B6B"), Color(hex: "4ECDC4")], startPoint: .leading, endPoint: .trailing) :
                            theme.border(tint: "4ECDC4", intensity: 0.3),
                            lineWidth: isFocused ? 2 : 1
                        )
                )
        )
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isFocused)
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

    var body: some View {
        Button(action: { action?() }) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                Text("\(count)")
                    .font(.system(size: 13, weight: .medium))
            }
            .foregroundColor(Color(hex: color).opacity(isActive ? 1 : 0.7))
            .scaleEffect(isActive ? 1.1 : 1)
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isActive)
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
