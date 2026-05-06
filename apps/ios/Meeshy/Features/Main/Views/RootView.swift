import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

// Components extracted to RootViewComponents.swift:
// ThemedFloatingButton, ThemedActionButton, ThemedFeedOverlay,
// ThemedFeedComposer, ThemedFeedCard, FeedActionButton, legacy wrappers

/// Identifiable wrapper so the fullScreenCover receives the userId directly in
/// its content closure, avoiding the SwiftUI race where isPresented flips true
/// before the sibling @State (userId) has propagated through the view graph.
struct StoryViewerRequest: Identifiable, Equatable {
    let id: String
}

struct RootView: View {
    @StateObject private var theme = ThemeManager.shared
    @StateObject private var toastManager = ToastManager.shared
    @StateObject private var storyViewModel = StoryViewModel()
    @StateObject private var statusViewModel = StatusViewModel()
    @StateObject private var conversationViewModel = ConversationListViewModel()
    @StateObject private var router = Router()
    @ObservedObject private var callManager = CallManager.shared
    @ObservedObject private var networkMonitor = NetworkMonitor.shared
    @ObservedObject private var notificationManager = NotificationManager.shared
    @EnvironmentObject private var deepLinkRouter: DeepLinkRouter
    @Environment(\.colorScheme) private var systemColorScheme
    @State private var showFeed = false
    @State private var feedWasVisibleBeforeNav = false
    @State private var showMenu = false
    @State private var storyViewerRequest: StoryViewerRequest?

    // Free-position button coordinates (persisted as "x,y" strings, 0-1 normalized)
    @AppStorage("feedButtonPosition") private var feedButtonPosition: String = "0.0,0.0"  // Top-left default
    @AppStorage("menuButtonPosition") private var menuButtonPosition: String = "1.0,0.0" // Top-right default

    // Scroll visibility state (passed from ConversationListView)
    @State private var isScrollingDown = false

    // Share sheet state (triggered by deep link)
    @State private var showSharePicker = false

    // New conversation sheet
    @State private var showNewConversation = false

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
                    onStoryViewRequest: { userId, _ in
                        Logger.messages.info("[RootView] onStoryViewRequest userId=\(userId, privacy: .public) isEmpty=\(userId.isEmpty)")
                        guard !userId.isEmpty else { return }
                        storyViewerRequest = StoryViewerRequest(id: userId)
                    },
                    onNewConversation: { showNewConversation = true }
                )
                .navigationBarHidden(true)
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .conversation(let conv):
                        ConversationView(
                            conversation: conv,
                            replyContext: router.pendingReplyContext
                        )
                        .navigationBarHidden(true)
                        .onAppear { router.pendingReplyContext = nil }
                    case .settings:
                        SettingsView()
                            .navigationBarHidden(true)
                    case .profile:
                        ProfileView()
                            .navigationBarHidden(true)
                    case .contacts(let initialTab):
                        ContactsHubView(initialTab: initialTab)
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
                        .safeAreaInset(edge: .top, spacing: 0) { ConnectionBanner() }
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
                        .safeAreaInset(edge: .top, spacing: 0) { ConnectionBanner() }
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
                            onNotificationTap: { notification in
                                handleNotificationTap(notification)
                            },
                            onDismiss: { router.pop() }
                        )
                        .navigationBarHidden(true)
                        .safeAreaInset(edge: .top, spacing: 0) { ConnectionBanner() }
                        .onDisappear {
                            Task { await notificationManager.refreshUnreadCount() }
                        }
                    case .userStats:
                        UserStatsView()
                            .navigationBarHidden(true)
                    case .links:
                        LinksHubView()
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
                    case .postDetail(let postId, let initialPost, let showComments):
                        PostDetailView(postId: postId, initialPost: initialPost, showComments: showComments)
                    case .bookmarks:
                        BookmarksView()
                            .navigationBarHidden(true)
                    case .starredMessages:
                        StarredMessagesView()
                    case .friendRequests:
                        FriendRequestListView()
                            .navigationBarHidden(true)
                    case .editProfile:
                        EditProfileView()
                            .navigationBarHidden(true)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.clear)

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
            if !router.isDeepRoute {
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
            if !router.isDeepRoute {
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

            // 8. Toast overlay — handled at MeeshyApp level to avoid duplicates

            // 9. Notification toast overlay (socket real-time)
            VStack {
                if let toast = notificationManager.currentToast {
                    NotificationToastView(event: toast) {
                        notificationManager.dismissToast()
                        handleSocketNotificationTap(toast)
                    }
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .padding(.top, MeeshySpacing.xxl)
                }
                Spacer()
            }
            .animation(MeeshyAnimation.springDefault, value: notificationManager.currentToast?.id)
            .zIndex(201)
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
        .onChange(of: router.sceneTitle) { _, title in
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first?.title = "Meeshy — \(title)"
        }
        .onAppear {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first?.title = "Meeshy — Conversations"
        }
        .task {
            // Connect Socket.IO early so the backend knows we're online
            MessageSocketManager.shared.connect()
            statusViewModel.subscribeToSocketEvents()

            // Start SyncEngine socket relay
            await ConversationSyncEngine.shared.startSocketRelay()

            // Deferred cleanup
            Task.detached(priority: .background) {
                try? await Task.sleep(for: .seconds(5))
                await ConversationSyncEngine.shared.cleanupRetentionIfNeeded()
            }

            // Observe sync events for conversation list
            conversationViewModel.observeSync()

            // Pilier 22 V3 wiring — register the StoryViewModel as the
            // queue's upload executor. setExecutor also registers the
            // queue's publish handler in the same call, so the M5 auto-
            // drain that fires next has a guaranteed-non-nil executor to
            // delegate to. Calling configure() at app boot (in MeeshyApp)
            // intentionally only sets up listeners — the handler is
            // registered HERE, atomic with the executor assignment, to
            // avoid the boot race that would burn retry budget on a
            // guaranteed-fail call.
            StoryPublishService.shared.setExecutor(storyViewModel)

            await storyViewModel.loadStories()
            await statusViewModel.loadStatuses()
            await conversationViewModel.loadConversations()
            await notificationManager.refreshUnreadCount()

            // Cold-start recovery: when the app is launched from a terminated
            // state by tapping a push, the `.handlePushNotification`
            // NotificationCenter post may fire before RootView finishes
            // mounting. Check the pending payload once we're on screen so the
            // user never lands on the list instead of the target conversation.
            if let pending = PushNotificationManager.shared.pendingNotificationPayload {
                handlePushNotificationTap(pending)
                PushNotificationManager.shared.clearPendingNotification()
            }
        }
        .fullScreenCover(item: $storyViewerRequest) { request in
            StoryViewerContainer(
                viewModel: storyViewModel,
                userId: request.id,
                isPresented: Binding(
                    get: { storyViewerRequest != nil },
                    set: { if !$0 { storyViewerRequest = nil } }
                ),
                onReplyToStory: { replyContext in
                    storyViewerRequest = nil
                    router.navigateToStoryReply(replyContext, conversationListViewModel: conversationViewModel)
                },
                presentationSource: "RootView.fromConv"
            )
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
        .onReceive(NotificationCenter.default.publisher(for: .handlePushNotification)) { notification in
            if let payload = notification.object as? NotificationPayload {
                handlePushNotificationTap(payload)
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
            if routeName.hasPrefix("postDetail:") {
                let postId = String(routeName.dropFirst("postDetail:".count))
                router.push(.postDetail(postId))
            } else if routeName.hasPrefix("storyDetail:") {
                let postId = String(routeName.dropFirst("storyDetail:".count))
                if let groupIdx = storyViewModel.groupIndex(forStoryId: postId) {
                    storyViewerRequest = StoryViewerRequest(id: storyViewModel.storyGroups[groupIdx].id)
                } else {
                    router.push(.postDetail(postId))
                }
            } else {
                switch routeName {
                case "userStats": router.push(.userStats)
                case "affiliate": router.push(.affiliate)
                default: break
                }
            }
        }
        .onOpenURL { url in
            // Only the share intent flows through Router here — every other
            // destination (joinLink/chatLink/conversation/magicLink) is
            // already routed via MeeshyApp's `.onOpenURL` → DeepLinkRouter →
            // pendingDeepLink → handleDeepLink. Letting Router.handleDeepLink
            // process those a second time double-fires the API call and
            // races the navigation with the pendingDeepLink path.
            if case .share = DeepLinkParser.parse(url) {
                router.handleDeepLink(url)
            }
        }
        .sheet(item: $router.deepLinkProfileUser) { user in
            UserProfileSheet(
                user: user,
                moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
                onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? "")
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
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
        .sheet(isPresented: $showNewConversation) {
            NewConversationView()
                .environmentObject(statusViewModel)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .onChange(of: router.path) { _, newPath in
            if !newPath.isEmpty && showFeed {
                feedWasVisibleBeforeNav = true
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showFeed = false
                }
            } else if newPath.isEmpty && feedWasVisibleBeforeNav {
                feedWasVisibleBeforeNav = false
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showFeed = true
                }
            }
        }
        // `initial: true` covers the cold-launch race where a Universal
        // Link sets `pendingDeepLink` from AppDelegate.continue:userActivity:
        // BEFORE this view mounts. Without it, a plain `.onChange` only fires
        // on subsequent transitions and the user lands on the home screen
        // with the deep link silently discarded. `consumePendingDeepLink`
        // returns nil for the typical cold-launch (no pending link), so
        // firing on the initial value is a free no-op when there's nothing
        // to process.
        .onChange(of: deepLinkRouter.pendingDeepLink, initial: true) { _, newValue in
            handleDeepLink(newValue)
        }
    }

    // MARK: - Deep Link Handling

    private func handleDeepLink(_ deepLink: DeepLink?) {
        guard let deepLink = deepLinkRouter.consumePendingDeepLink() else { return }

        switch deepLink {
        case .joinLink(let identifier), .chatLink(let identifier):
            // RootView only mounts when authenticated, so we never want
            // the anonymous join sheet here — that flow is owned by
            // MeeshyApp.handleGuestDeepLink for the unauthenticated
            // branch. For authenticated users we resolve the share link
            // server-side: the gateway is idempotent, so an existing
            // member gets the same payload as a fresh join and we can
            // navigate to the canonical conversationId either way.
            joinViaShareLink(identifier: identifier)

        case .conversation(let id):
            // Validate the conversation exists BEFORE navigating. Pushing a
            // placeholder Conversation for an id that the server doesn't
            // know lands the user on an empty screen with no recovery —
            // worse, returning to that screen via an external link re-fires
            // the deep link and recreates the empty view, looking like an
            // infinite loop to the user.
            navigateToConversationById(id)

        case .magicLink:
            break
        }
    }

    private func joinViaShareLink(identifier: String) {
        Task {
            do {
                let response = try await ShareLinkService.shared.joinAuthenticated(linkId: identifier)
                navigateToConversationById(response.conversationId)
            } catch let error as MeeshyError {
                let message: String
                switch error {
                case .server(404, _):
                    message = String(localized: "Lien introuvable", defaultValue: "Lien introuvable")
                case .server(410, let msg):
                    message = msg.isEmpty
                        ? String(localized: "Ce lien n'est plus actif", defaultValue: "Ce lien n'est plus actif")
                        : msg
                case .forbidden(let reason):
                    message = reason ?? String(localized: "Acces refuse a cette conversation", defaultValue: "Acces refuse a cette conversation")
                default:
                    message = error.errorDescription ?? String(localized: "Impossible d'ouvrir le lien", defaultValue: "Impossible d'ouvrir le lien")
                }
                ToastManager.shared.showError(message)
            } catch {
                ToastManager.shared.showError(
                    String(localized: "Impossible d'ouvrir le lien", defaultValue: "Impossible d'ouvrir le lien")
                )
            }
        }
    }

    // MARK: - Unified Notification Navigation

    private struct NotificationNavContext {
        let type: MeeshyNotificationType
        let conversationId: String?
        let messageId: String?
        let postId: String?
        let senderId: String?
        let senderUsername: String?

        init(from notification: APINotification) {
            type = notification.notificationType
            conversationId = notification.context?.conversationId
            messageId = notification.context?.messageId
            postId = notification.context?.postId ?? notification.metadata?.postId
            senderId = notification.senderId
            senderUsername = notification.senderName
        }

        init(from event: SocketNotificationEvent) {
            type = event.notificationType
            conversationId = event.conversationId
            messageId = event.messageId
            postId = event.postId
            senderId = event.senderId
            senderUsername = event.senderUsername
        }

        init(from payload: NotificationPayload) {
            type = MeeshyNotificationType(rawValue: payload.type ?? "") ?? .system
            conversationId = payload.conversationId
            messageId = payload.messageId
            postId = payload.postId
            senderId = payload.senderId
            senderUsername = payload.senderUsername
        }
    }

    private func handleNotificationTap(_ notification: APINotification) {
        navigateFromNotification(NotificationNavContext(from: notification))
    }

    private func handleSocketNotificationTap(_ event: SocketNotificationEvent) {
        navigateFromNotification(NotificationNavContext(from: event))
    }

    func handlePushNotificationTap(_ payload: NotificationPayload) {
        navigateFromNotification(NotificationNavContext(from: payload))
    }

    private func navigateFromNotification(_ ctx: NotificationNavContext) {
        switch ctx.type {
        case .newMessage, .legacyNewMessage, .messageReply, .reply, .legacyStoryReply,
             .messageReaction, .reaction, .legacyMessageReaction,
             .userMentioned, .mention, .legacyMention,
             .translationCompleted, .translationReady, .legacyTranslationReady, .transcriptionCompleted,
             .messageEdited, .messageDeleted, .messagePinned, .messageForwarded:
            guard let conversationId = ctx.conversationId, !conversationId.isEmpty else { return }
            navigateToConversationById(conversationId, highlightMessageId: ctx.messageId, ensureUnread: true)

        case .friendRequest, .contactRequest, .legacyFriendRequest,
             .friendAccepted, .contactAccepted, .legacyFriendAccepted,
             .legacyStatusUpdate:
            if let senderId = ctx.senderId {
                router.deepLinkProfileUser = ProfileSheetUser(
                    userId: senderId,
                    username: ctx.senderUsername ?? senderId
                )
            }

        case .communityInvite, .communityJoined, .communityLeft,
             .legacyGroupInvite, .legacyGroupJoined, .legacyGroupLeft,
             .memberJoined, .memberLeft, .memberRemoved, .memberPromoted, .memberDemoted, .memberRoleChanged,
             .addedToConversation, .newConversation, .removedFromConversation:
            if let conversationId = ctx.conversationId, !conversationId.isEmpty {
                navigateToConversationById(conversationId)
            }

        case .missedCall, .callDeclined, .legacyCallMissed,
             .incomingCall, .callEnded, .legacyCallIncoming:
            if let conversationId = ctx.conversationId, !conversationId.isEmpty {
                navigateToConversationById(conversationId)
            }

        case .postLike, .legacyPostLike, .postRepost:
            if let postId = ctx.postId, !postId.isEmpty {
                router.push(.postDetail(postId))
            } else if let conversationId = ctx.conversationId, !conversationId.isEmpty {
                navigateToConversationById(conversationId)
            }

        case .postComment, .legacyPostComment, .commentLike, .commentReply:
            if let postId = ctx.postId, !postId.isEmpty {
                router.push(.postDetail(postId, nil, showComments: true))
            } else if let conversationId = ctx.conversationId, !conversationId.isEmpty {
                navigateToConversationById(conversationId)
            }

        case .storyReaction, .statusReaction:
            if let postId = ctx.postId, !postId.isEmpty,
               let groupIdx = storyViewModel.groupIndex(forStoryId: postId) {
                storyViewerRequest = StoryViewerRequest(id: storyViewModel.storyGroups[groupIdx].id)
            } else if let postId = ctx.postId, !postId.isEmpty {
                router.push(.postDetail(postId))
            }

        case .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .badgeEarned:
            router.push(.userStats)

        case .legacyAffiliateSignup:
            router.push(.affiliate)

        case .securityAlert, .loginNewDevice, .legacySystemAlert,
             .passwordChanged, .twoFactorEnabled, .twoFactorDisabled,
             .system, .maintenance, .updateAvailable, .voiceCloneReady:
            break
        }
    }

    private func navigateToConversationById(_ conversationId: String, highlightMessageId: String? = nil, ensureUnread: Bool = false) {
        if let existing = conversationViewModel.conversations.first(where: { $0.id == conversationId }) {
            var conv = existing
            if ensureUnread && conv.unreadCount == 0 {
                conv.unreadCount = 1
            }
            router.navigateToConversation(conv, highlightMessageId: highlightMessageId)
            return
        }
        Task {
            do {
                let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                let apiConv = try await ConversationService.shared.getById(conversationId)
                var conv = apiConv.toConversation(currentUserId: currentUserId)
                if ensureUnread && conv.unreadCount == 0 {
                    conv.unreadCount = 1
                }
                router.navigateToConversation(conv, highlightMessageId: highlightMessageId)
            } catch {
                ToastManager.shared.showError(
                    String(localized: "Impossible d'ouvrir la conversation", defaultValue: "Impossible d'ouvrir la conversation")
                )
            }
        }
    }

    // MARK: - Themed Background
    private var themedBackground: some View {
        ZStack {
            theme.backgroundGradient

            // Static blurred orbs — 100% static, cached by Metal once, zero per-frame GPU work
            ForEach(Array(theme.ambientOrbs.enumerated()), id: \.offset) { _, orb in
                Circle()
                    .fill(Color(hex: orb.color).opacity(orb.opacity))
                    .frame(width: orb.size, height: orb.size)
                    .blur(radius: orb.size * 0.25)
                    .offset(x: orb.offset.x, y: orb.offset.y)
            }
        }
        .drawingGroup()  // Rasterise l'ensemble en une seule texture Metal — zéro composition par frame
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
                if showMenu {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showMenu = false
                    }
                    router.push(.settings)
                } else {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showMenu.toggle()
                    }
                }
            },
            onLeftLongPress: nil,
            onRightLongPress: {
                router.push(.settings)
            },
            isSearchBarVisible: !isScrollingDown,
            leftContent: {
                // Feed button content
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [MeeshyColors.error, MeeshyColors.indigo300],
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
                                colors: showMenu ? [MeeshyColors.error, MeeshyColors.indigo300] : [MeeshyColors.indigo600, MeeshyColors.indigo300],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )

                    Image(systemName: "gearshape.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)

                    // Badge
                    if !showMenu && notificationManager.unreadCount > 0 {
                        NotificationBadge(count: notificationManager.unreadCount)
                    }
                }
            }
        )
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
            let menuStartY = expandDown ? buttonY + halfButton + menuSpacing + menuItemSize / 2 : buttonY - halfButton - menuSpacing - menuItemSize / 2

            // Menu items
            let menuItems: [(icon: String, color: String, action: () -> Void)] = [
                ("link.badge.plus", "F8B500", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.links) }),
                ("bell.fill", "FF6B6B", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.notifications) }),
                ("person.2.fill", "6366F1", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.contacts()) }),
                ("person.3.fill", "2ECC71", { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.communityList) })
            ]

            ForEach(Array(menuItems.enumerated()), id: \.offset) { index, item in
                let yOffset = expandDown
                    ? CGFloat(index) * (menuItemSize + menuSpacing)
                    : -CGFloat(index) * (menuItemSize + menuSpacing)

                let itemY = menuStartY + yOffset

                // Special handling for notifications badge
                if item.icon == "bell.fill" {
                    ThemedActionButton(icon: item.icon, color: item.color, badge: notificationManager.unreadCount, action: item.action)
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
