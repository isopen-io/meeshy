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
//
// File split:
//   iPadRootView.swift              — struct, properties, body, columns, background
//   iPadRootView+Sheets.swift       — sheet & fullScreenCover modifiers
//   iPadRootView+Panels.swift       — rightPanelContent, iPadLeftColumnHeader, iPadDivider
//   iPadRootView+Overlays.swift     — offline banner, toasts, notification toasts
//   iPadRootView+Navigation.swift   — all navigation & notification handlers

struct iPadRootView: View {
    @StateObject var theme = ThemeManager.shared
    @StateObject var toastManager = ToastManager.shared
    @StateObject var storyViewModel = StoryViewModel()
    @StateObject var statusViewModel = StatusViewModel()
    @StateObject var conversationViewModel = ConversationListViewModel()
    @StateObject var router = Router()
    @ObservedObject var callManager = CallManager.shared
    @ObservedObject var networkMonitor = NetworkMonitor.shared
    @ObservedObject var notificationManager = NotificationManager.shared
    @EnvironmentObject var deepLinkRouter: DeepLinkRouter
    @Environment(\.colorScheme) var systemColorScheme

    @State var activeConversation: Conversation?
    @State var rightPanelRoute: Route?
    @State var pendingReplyContext: ReplyContext?
    @State var showStoryViewerFromConv = false
    @State var selectedStoryUserIdFromConv: String?
    @State var joinFlowIdentifier: String?
    @State var showJoinFlow = false
    @State var showSharePicker = false
    @State var showNewConversation = false
    @State private var isScrollingDown = false
    @State private var feedIsVisible = true
    @State private var leftColumnRatio: CGFloat = 0.38

    private var isConversationOpen: Bool {
        activeConversation != nil
    }

    var body: some View {
        applyingSheets(
            ZStack {
                themedBackground

                GeometryReader { geometry in
                    HStack(spacing: 0) {
                        leftColumn
                            .frame(width: geometry.size.width * leftColumnRatio)

                        iPadResizableHandle(ratio: $leftColumnRatio, screenWidth: geometry.size.width)

                        rightColumn
                            .frame(maxWidth: .infinity)
                    }
                }

                overlays
            }
            .environmentObject(router)
            .environmentObject(storyViewModel)
            .environmentObject(statusViewModel)
            .environmentObject(conversationViewModel)
            .onAppear {
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
                handleSendMessageToUser(notification)
            }
            .onReceive(NotificationCenter.default.publisher(for: Notification.Name("openProfileSheet"))) { notification in
                guard let info = notification.object as? [String: String],
                      let userId = info["userId"] else { return }
                let username = info["username"] ?? userId
                router.deepLinkProfileUser = ProfileSheetUser(userId: userId, username: username)
            }
            .onReceive(NotificationCenter.default.publisher(for: Notification.Name("pushNavigateToRoute"))) { notification in
                handlePushNavigateToRoute(notification)
            }
            .onOpenURL { url in
                router.handleDeepLink(url)
            }
            .onChange(of: deepLinkRouter.pendingDeepLink) { _, newValue in
                handleDeepLink(newValue)
            }
        )
    }

    // MARK: - Left Column

    @ViewBuilder
    private var leftColumn: some View {
        if isConversationOpen {
            iPadConversationList(showFeedButton: true)
        } else {
            FeedView()
        }
    }

    // MARK: - Right Column

    @ViewBuilder
    private var rightColumn: some View {
        if let conversation = activeConversation {
            ConversationView(
                conversation: conversation,
                replyContext: pendingReplyContext
            )
            .id(conversation.id)
            .navigationBarHidden(true)
        } else if let route = rightPanelRoute {
            rightPanelContent(for: route)
        } else {
            iPadConversationList(showFeedButton: false)
        }
    }

    // MARK: - iPad Conversation List (shared between columns)

    @ViewBuilder
    private func iPadConversationList(showFeedButton: Bool) -> some View {
        let feedAction: (() -> Void)? = showFeedButton ? { closePanels() } : nil
        ConversationListView(
            isScrollingDown: $isScrollingDown,
            feedIsVisible: $feedIsVisible,
            onSelect: { conversation in openConversation(conversation) },
            onStoryViewRequest: { userId, _ in
                selectedStoryUserIdFromConv = userId
                showStoryViewerFromConv = true
            },
            onNewConversation: { showNewConversation = true },
            iPadNotificationCount: notificationManager.unreadCount,
            onNotificationsTap: { rightPanelRoute = .notifications },
            onSettingsTap: { rightPanelRoute = .settings },
            iPadFeedAction: feedAction
        )
        .navigationBarHidden(true)
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
}

