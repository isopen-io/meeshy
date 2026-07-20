import SwiftUI
import Combine
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
    @StateObject var toastManager = FeedbackToastManager.shared
    @StateObject var storyViewModel = StoryViewModel()
    @StateObject var statusViewModel = StatusViewModel()
    // Possédé sans être observé (cf. ConversationListVMOwner, RootView.swift) :
    // évite le re-render de iPadRootView à chaque churn du VM (presence,
    // reloadFromCache). Exposé via la propriété calculée `conversationViewModel`,
    // consommée telle quelle par les extensions (+Sheets, +Navigation).
    @StateObject var conversationVMOwner = ConversationListVMOwner()
    var conversationViewModel: ConversationListViewModel { conversationVMOwner.viewModel }
    @StateObject var router = Router()
    /// Hoisted at the iPad root so deep-stack screens (e.g.
    /// `StoryNotificationTargetScreen` → `StoryActiveBridge`) can present
    /// the story viewer through `.environmentObject` injection without
    /// threading a binding through every parent view. Mirrors RootView's
    /// (iPhone) coordinator wiring; the cover is wired in
    /// `iPadRootView+Sheets.swift`.
    @StateObject var storyViewerCoordinator = StoryViewerCoordinator()
    // CallManager n'est PLUS observé ici : la présentation d'appel passe par
    // `.modifier(CallPresentationLayer())` (partagé avec RootView) qui isole le
    // churn d'appel hors de `iPadRootView.body`. Cf. watchdog 0x8BADF00D.
    @ObservedObject var networkMonitor = NetworkMonitor.shared
    @ObservedObject var notificationManager = NotificationToastManager.shared
    @EnvironmentObject var deepLinkRouter: DeepLinkRouter
    @Environment(\.colorScheme) var systemColorScheme

    @State var activeConversation: Conversation?
    @State var rightPanelRoute: Route?
    @State var showStoryViewerFromConv = false
    @State var selectedStoryUserIdFromConv: String?
    @State var showSharePicker = false
    @State var showNewConversation = false
    @State private var isScrollingDown = false
    @State private var feedIsVisible = true
    @State private var leftColumnRatio: CGFloat = 0.38

    /// Conversation surfaced by a long-press / pull-down on a notification toast
    /// — presented as a reusable `ConversationView` preview over the columns.
    @State var notificationPreviewConversation: Conversation?
    /// Swallows the toast Button's release tap that can fire right after the
    /// long-press / drag opened the preview (prevents double action).
    @State var suppressToastTap = false

    /// U1 inc.2 — namespace zoom tray→viewer (parité RootView iPhone).
    @Namespace var storyZoomNamespace

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
            .environmentObject(storyViewerCoordinator)
            .environment(\.zoomTransitionNamespace, storyZoomNamespace)
            // Propagate story viewer presentation state — same role as
            // RootView (cf. ConnectionBanner sync pill chevauchement fix
            // 2026-05-27).
            .environment(\.isStoryViewerPresenting, storyViewerCoordinator.pendingRequest != nil)
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
                // Sans cet appel, le SDK reçoit bien `story:created` mais
                // personne n'est sink'é sur `socialSocket.storyCreated` → la
                // story n'arrive jamais dans `storyGroups`.
                storyViewModel.subscribeToSocketEvents()
                await ConversationSyncEngine.shared.startSocketRelay()

                Task.detached(priority: .background) {
                    try? await Task.sleep(for: .seconds(5))
                    await ConversationSyncEngine.shared.cleanupRetentionIfNeeded()
                }

                conversationViewModel.observeSync()

                // Réponse à un mood : résout/ouvre la DM avec l'auteur et amorce
                // le composer (voir RootView pour l'équivalent iPhone).
                StatusBubbleController.shared.onConfirmedReply = { entry in
                    router.navigateToStoryReply(
                        .status(statusId: entry.id, authorId: entry.userId,
                                authorName: entry.username, emoji: entry.moodEmoji,
                                content: entry.content, publishedAt: entry.createdAt),
                        conversationListViewModel: conversationViewModel
                    )
                }

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
            // Drive push-tap navigation straight off the published intent
            // (replayed to late subscribers) rather than a NotificationCenter
            // post that a cold launch could drop before this view mounts.
            // Clearing AFTER navigation makes this the single consumption point.
            .onReceive(PushNotificationManager.shared.$pendingNotificationPayload) { payload in
                guard let payload, AuthManager.shared.isAuthenticated else { return }
                handlePushNotificationTap(payload)
                PushNotificationManager.shared.clearPendingNotification()
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
            // `StoryExpiredContent` posts `.openStoryComposer` from the
            // notification flow when the underlying story is gone. Routing
            // the composer through `StoryViewModel.showStoryComposer`
            // reuses `StoryTrayView`'s existing `.fullScreenCover`, so the
            // CTA animates in cleanly without stacking covers. Mirrors
            // RootView (iPhone).
            .onReceive(NotificationCenter.default.publisher(for: .openStoryComposer)) { _ in
                storyViewModel.showStoryComposer = true
            }
            .onOpenURL { url in
                // Only the share intent flows through Router here — every
                // other destination (joinLink/chatLink/conversation/magicLink)
                // is already routed via MeeshyApp's `.onOpenURL` →
                // DeepLinkRouter → pendingDeepLink → handleDeepLink. Letting
                // Router.handleDeepLink process those a second time
                // double-fires the API call and races the navigation with
                // the pendingDeepLink path.
                if case .share = DeepLinkParser.parse(url) {
                    router.handleDeepLink(url)
                }
            }
            // `initial: true` covers the cold-launch race where a Universal
            // Link sets `pendingDeepLink` from AppDelegate.continue:userActivity:
            // BEFORE this view mounts. Without it, a plain `.onChange` only
            // fires on subsequent transitions and the user lands on the home
            // screen with the deep link silently discarded. consumePendingDeepLink
            // returns nil for the typical cold-launch (no pending link), so
            // firing on the initial value is a free no-op when nothing
            // is queued.
            .adaptiveOnChange(of: deepLinkRouter.pendingDeepLink, initial: true) { _, newValue in
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
                replyContext: router.pendingReplyContext
            )
            .id(conversation.id)
            .navigationBarHidden(true)
            .onAppear { router.pendingReplyContext = nil }
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
            iPadFeedAction: feedAction,
            selectedConversationId: activeConversation?.id
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

