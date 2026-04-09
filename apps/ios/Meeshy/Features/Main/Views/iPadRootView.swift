import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - iPad Root View (Two-Column Feed-First Layout)
//
// Layout contract:
//   Default state:   [Feed (left)]  [Conversation List (right)]
//   Conv opened:     [Conv List (left)]  [Conversation (right)]
//   Hub route:       [Feed (left)]  [Settings/Notifications/... (right)]
//
// The feed is always the most accessible view. Opening a conversation
// swaps the feed for the conversation list on the left, and shows
// the conversation on the right. A "Feed" button lets the user
// dismiss the open conversation and return to the default state.

struct iPadRootView: View {
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

    // iPad-specific state
    @State private var activeConversation: Conversation?
    @State private var rightPanelRoute: Route?

    // Shared state (mirrors RootView for parity)
    @State private var pendingReplyContext: ReplyContext?
    @State private var showStoryViewerFromConv = false
    @State private var selectedStoryUserIdFromConv: String?
    @State private var joinFlowIdentifier: String?
    @State private var showJoinFlow = false
    @State private var showSharePicker = false
    @State private var showNewConversation = false

    // Conversation list scroll state (unused on iPad but required by ConversationListView)
    @State private var isScrollingDown = false
    @State private var feedIsVisible = true

    private var isConversationOpen: Bool {
        activeConversation != nil
    }

    var body: some View {
        ZStack {
            themedBackground

            HStack(spacing: 0) {
                // MARK: Left Column
                leftColumn
                    .frame(minWidth: 320, idealWidth: 380, maxWidth: 420)

                iPadDivider

                // MARK: Right Column
                rightColumn
                    .frame(maxWidth: .infinity)
            }

            overlays
        }
        .environmentObject(router)
        .environmentObject(storyViewModel)
        .environmentObject(statusViewModel)
        .environmentObject(conversationViewModel)
        .onAppear {
            // Intercept router pushes: display in right panel instead of NavigationStack
            router.onRouteRequested = { route in
                if case .conversation(let conv) = route {
                    openConversation(conv)
                    return true
                }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                    rightPanelRoute = route
                }
                return true
            }

            // Intercept router pop: close right panel or active conversation
            router.onPopRequested = {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                    if rightPanelRoute != nil {
                        rightPanelRoute = nil
                    } else if activeConversation != nil {
                        activeConversation = nil
                    }
                }
            }
        }
        .onDisappear {
            router.onRouteRequested = nil
            router.onPopRequested = nil
        }
        .task {
            MessageSocketManager.shared.connect()
            statusViewModel.subscribeToSocketEvents()
            await ConversationSyncEngine.shared.startSocketRelay()

            Task.detached(priority: .background) {
                try? await Task.sleep(for: .seconds(5))
                await ConversationSyncEngine.shared.cleanupRetentionIfNeeded()
            }

            conversationViewModel.observeSync()
            await storyViewModel.loadStories()
            await statusViewModel.loadStatuses()
            await conversationViewModel.loadConversations()
            await notificationManager.refreshUnreadCount()
        }
        .onReceive(NotificationCenter.default.publisher(for: .navigateToConversation)) { notification in
            if let conversation = notification.object as? Conversation {
                openConversation(conversation)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("sendMessageToUser"))) { notification in
            guard let targetUserId = notification.object as? String else { return }
            if let existingConv = conversationViewModel.conversations.first(where: {
                $0.type == .direct && $0.participantUserId == targetUserId
            }) {
                openConversation(existingConv)
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
                    openConversation(conv)
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
                rightPanelRoute = .postDetail(postId)
            } else if routeName.hasPrefix("storyDetail:") {
                let postId = String(routeName.dropFirst("storyDetail:".count))
                if let groupIdx = storyViewModel.groupIndex(forStoryId: postId) {
                    selectedStoryUserIdFromConv = storyViewModel.storyGroups[groupIdx].id
                    showStoryViewerFromConv = true
                } else {
                    rightPanelRoute = .postDetail(postId)
                }
            } else {
                switch routeName {
                case "userStats": rightPanelRoute = .userStats
                case "affiliate": rightPanelRoute = .affiliate
                default: break
                }
            }
        }
        .onOpenURL { url in
            router.handleDeepLink(url)
        }
        .onChange(of: deepLinkRouter.pendingDeepLink) { _, newValue in
            handleDeepLink(newValue)
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
            if hasContent { showSharePicker = true }
        }
        .sheet(isPresented: $showJoinFlow) {
            if let identifier = joinFlowIdentifier {
                JoinFlowSheet(identifier: identifier) { joinResponse in
                    handleJoinSuccess(joinResponse)
                }
            }
        }
        .sheet(isPresented: $showNewConversation) {
            NewConversationView()
                .environmentObject(statusViewModel)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .fullScreenCover(isPresented: $showStoryViewerFromConv) {
            if let userId = selectedStoryUserIdFromConv,
               let resolvedIndex = storyViewModel.groupIndex(forUserId: userId) {
                StoryViewerView(
                    viewModel: storyViewModel,
                    groups: storyViewModel.storyGroups,
                    currentGroupIndex: resolvedIndex,
                    isPresented: $showStoryViewerFromConv,
                    onReplyToStory: { replyContext in
                        showStoryViewerFromConv = false
                        handleStoryReply(replyContext)
                    }
                )
            }
        }
        .fullScreenCover(isPresented: Binding(
            get: { callManager.callState.isActive },
            set: { if !$0 { callManager.endCall() } }
        )) {
            CallView()
        }
    }

    // MARK: - Left Column

    @ViewBuilder
    private var leftColumn: some View {
        if isConversationOpen {
            // Conversation open: show conversation list on the left
            VStack(spacing: 0) {
                iPadLeftColumnHeader(
                    title: "Messages",
                    showFeedButton: true,
                    onFeedTap: { closePanels() },
                    notificationCount: notificationManager.unreadCount,
                    onNotificationsTap: { rightPanelRoute = .notifications },
                    onSettingsTap: { rightPanelRoute = .settings }
                )

                ConversationListView(
                    isScrollingDown: $isScrollingDown,
                    feedIsVisible: $feedIsVisible,
                    onSelect: { conversation in
                        openConversation(conversation)
                    },
                    onStoryViewRequest: { userId, _ in
                        selectedStoryUserIdFromConv = userId
                        showStoryViewerFromConv = true
                    },
                    onNewConversation: { showNewConversation = true }
                )
                .navigationBarHidden(true)
            }
        } else {
            // Default state: show feed on the left
            VStack(spacing: 0) {
                FeedView()
            }
        }
    }

    // MARK: - Right Column

    @ViewBuilder
    private var rightColumn: some View {
        if let conversation = activeConversation {
            // Show active conversation
            ConversationView(
                conversation: conversation,
                replyContext: pendingReplyContext
            )
            .id(conversation.id)
            .navigationBarHidden(true)
        } else if let route = rightPanelRoute {
            // Show hub route content
            rightPanelContent(for: route)
        } else {
            // Default: conversation list on the right
            VStack(spacing: 0) {
                iPadLeftColumnHeader(
                    title: "Messages",
                    showFeedButton: false,
                    notificationCount: notificationManager.unreadCount,
                    onNotificationsTap: { rightPanelRoute = .notifications },
                    onSettingsTap: { rightPanelRoute = .settings }
                )

                ConversationListView(
                    isScrollingDown: $isScrollingDown,
                    feedIsVisible: $feedIsVisible,
                    onSelect: { conversation in
                        openConversation(conversation)
                    },
                    onStoryViewRequest: { userId, _ in
                        selectedStoryUserIdFromConv = userId
                        showStoryViewerFromConv = true
                    },
                    onNewConversation: { showNewConversation = true }
                )
                .navigationBarHidden(true)
            }
        }
    }

    // MARK: - Right Panel Content (Hub Routes)

    @ViewBuilder
    private func rightPanelContent(for route: Route) -> some View {
        switch route {
        case .settings:
            SettingsView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .profile:
            ProfileView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .contacts(let initialTab):
            ContactsHubView(initialTab: initialTab)
                .navigationBarHidden(true)
        case .communityList:
            CommunityListView(
                onSelectCommunity: { community in
                    rightPanelRoute = .communityDetail(community.id)
                },
                onCreateCommunity: {
                    rightPanelRoute = .communityCreate
                },
                onDismiss: { rightPanelRoute = nil }
            )
            .navigationBarHidden(true)
        case .communityDetail(let communityId):
            CommunityDetailView(
                communityId: communityId,
                onSelectConversation: { apiConversation in
                    let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                    let conv = apiConversation.toConversation(currentUserId: currentUserId)
                    openConversation(conv)
                },
                onOpenSettings: { community in
                    rightPanelRoute = .communitySettings(community)
                },
                onOpenMembers: { id in
                    rightPanelRoute = .communityMembers(id)
                },
                onInvite: { id in
                    rightPanelRoute = .communityInvite(id)
                },
                onDismiss: { rightPanelRoute = nil }
            )
            .navigationBarHidden(true)
        case .communityCreate:
            CommunityCreateView(
                onCreated: { community in
                    rightPanelRoute = .communityDetail(community.id)
                },
                onDismiss: { rightPanelRoute = nil }
            )
            .navigationBarHidden(true)
        case .communitySettings(let community):
            CommunitySettingsView(
                community: community,
                onUpdated: { _ in rightPanelRoute = .communityList },
                onDeleted: { rightPanelRoute = nil },
                onLeft: { rightPanelRoute = nil }
            )
        case .communityMembers(let communityId):
            CommunityMembersView(
                communityId: communityId,
                onInvite: {
                    rightPanelRoute = .communityInvite(communityId)
                }
            )
        case .communityInvite(let communityId):
            CommunityInviteView(communityId: communityId)
        case .notifications:
            NotificationListView(
                onNotificationTap: { notification in
                    handleNotificationTap(notification)
                },
                onDismiss: { rightPanelRoute = nil }
            )
            .iPadFormWidth(MeeshyLayout.contentMaxWidth)
            .navigationBarHidden(true)
            .onDisappear {
                Task { await notificationManager.refreshUnreadCount() }
            }
        case .userStats:
            UserStatsView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .links:
            LinksHubView()
                .iPadFormWidth()
        case .affiliate:
            AffiliateView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .trackingLinks:
            TrackingLinksView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .shareLinks:
            ShareLinksView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .communityLinks:
            CommunityLinksView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .dataExport:
            DataExportView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .postDetail(let postId, let initialPost, let showComments):
            PostDetailView(postId: postId, initialPost: initialPost, showComments: showComments)
                .iPadFormWidth(MeeshyLayout.contentMaxWidth)
        case .bookmarks:
            BookmarksView()
                .iPadFormWidth(MeeshyLayout.contentMaxWidth)
                .navigationBarHidden(true)
        case .friendRequests:
            FriendRequestListView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .editProfile:
            EditProfileView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .conversation:
            EmptyView()
        }
    }

    // MARK: - Overlays

    private var overlays: some View {
        ZStack {
            // Offline banner
            if networkMonitor.isOffline {
                VStack {
                    OfflineBanner()
                        .transition(.move(edge: .top).combined(with: .opacity))
                    Spacer()
                }
                .animation(.spring(response: 0.4, dampingFraction: 0.8), value: networkMonitor.isOffline)
                .zIndex(190)
            }

            // Toast overlay
            VStack {
                if let toast = toastManager.currentToast {
                    ToastView(toast: toast)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .padding(.top, MeeshySpacing.xxl)
                        .onTapGesture { toastManager.dismiss() }
                }
                Spacer()
            }
            .animation(MeeshyAnimation.springDefault, value: toastManager.currentToast)
            .zIndex(200)

            // Notification toast overlay
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
    }

    // MARK: - Navigation Helpers

    private func openConversation(_ conversation: Conversation) {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            activeConversation = conversation
            rightPanelRoute = nil
            pendingReplyContext = nil
        }
    }

    private func closePanels() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            activeConversation = nil
            rightPanelRoute = nil
            pendingReplyContext = nil
        }
    }

    // MARK: - Themed Background

    private var themedBackground: some View {
        ZStack {
            theme.backgroundGradient
            ForEach(Array(theme.ambientOrbs.enumerated()), id: \.offset) { _, orb in
                Circle()
                    .fill(Color(hex: orb.color).opacity(orb.opacity))
                    .frame(width: orb.size, height: orb.size)
                    .blur(radius: orb.size * 0.25)
                    .offset(x: orb.offset.x, y: orb.offset.y)
            }
        }
        .drawingGroup()
        .ignoresSafeArea()
    }

    // MARK: - Deep Link Handling

    private func handleDeepLink(_ deepLink: DeepLink?) {
        guard let deepLink = deepLinkRouter.consumePendingDeepLink() else { return }
        switch deepLink {
        case .joinLink(let identifier):
            joinFlowIdentifier = identifier
            showJoinFlow = true
        case .chatLink:
            break
        case .conversation(let id):
            let conv = Conversation(
                id: id, identifier: id, type: .group,
                title: nil, lastMessageAt: Date(), createdAt: Date(), updatedAt: Date()
            )
            openConversation(conv)
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
        openConversation(conv)
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
            openConversation(existingConv)
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
                    openConversation(conv)
                }
            } catch {
                ToastManager.shared.showError("Impossible de creer la conversation")
            }
        }
    }

    // MARK: - Handle Notification Tap

    private func handleNotificationTap(_ notification: APINotification) {
        let data = notification.data
        switch notification.notificationType {
        case .newMessage, .legacyNewMessage, .messageReply,
             .messageReaction, .reaction, .legacyMessageReaction,
             .userMentioned, .mention, .legacyMention,
             .translationCompleted, .translationReady, .legacyTranslationReady, .transcriptionCompleted,
             .legacyStoryReply, .reply,
             .messageEdited, .messageDeleted, .messagePinned, .messageForwarded:
            guard let conversationId = data?.conversationId else { return }
            navigateToConversationById(conversationId)

        case .friendRequest, .contactRequest, .legacyFriendRequest,
             .friendAccepted, .contactAccepted, .legacyFriendAccepted,
             .legacyStatusUpdate:
            if let senderId = notification.senderId {
                router.deepLinkProfileUser = ProfileSheetUser(userId: senderId, username: notification.senderName ?? senderId)
            }

        case .communityInvite, .communityJoined, .communityLeft, .legacyGroupInvite, .legacyGroupJoined, .legacyGroupLeft,
             .memberJoined, .memberLeft, .memberRemoved, .memberPromoted, .memberDemoted, .memberRoleChanged,
             .addedToConversation, .newConversation, .removedFromConversation:
            if let conversationId = data?.conversationId {
                navigateToConversationById(conversationId)
            }

        case .postLike, .legacyPostLike, .postRepost:
            if let postId = notification.context?.postId ?? data?.postId {
                rightPanelRoute = .postDetail(postId)
            }

        case .postComment, .legacyPostComment, .commentLike, .commentReply:
            if let postId = notification.context?.postId ?? data?.postId {
                rightPanelRoute = .postDetail(postId, nil, showComments: true)
            }

        case .storyReaction, .statusReaction:
            if let postId = notification.context?.postId ?? data?.postId,
               let groupIdx = storyViewModel.groupIndex(forStoryId: postId) {
                selectedStoryUserIdFromConv = storyViewModel.storyGroups[groupIdx].id
                showStoryViewerFromConv = true
            } else if let postId = notification.context?.postId ?? data?.postId {
                rightPanelRoute = .postDetail(postId)
            }

        case .missedCall, .callDeclined, .legacyCallMissed,
             .incomingCall, .callEnded, .legacyCallIncoming:
            if let conversationId = data?.conversationId {
                navigateToConversationById(conversationId)
            }

        case .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .badgeEarned:
            rightPanelRoute = .userStats

        case .legacyAffiliateSignup:
            rightPanelRoute = .affiliate

        case .securityAlert, .loginNewDevice, .legacySystemAlert,
             .passwordChanged, .twoFactorEnabled, .twoFactorDisabled,
             .system, .maintenance, .updateAvailable, .voiceCloneReady:
            break
        }
    }

    // MARK: - Handle Socket Notification Tap

    private func handleSocketNotificationTap(_ event: SocketNotificationEvent) {
        switch event.notificationType {
        case .newMessage, .messageReply, .messageReaction, .reaction,
             .mention, .missedCall,
             .newConversation, .addedToConversation, .memberJoined:
            if let conversationId = event.conversationId {
                navigateToConversationById(conversationId)
            }

        case .friendRequest, .contactRequest, .friendAccepted, .contactAccepted:
            if let senderId = event.senderId, let username = event.senderUsername {
                router.deepLinkProfileUser = ProfileSheetUser(
                    userId: senderId,
                    username: username
                )
            }

        case .postLike, .legacyPostLike, .postRepost:
            if let postId = event.postId {
                rightPanelRoute = .postDetail(postId)
            }

        case .postComment, .legacyPostComment, .commentLike, .commentReply:
            if let postId = event.postId {
                rightPanelRoute = .postDetail(postId, nil, showComments: true)
            }

        case .storyReaction, .statusReaction:
            if let postId = event.postId,
               let groupIdx = storyViewModel.groupIndex(forStoryId: postId) {
                selectedStoryUserIdFromConv = storyViewModel.storyGroups[groupIdx].id
                showStoryViewerFromConv = true
            } else if let postId = event.postId {
                rightPanelRoute = .postDetail(postId)
            }

        default:
            break
        }
    }

    private func navigateToConversationById(_ conversationId: String) {
        if let existing = conversationViewModel.conversations.first(where: { $0.id == conversationId }) {
            openConversation(existing)
            return
        }
        Task {
            do {
                let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                let apiConv = try await ConversationService.shared.getById(conversationId)
                let conv = apiConv.toConversation(currentUserId: currentUserId)
                openConversation(conv)
            } catch {
                ToastManager.shared.showError("Impossible d'ouvrir la conversation")
            }
        }
    }
}

// MARK: - iPad Left Column Header

struct iPadLeftColumnHeader: View {
    let title: String
    var showFeedButton: Bool = false
    var onFeedTap: (() -> Void)?
    var notificationCount: Int = 0
    var onNotificationsTap: (() -> Void)?
    var onSettingsTap: (() -> Void)?

    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        HStack(spacing: 12) {
            if showFeedButton {
                Button {
                    HapticFeedback.light()
                    onFeedTap?()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "square.stack.fill")
                            .font(.system(size: 14, weight: .semibold))
                        Text("Feed")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.indigo500, MeeshyColors.indigo700],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(MeeshyColors.indigo100.opacity(theme.mode.isDark ? 0.15 : 1))
                    )
                }
            }

            Text(title)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            if let onNotificationsTap {
                Button {
                    HapticFeedback.light()
                    onNotificationsTap()
                } label: {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "bell.fill")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(theme.textSecondary)

                        if notificationCount > 0 {
                            Text("\(min(notificationCount, 99))")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(.white)
                                .frame(width: 16, height: 16)
                                .background(Circle().fill(MeeshyColors.error))
                                .offset(x: 6, y: -6)
                        }
                    }
                }
            }

            if let onSettingsTap {
                Button {
                    HapticFeedback.light()
                    onSettingsTap()
                } label: {
                    Image(systemName: "gearshape.fill")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(theme.textSecondary)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(theme.backgroundPrimary.opacity(0.95))
    }
}

// MARK: - iPad Divider

private struct iPadDivider: View {
    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        Rectangle()
            .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.08))
            .frame(width: 1)
            .ignoresSafeArea()
    }
}
