import SwiftUI
import MeeshySDK
import MeeshyUI

// Components extracted to RootViewComponents.swift:
// ThemedFloatingButton, ThemedActionButton, ThemedFeedOverlay,
// ThemedFeedComposer, ThemedFeedCard, FeedActionButton, legacy wrappers

struct RootView: View {
    @StateObject private var theme = ThemeManager.shared
    @StateObject private var toastManager = ToastManager.shared
    @StateObject private var storyViewModel = StoryViewModel()
    @StateObject private var statusViewModel = StatusViewModel()
    @StateObject private var conversationViewModel = ConversationListViewModel()
    @StateObject private var router = Router()
    @ObservedObject private var callManager = CallManager.shared
    @ObservedObject private var networkMonitor = NetworkMonitor.shared
    @EnvironmentObject private var deepLinkRouter: DeepLinkRouter
    @Environment(\.colorScheme) private var systemColorScheme
    @State private var showFeed = false
    @State private var showMenu = false
    @State private var notificationCount = 3
    @State private var pendingReplyContext: ReplyContext?
    @State private var showStoryViewerFromConv = false
    @State private var selectedStoryGroupIndexFromConv = 0
    @State private var joinFlowIdentifier: String?
    @State private var showJoinFlow = false

    // Free-position button coordinates (persisted as "x,y" strings, 0-1 normalized)
    @AppStorage("feedButtonPosition") private var feedButtonPosition: String = "0.0,0.0"  // Top-left default
    @AppStorage("menuButtonPosition") private var menuButtonPosition: String = "1.0,0.0" // Top-right default

    // Scroll visibility state (passed from ConversationListView)
    @State private var isScrollingDown = false

    // Share sheet state (triggered by deep link)
    @State private var showSharePicker = false

    // Notification sheet
    @State private var showNotifications = false

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

    private var isCallActive: Bool {
        callManager.callState.isActive
    }

    var body: some View {
        ZStack {
            // 1. Dynamic Background
            themedBackground

            // 2. Main content -- NavigationStack
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
                    case .settings:
                        SettingsView()
                            .navigationBarHidden(true)
                    case .profile:
                        ProfileView()
                            .navigationBarHidden(true)
                    case .newConversation:
                        NewConversationView()
                            .navigationBarHidden(true)
                    case .communityList:
                        CommunityListView(
                            onSelectCommunity: { community in
                                router.push(.communityDetail(community.id))
                            },
                            onCreateCommunity: {
                                router.push(.communityCreate)
                            },
                            onDismiss: { router.pop() }
                        )
                        .navigationBarHidden(true)
                    case .communityDetail(let communityId):
                        CommunityDetailView(
                            communityId: communityId,
                            onSelectConversation: { apiConversation in
                                let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                                let conv = apiConversation.toConversation(currentUserId: currentUserId)
                                router.push(.conversation(conv))
                            },
                            onOpenSettings: { community in
                                router.push(.communitySettings(community))
                            },
                            onOpenMembers: { id in
                                router.push(.communityMembers(id))
                            },
                            onInvite: { id in
                                router.push(.communityInvite(id))
                            },
                            onDismiss: { router.pop() }
                        )
                        .navigationBarHidden(true)
                    case .communityCreate:
                        CommunityCreateView(
                            onCreated: { community in
                                router.pop()
                                router.push(.communityDetail(community.id))
                            },
                            onDismiss: { router.pop() }
                        )
                        .navigationBarHidden(true)
                    case .communitySettings(let community):
                        CommunitySettingsView(
                            community: community,
                            onUpdated: { _ in router.pop() },
                            onDeleted: { router.popToRoot() },
                            onLeft: { router.popToRoot() }
                        )
                    case .communityMembers(let communityId):
                        CommunityMembersView(
                            communityId: communityId,
                            onInvite: {
                                router.push(.communityInvite(communityId))
                            }
                        )
                    case .communityInvite(let communityId):
                        CommunityInviteView(communityId: communityId)
                    case .notifications:
                        NotificationListView(
                            onNotificationTap: { _ in },
                            onDismiss: { router.pop() }
                        )
                        .navigationBarHidden(true)
                    case .userStats:
                        UserStatsView()
                            .navigationBarHidden(true)
                    case .affiliate:
                        AffiliateView()
                            .navigationBarHidden(true)
                    case .trackingLinks:
                        TrackingLinksView()
                            .navigationBarHidden(true)
                    case .shareLinks:
                        ShareLinksView()
                            .navigationBarHidden(true)
                    case .communityLinks:
                        CommunityLinksView()
                            .navigationBarHidden(true)
                    case .dataExport:
                        DataExportView()
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

            // 7. Offline banner
            if networkMonitor.isOffline {
                VStack {
                    OfflineBanner()
                        .transition(.move(edge: .top).combined(with: .opacity))
                    Spacer()
                }
                .animation(.spring(response: 0.4, dampingFraction: 0.8), value: networkMonitor.isOffline)
                .zIndex(190)
            }

            // 8. Toast overlay
            VStack {
                if let toast = toastManager.currentToast {
                    ToastView(toast: toast)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .padding(.top, MeeshySpacing.xxl)
                        .onTapGesture {
                            toastManager.dismiss()
                        }
                }
                Spacer()
            }
            .animation(MeeshyAnimation.springDefault, value: toastManager.currentToast)
            .zIndex(200)
        }
        .environment(\.openURL, OpenURLAction { url in
            let destination = DeepLinkParser.parse(url)
            switch destination {
            case .external:
                return .systemAction
            default:
                router.handleDeepLink(url)
                return .handled
            }
        })
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
        .fullScreenCover(isPresented: Binding(
            get: { isCallActive },
            set: { if !$0 { callManager.endCall() } }
        )) {
            CallView()
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: showFeed)
        .animation(.spring(), value: showMenu)
        .onReceive(NotificationCenter.default.publisher(for: .navigateToConversation)) { notification in
            if let conversation = notification.object as? Conversation {
                router.navigateToConversation(conversation)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("sendMessageToUser"))) { notification in
            guard let targetUserId = notification.object as? String else { return }
            if let existingConv = conversationViewModel.conversations.first(where: {
                $0.type == .direct && $0.participantUserId == targetUserId
            }) {
                router.navigateToConversation(existingConv)
                return
            }
            Task {
                do {
                    let response = try await ConversationService.shared.create(
                        type: "direct",
                        participantIds: [targetUserId]
                    )
                    let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                    let apiConv = try await ConversationService.shared.getById(response.id)
                    let conv = apiConv.toConversation(currentUserId: currentUserId)
                    router.navigateToConversation(conv)
                } catch {
                    ToastManager.shared.showError("Impossible de creer la conversation")
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("openProfileSheet"))) { notification in
            guard let info = notification.object as? [String: String],
                  let userId = info["userId"] else { return }
            let username = info["username"] ?? userId
            router.deepLinkProfileUser = ProfileSheetUser(userId: userId, username: username)
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("pushNavigateToRoute"))) { notification in
            guard let routeName = notification.object as? String else { return }
            switch routeName {
            case "userStats": router.push(.userStats)
            case "affiliate": router.push(.affiliate)
            default: break
            }
        }
        .onOpenURL { url in
            router.handleDeepLink(url)
        }
        .sheet(item: $router.deepLinkProfileUser) { user in
            ProfileFetchingSheet(user: user)
        }
        .sheet(isPresented: $showSharePicker) {
            if let content = router.pendingShareContent {
                SharePickerView(
                    sharedContent: content,
                    onDismiss: {
                        router.pendingShareContent = nil
                    }
                )
                .environmentObject(conversationViewModel)
                .environmentObject(router)
                .presentationDetents([.medium, .large])
            }
        }
        .onChange(of: router.pendingShareContent != nil) { _, hasContent in
            if hasContent {
                showSharePicker = true
            }
        }
        .sheet(isPresented: $showJoinFlow) {
            if let identifier = joinFlowIdentifier {
                JoinFlowSheet(identifier: identifier) { joinResponse in
                    handleJoinSuccess(joinResponse)
                }
            }
        }
        .sheet(isPresented: $showNotifications) {
            NotificationListView(
                onNotificationTap: { notification in
                    showNotifications = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        handleNotificationTap(notification)
                    }
                },
                onDismiss: { showNotifications = false }
            )
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
        }
        .onChange(of: deepLinkRouter.pendingDeepLink) { _, newValue in
            handleDeepLink(newValue)
        }
    }

    // MARK: - Deep Link Handling

    private func handleDeepLink(_ deepLink: DeepLink?) {
        guard let deepLink = deepLinkRouter.consumePendingDeepLink() else { return }

        switch deepLink {
        case .joinLink(let identifier):
            joinFlowIdentifier = identifier
            showJoinFlow = true

        case .conversation(let id):
            let conv = Conversation(
                id: id, identifier: id, type: .group,
                title: nil, lastMessageAt: Date(), createdAt: Date(), updatedAt: Date()
            )
            router.navigateToConversation(conv)

        case .magicLink:
            break
        }
    }

    private func handleJoinSuccess(_ response: AnonymousJoinResponse) {
        let conv = Conversation(
            id: response.conversation.id,
            identifier: response.conversation.id,
            type: response.conversation.type.lowercased() == "group" ? .group : .direct,
            title: response.conversation.title,
            lastMessageAt: Date(),
            createdAt: Date(),
            updatedAt: Date()
        )
        router.navigateToConversation(conv)
    }

    // MARK: - Handle Story Reply
    private func handleStoryReply(_ context: ReplyContext) {
        let authId: String
        switch context {
        case .story(_, let authorId, _, _): authId = authorId
        case .status(_, let authorId, _, _, _): authId = authorId
        }

        if let existingConv = conversationViewModel.conversations.first(where: {
            $0.type == .direct && $0.participantUserId == authId
        }) {
            pendingReplyContext = context
            router.navigateToConversation(existingConv)
            return
        }

        Task {
            do {
                let response = try await ConversationService.shared.create(
                    type: "direct",
                    participantIds: [authId]
                )
                let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                let apiConv = try await ConversationService.shared.getById(response.id)
                let conv = apiConv.toConversation(currentUserId: currentUserId)

                await MainActor.run {
                    pendingReplyContext = context
                    router.navigateToConversation(conv)
                }
            } catch {
                ToastManager.shared.showError("Impossible de créer la conversation")
            }
        }
    }

    // MARK: - Handle Notification Tap

    private func handleNotificationTap(_ notification: APINotification) {
        let data = notification.data

        switch notification.notificationType {
        case .newMessage, .messageReaction, .mention, .translationReady, .storyReply:
            guard let conversationId = data?.conversationId else { return }
            navigateToConversationById(conversationId)

        case .friendRequest, .friendAccepted, .statusUpdate:
            if let senderId = notification.senderId {
                router.deepLinkProfileUser = ProfileSheetUser(userId: senderId, username: notification.senderName ?? senderId)
            }

        case .groupInvite, .groupJoined, .groupLeft:
            if let conversationId = data?.conversationId {
                navigateToConversationById(conversationId)
            }

        case .postLike, .postComment:
            if let conversationId = data?.conversationId {
                navigateToConversationById(conversationId)
            }

        case .callMissed, .callIncoming:
            if let conversationId = data?.conversationId {
                navigateToConversationById(conversationId)
            }

        case .achievementUnlocked:
            router.push(.userStats)

        case .affiliateSignup:
            router.push(.affiliate)

        case .systemAlert:
            break
        }
    }

    private func navigateToConversationById(_ conversationId: String) {
        if let existing = conversationViewModel.conversations.first(where: { $0.id == conversationId }) {
            router.navigateToConversation(existing)
            return
        }
        Task {
            do {
                let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                let apiConv = try await ConversationService.shared.getById(conversationId)
                let conv = apiConv.toConversation(currentUserId: currentUserId)
                router.navigateToConversation(conv)
            } catch {
                ToastManager.shared.showError("Impossible d'ouvrir la conversation")
            }
        }
    }

    // MARK: - Themed Background
    private var themedBackground: some View {
        ZStack {
            theme.backgroundGradient

            // Static blurred orbs — rendered once and cached by Metal (no per-frame blur)
            ForEach(Array(theme.ambientOrbs.enumerated()), id: \.offset) { index, orb in
                Circle()
                    .fill(Color(hex: orb.color).opacity(orb.opacity))
                    .frame(width: orb.size, height: orb.size)
                    .blur(radius: orb.size * 0.25)
                    .offset(x: orb.offset.x, y: orb.offset.y)
            }

            // Lightweight animated accent (small, no blur — cheap to animate)
            ForEach(Array(theme.ambientOrbs.enumerated()), id: \.offset) { index, orb in
                Circle()
                    .fill(Color(hex: orb.color).opacity(orb.opacity * 0.35))
                    .frame(width: orb.size * 0.25, height: orb.size * 0.25)
                    .offset(x: orb.offset.x, y: orb.offset.y)
                    .floating(
                        range: CGFloat(15 + index * 8),
                        duration: Double(4.0 + Double(index) * 1.2)
                    )
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
                                colors: [MeeshyColors.coral, MeeshyColors.teal],
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
                                colors: showMenu ? [MeeshyColors.coral, MeeshyColors.teal] : [MeeshyColors.purple, MeeshyColors.teal],
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
                ("person.fill", "9B59B6", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.profile) }),
                ("plus.message.fill", "4ECDC4", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.newConversation) }),
                ("person.3.fill", "FF6B6B", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.communityList) }),
                ("link.badge.plus", "F8B500", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.affiliate) }),
                ("bell.fill", "FF6B6B", { notificationCount = 0; withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; showNotifications = true }),
                (theme.preference.icon, theme.preference.tintColor, {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        theme.cyclePreference(systemScheme: systemColorScheme)
                    }
                }),
                ("gearshape.fill", "45B7D1", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.settings) })
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

// MARK: - Profile Fetching Sheet

private struct ProfileFetchingSheet: View {
    let user: ProfileSheetUser
    @State private var isLoading = true
    @State private var fullUser: MeeshyUser?
    @State private var fetchError: String?
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var statusViewModel: StatusViewModel

    var body: some View {
        Group {
            if let fetchError {
                errorView(fetchError)
            } else {
                profileSheet
            }
        }
        .presentationDetents([.medium, .large])
        .task {
            do {
                let identifier = user.userId ?? user.username
                let fetched = try await UserService.shared.getProfile(idOrUsername: identifier)
                if fetched.isActive == false {
                    fetchError = "Ce compte a ete desactive."
                    return
                }
                fullUser = fetched
            } catch let error as APIError {
                switch error {
                case .serverError(404, _):
                    fetchError = "Utilisateur introuvable."
                case .networkError:
                    fetchError = "Erreur reseau. Verifiez votre connexion."
                default:
                    fetchError = "Impossible de charger ce profil."
                }
            } catch {
                fetchError = "Impossible de charger ce profil."
            }
            isLoading = false
        }
    }

    private var profileSheet: some View {
        UserProfileSheet(
            user: user,
            isLoading: isLoading,
            fullUser: fullUser,
            onDismiss: { dismiss() },
            currentUserId: AuthManager.shared.currentUser?.id ?? "",
            moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
            onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? "")
        )
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: "person.crop.circle.badge.questionmark")
                .font(.system(size: 48))
                .foregroundColor(theme.textMuted)

            Text(message)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)

            Text("@\(user.username)")
                .font(.system(size: 13))
                .foregroundColor(theme.textMuted)

            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(theme.backgroundPrimary)
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
