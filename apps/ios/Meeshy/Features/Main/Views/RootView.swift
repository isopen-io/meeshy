import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

// Components extracted to RootViewComponents.swift:
// ThemedActionButton, ThemedFeedOverlay

/// Identifiable wrapper so the fullScreenCover receives the userId directly in
/// its content closure, avoiding the SwiftUI race where isPresented flips true
/// before the sibling @State (userId) has propagated through the view graph.
///
/// `initialAction` (Phase F) carries an optional one-shot side-effect for the
/// presented `StoryViewerView`: when set, the viewer auto-opens either the
/// comments overlay or the viewers/reactions sheet on first appear. Defaults
/// to `nil` so every existing call site (tray taps, deep link, notification
/// reaction tap) preserves the legacy "open viewer normally" behaviour.
struct StoryViewerRequest: Identifiable, Equatable {
    let id: String
    var initialAction: StoryViewerInitialAction? = nil
    /// Quand `true`, le viewer s'ouvre sur la première story non vue du groupe
    /// (entrées « toucher le profil / l'avatar / le tray »). Les deep links /
    /// notifications ciblant un contenu précis gardent `false`.
    var startAtFirstUnviewed: Bool = false
    /// `true` pour les entrées « personne précise » (profil, bulle, avatar
    /// de post, ma story) : le viewer ne montre que le groupe de cet
    /// utilisateur. Les contextes « flux » (tray, liste) gardent `false`.
    var singleGroup: Bool = false
    /// R4 inc.2 — id exact du post story quand le producteur le connaît
    /// (notification, deep link). Permet au container un fetch unitaire
    /// léger si le tray ignore le groupe. `nil` = comportement historique.
    var postId: String? = nil
}

/// Named magic numbers for the iPhone root-view audio overlay layout.
private enum AudioOverlayConstants {
    /// Padding above the bottom edge for the floating mini-player, sized so
    /// the bar clears the standard iOS tab bar (~49pt + safe area).
    static let iPhoneBottomPadding: CGFloat = 60
}

struct RootView: View {
    @StateObject private var theme = ThemeManager.shared
    @StateObject private var toastManager = FeedbackToastManager.shared
    @StateObject private var storyViewModel = StoryViewModel()
    @StateObject private var statusViewModel = StatusViewModel()
    @StateObject private var conversationViewModel = ConversationListViewModel()
    @StateObject private var router = Router()
    @ObservedObject private var callManager = CallManager.shared
    @StateObject private var connectionStatus = ConnectionStatusViewModel()
    @ObservedObject private var notificationManager = NotificationToastManager.shared
    @EnvironmentObject private var deepLinkRouter: DeepLinkRouter
    @Environment(\.colorScheme) private var systemColorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotionEnabled
    @State private var showFeed = false
    @State private var feedWasVisibleBeforeNav = false
    @State private var showMenu = false
    /// Drives the immersive reels overlay. A long-press on the feed button (or a
    /// tap on a reel card in the feed) sets `reelsPresenter.launch`.
    @ObservedObject private var reelsPresenter = ReelsPresenter.shared
    /// Liquid "water wave" reveal of the reels overlay. `reelsRevealProgress`
    /// drives the `LiquidRevealShape` mask 0→1 (open) / 1→0 (close) from the
    /// feed button's on-screen position. `reelsRevealCompleted` gates the first
    /// reel's playback (flips true 0.2s BEFORE the disc is full so the reel is
    /// already running when revealed). `reelsRevealMasked` keeps the mask on ONLY
    /// while the disc is animating — once full screen it drops to `false` so the
    /// `AVPlayerViewController` surface renders live video (a persistent SwiftUI
    /// `.mask()` over an AVPlayer layer freezes it on the poster). `reelsRevealClosing`
    /// routes the reverse wave before `reelsPresenter.dismiss()`.
    @State private var reelsRevealProgress: Double = 0
    @State private var reelsRevealCompleted = false
    @State private var reelsRevealMasked = false
    @State private var reelsRevealClosing = false
    /// Hoisted out of `@State` (Phase H) so deep-stack screens such as
    /// `StoryNotificationTargetScreen` can present the viewer through
    /// `.environmentObject` injection without threading a binding through
    /// every parent view. The coordinator's `pendingRequest` mirrors the
    /// legacy `Identifiable?` contract expected by `.fullScreenCover(item:)`.
    @StateObject private var storyViewerCoordinator = StoryViewerCoordinator()

    /// U1 — namespace de la transition zoom tray→viewer (iOS 18+). Injecté
    /// dans l'environnement pour que la bulle du tray (source) et le cover
    /// (destination) partagent la même identité visuelle. iOS 16-17 : les
    /// helpers `zoomTransition*` sont no-op, comportement historique intact.
    @Namespace private var storyZoomNamespace

    /// Conversation surfaced by a long-press / pull-down on an in-app
    /// notification toast — presented as a reusable `ConversationView` preview
    /// (last messages + simple composer) over the current page.
    @State private var notificationPreviewConversation: Conversation?
    /// Suppresses the toast `Button`'s tap action that can fire on release right
    /// after a long-press / drag opened the preview, preventing a double action
    /// (preview sheet + underlying navigation).
    @State private var suppressToastTap = false

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
                        // Tap sur l'avatar/le tray → première story non vue.
                        storyViewerCoordinator.present(StoryViewerRequest(id: userId, startAtFirstUnviewed: true))
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
                        // Identité par conversation — même fix que iPadRootView.
                        // `Router.navigateToConversation` REMPLACE la pile en une
                        // mutation (`path = [.conversation(B)]`) : déjà dans la
                        // conversation A, un tap sur la notification de B réutilise
                        // cette vue à la même profondeur — la prop `conversation`
                        // change (header OK) mais le @StateObject viewModel créé
                        // pour A survit et `.task` ne se relance pas : le contenu
                        // restait sur A. `.id` force le teardown (flush du
                        // brouillon de A via onDisappear) + une vue neuve pour B.
                        .id(conv.id)
                        .navigationBarHidden(true)
                        .onAppear { router.pendingReplyContext = nil }
                    case .settings:
                        SettingsView()
                            .navigationBarHidden(true)
                    case .profile:
                        ProfileView()
                            .navigationBarHidden(true)
                    case .contacts:
                        ContactsHubView()
                            .navigationBarHidden(true)
                    case .peopleDiscovery(let initialTab):
                        PeopleDiscoveryView(initialTab: initialTab)
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
                        .safeAreaInset(edge: .top, spacing: 0) { ConnectionBanner(onItemTap: handleSyncPillTap) }
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
                        .safeAreaInset(edge: .top, spacing: 0) { ConnectionBanner(onItemTap: handleSyncPillTap) }
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
                        .safeAreaInset(edge: .top, spacing: 0) { ConnectionBanner(onItemTap: handleSyncPillTap) }
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
                    case .postDetail(let postId, let initialPost, let showComments, let commentId, let parentCommentId):
                        PostDetailView(postId: postId, initialPost: initialPost, showComments: showComments, targetCommentId: commentId, targetParentCommentId: parentCommentId)
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
                    case .storyNotificationTarget(let storyId, let intent, let context):
                        StoryNotificationTargetScreen(
                            storyId: storyId,
                            intent: intent,
                            context: context
                        )
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

            // 3b. Reels overlay — full-screen immersive pager. Born as a liquid
            // disc at the feed button's exact on-screen position, the wavy edge
            // expands until it covers the screen (`LiquidRevealShape`). The real
            // first reel is masked from the small-disc state onward; its video
            // stays on the poster (PAUSED) until `reelsRevealCompleted` fires at
            // full screen. Close runs the reverse wave back toward the button.
            if let launch = reelsPresenter.launch {
                ReelsRevealContainer(
                    revealProgress: reelsRevealProgress,
                    applyMask: reelsRevealMasked,
                    feedButtonPositionRaw: feedButtonPosition,
                    isSearchBarVisible: !isScrollingDown,
                    reduceMotion: reduceMotionEnabled,
                    content: { safeArea in
                        ReelsPlayerView(
                            seedPosts: launch.seedPosts,
                            startId: launch.startId,
                            commentTargetId: launch.commentId,
                            commentParentTargetId: launch.parentCommentId,
                            revealCompleted: reelsRevealCompleted,
                            safeArea: safeArea,
                            onClose: { closeReels() },
                            onOpenProfile: { userId, username in
                                router.deepLinkProfileUser = ProfileSheetUser(userId: userId, username: username)
                            },
                            onOpenStory: { userId in
                                storyViewerCoordinator.present(StoryViewerRequest(
                                    id: userId,
                                    startAtFirstUnviewed: true,
                                    singleGroup: true
                                ))
                            },
                            authorHasStory: { userId in
                                storyViewModel.storyRingState(forUserId: userId) != .none
                            }
                        )
                    }
                )
                .id(launch.id)
                .zIndex(60)
                .onAppear { openReels() }
            }

            // 4. Draggable Floating buttons (hidden while a reel is open so they
            // don't float over the immersive player)
            if !router.isDeepRoute && reelsPresenter.launch == nil {
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
            if !router.isDeepRoute && reelsPresenter.launch == nil {
                menuLadder
            }

            // 7. Offline state — surfaced as a discreet inline chip inside
            // `ConnectionBanner` (the safe-area inset at the top of every
            // NavigationStack content view). The legacy full-width red
            // `OfflineBanner` was retired 2026-05-27 — the offline state
            // is just one of {.syncing, .offline, .disconnected} that the
            // small ConnectionBanner pill rotates through.
            pendingSettingsBannerOverlay

            // 8. Toast overlay — handled at MeeshyApp level to avoid duplicates

            // 9. Notification toast overlay (socket real-time)
            VStack {
                if let toast = notificationManager.currentToast {
                    NotificationToastView(event: toast) {
                        if suppressToastTap { return }
                        notificationManager.dismissToast()
                        handleSocketNotificationTap(toast)
                    }
                    // Long press OR pull the toast down ("tirer à la main") to
                    // open a conversation preview overlay instead of navigating.
                    .simultaneousGesture(
                        LongPressGesture(minimumDuration: 0.35).onEnded { _ in
                            openNotificationPreview(for: toast)
                        }
                    )
                    .simultaneousGesture(
                        DragGesture(minimumDistance: 24)
                            .onEnded { value in
                                if value.translation.height > 36 {
                                    openNotificationPreview(for: toast)
                                }
                            }
                    )
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
        .environmentObject(storyViewerCoordinator)
        .environment(\.zoomTransitionNamespace, storyZoomNamespace)
        // In-app notification preview: long-press / pull-down on a toast opens
        // the conversation (last messages + simple composer) over the current
        // page. A sheet creates a fresh environment, so the objects the reused
        // `ConversationView` reads must be re-injected here.
        .sheet(item: $notificationPreviewConversation) { conv in
            ConversationView(conversation: conv, previewMode: true, onOpenFullConversation: {
                // Leave the preview and open the real conversation with a
                // navigation push so going back returns to the originating
                // screen. Dismiss first, then push to avoid a present/dismiss
                // race.
                notificationPreviewConversation = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    router.navigateToConversation(conv)
                }
            })
                .environmentObject(router)
                .environmentObject(storyViewModel)
                .environmentObject(statusViewModel)
                .environmentObject(conversationViewModel)
                .environmentObject(storyViewerCoordinator)
                .presentationDetents([.large, .medium])
                .presentationDragIndicator(.visible)
        }
        // Propagate story viewer presentation state down to chrome (sync
        // pill, etc.) so they can skip rendering while a `fullScreenCover`
        // story is on top. Read by `ConnectionBanner` via
        // `@Environment(\.isStoryViewerPresenting)`. Cf. bug 2026-05-27.
        .environment(\.isStoryViewerPresenting, storyViewerCoordinator.pendingRequest != nil)
        .adaptiveOnChange(of: router.sceneTitle) { _, title in
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first?.title = String(format: String(localized: "root.scene_title_format", defaultValue: "Meeshy — %@", bundle: .main), title)
        }
        .onAppear {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first?.title = String(localized: "root.scene_title_default", defaultValue: "Meeshy — Conversations", bundle: .main)
        }
        .task {
            // Connect Socket.IO early so the backend knows we're online
            MessageSocketManager.shared.connect()
            statusViewModel.subscribeToSocketEvents()
            // Sans cet appel, le SDK reçoit bien `story:created` /
            // `story:updated` / `story:deleted` mais personne n'est sink'é
            // sur les publishers de SocialSocketManager → les stories des
            // amis n'arrivent jamais dans `storyGroups` en temps réel.
            storyViewModel.subscribeToSocketEvents()

            // Start SyncEngine socket relay
            await ConversationSyncEngine.shared.startSocketRelay()

            // Deferred cleanup
            Task.detached(priority: .background) {
                try? await Task.sleep(for: .seconds(5))
                await ConversationSyncEngine.shared.cleanupRetentionIfNeeded()
            }

            // Observe sync events for conversation list
            conversationViewModel.observeSync()

            // Réponse à un mood (confirmée via pop-up, ou immédiate en DM) :
            // résout/ouvre la DM avec l'auteur et amorce le composer.
            StatusBubbleController.shared.onConfirmedReply = { entry in
                router.navigateToStoryReply(
                    .status(statusId: entry.id, authorId: entry.userId,
                            authorName: entry.username, emoji: entry.moodEmoji,
                            content: entry.content, publishedAt: entry.createdAt),
                    conversationListViewModel: conversationViewModel
                )
            }

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
        }
        .fullScreenCover(item: $storyViewerCoordinator.pendingRequest) { request in
            StoryViewerContainer(
                viewModel: storyViewModel,
                userId: request.id,
                isPresented: Binding(
                    get: { storyViewerCoordinator.pendingRequest != nil },
                    set: { if !$0 { storyViewerCoordinator.dismiss() } }
                ),
                onReplyToStory: { replyContext in
                    storyViewerCoordinator.dismiss()
                    router.navigateToStoryReply(replyContext, conversationListViewModel: conversationViewModel)
                },
                singleGroup: request.singleGroup,
                postId: request.postId,
                startAtFirstUnviewed: request.startAtFirstUnviewed,
                presentationSource: "RootView.fromConv",
                initialAction: request.initialAction
            )
            // Re-inject the trio that StoryViewerView declares as
            // @EnvironmentObject (so it can re-inject them onto its inner
            // SharePickerView sheet). fullScreenCover does not inherit
            // EnvironmentObjects automatically.
            .environmentObject(router)
            .environmentObject(statusViewModel)
            .environmentObject(conversationViewModel)
            // Re-inject le flag isStoryViewerPresenting — fullScreenCover
            // n'hérite pas non plus des `Environment` values du parent,
            // donc le `StoryViewerContainer.ConnectionBanner` interne au
            // cover ne pouvait pas se cacher sans ça. Bug sync pill
            // chevauche header 2026-05-27.
            .environment(\.isStoryViewerPresenting, true)
            // U1 — transition zoom depuis la bulle du tray (iOS 18+, no-op
            // sinon). sourceID = userId du groupe : si la story s'ouvre
            // depuis un point d'entrée sans bulle enregistrée (notification,
            // deep link), iOS retombe sur la transition cover standard.
            .zoomTransitionDestination(sourceID: request.id, in: storyZoomNamespace)
        }
        // Call presentation is split between fullScreen and PiP modes so the
        // user can keep using the rest of the app during an active call:
        //   - `displayMode == .fullScreen` → present `CallView` via
        //     `.fullScreenCover` like before.
        //   - `displayMode == .pip` → the cover dismisses and
        //     `FloatingCallPillView` (mounted as an overlay below) takes
        //     over. Tapping the pill or pressing its expand button bumps
        //     `displayMode` back to `.fullScreen`, which re-presents the
        //     cover.
        // The Binding's `set: false` branch is now a "minimize" instead of
        // an "end call" — swiping down on the cover should NOT terminate
        // the call. The hangup button on either UI still routes through
        // `callManager.endCall()` explicitly.
        .fullScreenCover(isPresented: Binding(
            get: {
                CallState.shouldPresentFullScreenCover(
                    callState: callManager.callState,
                    displayMode: callManager.displayMode
                )
            },
            set: { if !$0 { callManager.displayMode = .pip } }
        )) {
            CallView(callManager: callManager)
        }
        .overlay(alignment: .top) {
            FloatingCallPillView()
                .padding(.top, MeeshySpacing.sm)
        }
        // §7.6 — call-waiting: a 2nd incoming call while one is active. Was dead
        // code (CallManager API + CallWaitingBannerView existed but were never
        // mounted). Reject ends the new call; "end & answer" drops the current
        // call and accepts the new one.
        .overlay(alignment: .top) {
            if callManager.showCallWaitingBanner {
                CallWaitingBannerView(
                    callerName: callManager.pendingIncomingCall?.fromUsername
                        ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main),
                    isVisible: $callManager.showCallWaitingBanner,
                    onReject: { callManager.rejectPendingCall() },
                    onEndAndAnswer: { callManager.endCurrentAndAnswerPending() }
                )
                .padding(.top, MeeshySpacing.sm)
            }
        }
        // SyncPill is mounted INSIDE ConnectionBanner (replacing the legacy
        // single-label "Synchronisation..." pill) via .safeAreaInset on the
        // NavigationStack root. Same emplacement, same chrome dimensions —
        // see ConnectionBanner.syncingPill / SyncPillContent.
        // B4 — Mini audio player floats above the tab bar. Mounted HERE
        // (not in `AdaptiveRootView`) so the tap-body handler can reach
        // the `router` via the local `@StateObject` — `AdaptiveRootView`
        // sits above the router scope, which was why the original
        // `onTapBody: {}` no-op shipped with Phase 7. The handler routes
        // through `navigateToConversationById` (same path used by deep
        // links and push notifications), so the cache-first resolution +
        // navigation retry logic is shared.
        .overlay(alignment: .bottom) {
            MiniAudioPlayerBar(
                onTapBody: {
                    guard let convId = ConversationAudioCoordinator.shared
                        .activeContext?.conversationId else { return }
                    navigateToConversationById(convId)
                },
                // Hide the bar whenever the user is already inside the
                // conversation playing the audio — the in-place audio
                // bubble owns the controls there. Captures `router` so
                // every `router.path` mutation propagates through to the
                // bar's next body eval via the parent re-render chain.
                currentConversationId: { router.currentConversationId }
            )
            .padding(.bottom, AudioOverlayConstants.iPhoneBottomPadding)
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: showFeed)
        .animation(.spring(), value: showMenu)
        .onReceive(NotificationCenter.default.publisher(for: .navigateToConversation)) { notification in
            if let conversation = notification.object as? Conversation {
                router.navigateToConversation(conversation)
            }
        }
        // Drive push-tap navigation straight off the published intent instead
        // of a NotificationCenter post. `@Published` replays its current value
        // to late subscribers, so a cold launch (tap from a terminated app)
        // where this view mounts AFTER the splash + payload was set still
        // receives it — the previous post-then-clear hop in MeeshyApp dropped
        // the intent when no view was mounted to hear the post, and the user
        // landed on the list instead of the conversation. Clearing AFTER we
        // navigate makes this the single consumption point.
        .onReceive(PushNotificationManager.shared.$pendingNotificationPayload) { payload in
            guard let payload, AuthManager.shared.isAuthenticated else { return }
            handlePushNotificationTap(payload)
            PushNotificationManager.shared.clearPendingNotification()
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
                    FeedbackToastManager.shared.showError(String(localized: "root.create_conversation.error", defaultValue: "Impossible de creer la conversation", bundle: .main))
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("openProfileSheet"))) { notification in
            guard let info = notification.object as? [String: String],
                  let userId = info["userId"] else { return }
            let username = info["username"] ?? userId
            router.deepLinkProfileUser = ProfileSheetUser(userId: userId, username: username)
        }
        // Phase H — `StoryExpiredContent` posts `.openStoryComposer` from the
        // notification flow when the underlying story is gone. Routing the
        // composer through `StoryViewModel.showStoryComposer` reuses the
        // single existing presentation surface (`StoryTrayView` listens on
        // the same flag) so the composer animates in cleanly without
        // stacking covers.
        .onReceive(NotificationCenter.default.publisher(for: .openStoryComposer)) { _ in
            storyViewModel.showStoryComposer = true
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("pushNavigateToRoute"))) { notification in
            guard let routeName = notification.object as? String else { return }
            if routeName.hasPrefix("postDetail:") {
                let postId = String(routeName.dropFirst("postDetail:".count))
                router.push(.postDetail(postId))
            } else if routeName.hasPrefix("storyDetail:") {
                let postId = String(routeName.dropFirst("storyDetail:".count))
                if let groupIdx = storyViewModel.groupIndex(forStoryId: postId) {
                    storyViewerCoordinator.present(StoryViewerRequest(
                        id: storyViewModel.storyGroups[groupIdx].id,
                        startAtFirstUnviewed: true
                    ))
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
                onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? ""),
                postsContent: { uid in
                    AnyView(ProfileUserPostsList(userId: uid, onOpenPost: { post in
                        router.deepLinkProfileUser = nil
                        router.push(.postDetail(post.id, post))
                    }, onOpenReel: { reel, reels in
                        ProfilePostsOpener.openReel(reel, in: reels) { router.deepLinkProfileUser = nil }
                    }))
                }
            )
            .presentationDetents([.large, .medium])
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showSharePicker) {
            if let content = router.pendingShareContent {
                // SwiftUI sheets create a separate presentation hierarchy and do
                // NOT inherit EnvironmentObjects from the parent view automatically.
                // Re-inject the trio that SharePickerView declares as
                // @EnvironmentObject (conversationListViewModel, router,
                // statusViewModel), otherwise tapping share crashes with
                // "EnvironmentObject error → SharePickerView.<missing>".
                SharePickerView(
                    sharedContent: content,
                    onDismiss: {
                        router.pendingShareContent = nil
                    }
                )
                .environmentObject(conversationViewModel)
                .environmentObject(router)
                .environmentObject(statusViewModel)
                .presentationDetents([.medium, .large])
            }
        }
        .adaptiveOnChange(of: router.pendingShareContent != nil) { _, hasContent in
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
        .adaptiveOnChange(of: router.path) { _, newPath in
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
        .adaptiveOnChange(of: deepLinkRouter.pendingDeepLink, initial: true) { _, newValue in
            handleDeepLink(newValue)
        }
    }

    // MARK: - Sync Pill Tap

    /// Tap handler wired into the `ConnectionBanner` → `SyncPill` chain.
    /// Routes each `OutboxUIItem.Source` to the appropriate destination
    /// using the local `router` + cached `conversations` list. Logs and
    /// no-ops when the source can't be resolved (e.g. a conversation
    /// that hasn't been hydrated into the cache yet).
    private func handleSyncPillTap(_ source: OutboxUIItem.Source) {
        switch source {
        case .conversation(let id):
            guard let conv = conversationViewModel.conversations.first(where: { $0.id == id }) else {
                Logger.messages.info("syncPill tap: conversation \(id, privacy: .public) not in cache, skipping")
                return
            }
            router.push(.conversation(conv))
        case .post(let id):
            router.push(.postDetail(id, nil, showComments: false))
        case .story:
            // V1 no-op — opening a story requires a StoryIntent +
            // StoryNotificationContext that the inline pill does not
            // carry. The status row is enough acknowledgement.
            Logger.messages.info("syncPill tap: story open not yet supported")
        case .unknown:
            break
        }
    }

    // MARK: - Deep Link Handling

    private func handleDeepLink(_ deepLink: DeepLink?) {
        guard let deepLink = deepLinkRouter.consumePendingDeepLink() else { return }

        switch deepLink {
        case .trackedLink(let token):
            // `/l/<token>` resolved async by targetType (re-sets pendingDeepLink).
            deepLinkRouter.resolveTrackedLink(token)
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

        case .postDetail(let postId):
            // PostDetailView lazy-loads the post itself, so we can push
            // immediately with `initialPost: nil`. The route case already
            // exists for in-app feed taps; the deep link just reuses it.
            router.push(.postDetail(postId))

        case .storyDetail(let postId):
            // Stories share the post identifier namespace. Prefer the
            // dedicated viewer when the story is in the local tray, fall
            // back to PostDetailView otherwise — matches the existing
            // `storyDetail:` push-notification dispatch (line ~472 above)
            // so cold-launch deep links and warm-launch push taps land on
            // the same screen for the same id.
            if let groupIdx = storyViewModel.groupIndex(forStoryId: postId) {
                storyViewerCoordinator.present(StoryViewerRequest(
                    id: storyViewModel.storyGroups[groupIdx].id,
                    startAtFirstUnviewed: true
                ))
            } else {
                router.push(.postDetail(postId))
            }

        case .userProfile(let username):
            // Opens the profile sheet over the conversation list (same
            // surface as in-app `Link` taps via Router.handleDeepLink and
            // as notification-driven profile navigation). `ProfileSheetUser`
            // resolves the username server-side, so a typo just shows the
            // empty state instead of crashing.
            router.deepLinkProfileUser = ProfileSheetUser(username: username)

        case .ownProfile:
            // Pop to the conversation list root first so back-swipe from
            // the profile screen lands on the home surface — not whatever
            // happened to be on top of the nav stack at cold launch.
            router.popToRoot()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                router.push(.profile)
            }

        case .userLinks:
            router.popToRoot()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                router.push(.links)
            }

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
                case .forbidden(let reason, _):
                    message = reason ?? String(localized: "Acces refuse a cette conversation", defaultValue: "Acces refuse a cette conversation")
                default:
                    message = error.errorDescription ?? String(localized: "Impossible d'ouvrir le lien", defaultValue: "Impossible d'ouvrir le lien")
                }
                FeedbackToastManager.shared.showError(message)
            } catch {
                FeedbackToastManager.shared.showError(
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
        /// Commentaire ciblé (like/réponse/commentaire) — l'app ouvre l'entité
        /// puis défile/surligne ce commentaire. `nil` = pas de cible commentaire.
        let commentId: String?
        /// Commentaire parent quand `commentId` est une réponse — l'app déplie le
        /// fil du parent avant de défiler jusqu'à la réponse.
        let parentCommentId: String?
        // Phase G — `metadata.postType` distinguishes a story-flavoured
        // post (`"STORY"`) from a regular feed post for `.postComment` /
        // `.commentReply`. May be `nil` when the gateway omits it; the
        // mapping in `navigateFromNotification` falls back to the local
        // story cache as a secondary signal.
        let postType: String?
        let senderId: String?
        let senderUsername: String?
        // Phase G — snapshot fed to `StoryNotificationTargetScreen` so the
        // expired empty state can render even when the underlying story is
        // gone. Always present (uses `Date.now` + empty actor fallback when
        // source data is partial, matching `StoryExpiredContent`'s
        // resilient rendering contract).
        let storyContext: StoryNotificationContext

        init(from notification: APINotification) {
            type = notification.notificationType
            conversationId = notification.context?.conversationId
            messageId = notification.context?.messageId
            postId = notification.context?.postId ?? notification.metadata?.postId
            commentId = notification.context?.commentId ?? notification.metadata?.commentId
            parentCommentId = notification.context?.parentCommentId ?? notification.metadata?.parentCommentId
            postType = notification.metadata?.postType
            senderId = notification.senderId
            senderUsername = notification.senderName
            storyContext = StoryNotificationContext.from(notification)
        }

        init(from event: SocketNotificationEvent) {
            type = event.notificationType
            conversationId = event.conversationId
            messageId = event.messageId
            postId = event.postId
            commentId = event.commentId
            parentCommentId = event.parentCommentId
            postType = event.postType
            senderId = event.senderId
            senderUsername = event.senderUsername
            storyContext = NotificationNavContext.makeStoryContext(from: event)
        }

        init(from payload: NotificationPayload) {
            type = MeeshyNotificationType(rawValue: payload.type ?? "") ?? .system
            conversationId = payload.conversationId
            messageId = payload.messageId
            postId = payload.postId
            commentId = payload.commentId
            parentCommentId = payload.parentCommentId
            postType = payload.postType
            senderId = payload.senderId
            senderUsername = payload.senderUsername
            storyContext = NotificationNavContext.makeStoryContext(from: payload)
        }

        // MARK: - Story context fabrication
        //
        // The gateway-canonical mapping (`StoryNotificationContext.from`)
        // expects an `APINotification` because that's the typed-metadata
        // path. The two transient sources (`SocketNotificationEvent`,
        // `NotificationPayload`) carry the same fields under different
        // shapes — replicate the fallback chain inline so every entry point
        // can drive `StoryNotificationTargetScreen` without a fresh fetch.

        private static func makeStoryContext(from event: SocketNotificationEvent) -> StoryNotificationContext {
            let trigger: StoryNotificationContext.Trigger
            switch event.notificationType {
            case .storyReaction, .statusReaction:
                trigger = .reaction(emoji: event.metadata?.emoji ?? "❤️")
            default:
                trigger = .comment(preview: event.metadata?.commentPreview ?? "")
            }
            return StoryNotificationContext(
                actorAvatar: event.actor?.avatar,
                actorDisplayName: event.actor?.displayName ?? event.actor?.username ?? "",
                trigger: trigger,
                occurredAt: Date()
            )
        }

        private static func makeStoryContext(from payload: NotificationPayload) -> StoryNotificationContext {
            // Push payloads don't carry trigger metadata reliably (APN
            // userInfo is restricted to a small subset). Use a neutral
            // fallback — the screen renders the actor + a generic icon
            // when `preview` is empty. Reaction emoji is unknown here; we
            // fall back to the heart, mirroring `StoryNotificationContext.from`.
            let trigger: StoryNotificationContext.Trigger = {
                switch payload.type ?? "" {
                case MeeshyNotificationType.storyReaction.rawValue,
                     MeeshyNotificationType.statusReaction.rawValue:
                    return .reaction(emoji: "❤️")
                default:
                    return .comment(preview: "")
                }
            }()
            return StoryNotificationContext(
                actorAvatar: payload.senderAvatar,
                actorDisplayName: payload.senderDisplayName ?? payload.senderUsername ?? "",
                trigger: trigger,
                occurredAt: Date()
            )
        }
    }

    private func handleNotificationTap(_ notification: APINotification) {
        navigateFromNotification(NotificationNavContext(from: notification))
    }

    private func handleSocketNotificationTap(_ event: SocketNotificationEvent) {
        navigateFromNotification(NotificationNavContext(from: event))
    }

    /// Long-press / pull-down on a notification toast: open the conversation as
    /// a preview overlay (reuses `ConversationView` with `previewMode`) instead
    /// of navigating away. Resolves the conversation cache-first (in-memory →
    /// GRDB → network), falling back to normal navigation when it isn't a
    /// conversation notification or can't be resolved.
    private func openNotificationPreview(for event: SocketNotificationEvent) {
        guard let conversationId = event.conversationId, !conversationId.isEmpty else {
            handleSocketNotificationTap(event)
            return
        }
        // Swallow the release tap that the toast Button may emit right after the
        // long-press / drag, then re-arm shortly after.
        suppressToastTap = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { suppressToastTap = false }
        HapticFeedback.medium()
        notificationManager.dismissToast()

        // Fast path: in-memory conversation list.
        if let existing = conversationViewModel.conversations.first(where: { $0.id == conversationId }) {
            notificationPreviewConversation = existing
            return
        }

        // @MainActor Task: every suspension resumes on the main actor, so the
        // @State mutations and `AuthManager.shared.currentUser` access are
        // isolation-correct without per-call `MainActor.run` wrappers.
        Task { @MainActor in
            // Cache-first: GRDB conversations list.
            let cachedList = await CacheCoordinator.shared.conversations.load(for: "list")
            let cachedConversations: [MeeshyConversation]? = {
                switch cachedList {
                case .fresh(let list, _), .stale(let list, _): return list
                case .expired, .empty: return nil
                }
            }()
            if let cached = cachedConversations?.first(where: { $0.id == conversationId }) {
                notificationPreviewConversation = cached
                return
            }

            // Network fallback.
            let currentUserId = AuthManager.shared.currentUser?.id ?? ""
            if let apiConv = try? await ConversationService.shared.getById(conversationId) {
                notificationPreviewConversation = apiConv.toConversation(currentUserId: currentUserId)
            } else {
                // Could not resolve — fall back to normal navigation.
                handleSocketNotificationTap(event)
            }
        }
    }

    func handlePushNotificationTap(_ payload: NotificationPayload) {
        navigateFromNotification(NotificationNavContext(from: payload))
    }

    // Routing decision for a social-content notification — delegated to the pure
    // `NotificationContentRouter` (single source of truth, mirrors the web's
    // `resolveContentRoute`). `metadata.postType` is the high-confidence signal;
    // when the gateway omits it we fall back to the notification type and, last,
    // to the local story cache where any post carrying a non-nil `expiresAt` is,
    // by definition, a story.
    private func isStoryNotification(_ ctx: NotificationNavContext, postId: String) -> Bool {
        let storyLifecycleHint = StoryService.shared.cachedPost(id: postId)?.expiresAt != nil
        return NotificationContentRouter.surface(
            postType: ctx.postType,
            notificationType: ctx.type,
            storyLifecycleHint: storyLifecycleHint
        ) == .story
    }

    // Reel-flavoured notification (`metadata.postType == "REEL"`). Reels open in
    // the full-screen immersive viewer, never the story target or the post detail.
    private func isReelNotification(_ ctx: NotificationNavContext) -> Bool {
        NotificationContentRouter.surface(
            postType: ctx.postType,
            notificationType: ctx.type,
            storyLifecycleHint: false
        ) == .reel
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
             .addedToConversation, .newConversation, .newConversationDirect, .newConversationGroup, .removedFromConversation:
            if let conversationId = ctx.conversationId, !conversationId.isEmpty {
                navigateToConversationById(conversationId)
            }

        case .missedCall, .callDeclined, .legacyCallMissed,
             .incomingCall, .callEnded, .legacyCallIncoming:
            if let conversationId = ctx.conversationId, !conversationId.isEmpty {
                navigateToConversationById(conversationId)
            }

        case .postLike, .legacyPostLike, .postRepost, .friendNewPost:
            if let postId = ctx.postId, !postId.isEmpty {
                if isReelNotification(ctx) {
                    openReelFromNotification(postId: postId)
                } else {
                    router.push(.postDetail(postId))
                }
            } else if let conversationId = ctx.conversationId, !conversationId.isEmpty {
                navigateToConversationById(conversationId)
            }

        case .postComment, .legacyPostComment, .commentLike, .commentReply, .commentReaction:
            if let postId = ctx.postId, !postId.isEmpty {
                // Reel comments/reactions open the full-screen reel viewer (the
                // user tapped a notification about a réel — it must land on the
                // réel, not the story viewer with the wrong post).
                //
                // Phase G — story-flavoured comments route to the notification
                // target screen (which redirects into the viewer's comments
                // overlay or shows the expired empty state). Detection: explicit
                // `metadata.postType == "STORY"` OR a cache hint (cached post
                // carries a non-nil `expiresAt`). Falls back to the regular
                // post-detail navigation otherwise.
                if isReelNotification(ctx) {
                    openReelFromNotification(postId: postId, commentId: ctx.commentId, parentCommentId: ctx.parentCommentId)
                } else if isStoryNotification(ctx, postId: postId) {
                    router.push(.storyNotificationTarget(
                        storyId: postId,
                        intent: .comments,
                        context: ctx.storyContext
                    ))
                } else {
                    router.push(.postDetail(
                        postId,
                        nil,
                        showComments: true,
                        commentId: ctx.commentId,
                        parentCommentId: ctx.parentCommentId
                    ))
                }
            } else if let conversationId = ctx.conversationId, !conversationId.isEmpty {
                navigateToConversationById(conversationId)
            }

        case .storyReaction, .statusReaction:
            // Phase G — every story-reaction notification routes through
            // the notification target screen so the viewer auto-opens its
            // viewers/reactions sheet (or the expired empty state surfaces
            // when the story is gone). Replaces the previous best-effort
            // `groupIndex(forStoryId:)` lookup which silently dropped the
            // notification when the local tray hadn't loaded the story yet.
            if let postId = ctx.postId, !postId.isEmpty {
                router.push(.storyNotificationTarget(
                    storyId: postId,
                    intent: .reactions,
                    context: ctx.storyContext
                ))
            }

        case .storyNewComment, .friendStoryComment, .storyThreadReply:
            if let postId = ctx.postId, !postId.isEmpty {
                router.push(.storyNotificationTarget(
                    storyId: postId,
                    intent: .comments,
                    context: ctx.storyContext
                ))
            }

        case .friendNewStory, .friendNewMood:
            if let postId = ctx.postId, !postId.isEmpty {
                router.push(.storyNotificationTarget(
                    storyId: postId,
                    intent: .view,
                    context: ctx.storyContext
                ))
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

    /// Opens the full-screen reel viewer for a reel-flavoured social
    /// notification. The reels feed (`getReels(seedReelId:)`) deliberately
    /// EXCLUDES the seed reel, so the target reel must be injected as the pager's
    /// seed — otherwise the pager opens on the first affinity reel (the original
    /// "wrong post" bug). Cache-first for an instant open (the Notification
    /// Service Extension prefetches the tapped post into the feed cache via
    /// `NSEPendingPostConsumer`), then network as a fallback so the tap is never a
    /// dead end.
    private func openReelFromNotification(postId: String, commentId: String? = nil, parentCommentId: String? = nil) {
        Task { @MainActor in
            await NSEPendingPostConsumer.shared.consumeAll()

            if let cached = await cachedReelSeed(for: postId) {
                reelsPresenter.present(posts: [cached], startId: postId, commentId: commentId, parentCommentId: parentCommentId)
                return
            }

            let preferred = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
            if let apiPost = try? await PostService.shared.getPost(postId: postId) {
                reelsPresenter.present(
                    posts: [apiPost.toFeedPost(preferredLanguages: preferred)],
                    startId: postId,
                    commentId: commentId,
                    parentCommentId: parentCommentId
                )
            } else {
                // Never a dead end: the universal post-detail surface renders any
                // post type, including a reel.
                router.push(.postDetail(postId))
            }
        }
    }

    /// The reel already cached for `postId` (NSE-prefetched or previously loaded),
    /// or `nil` on a cold cache. Mirrors `PostDetailViewModel.loadPost`'s
    /// cache-first read so a tapped reel notification renders instantly.
    private func cachedReelSeed(for postId: String) async -> FeedPost? {
        switch await CacheCoordinator.shared.feed.load(for: postId) {
        case .fresh(let cached, _), .stale(let cached, _):
            return cached.first
        case .expired, .empty:
            return nil
        }
    }

    private func navigateToConversationById(_ conversationId: String, highlightMessageId: String? = nil, ensureUnread: Bool = false) {
        // 1. Fast path: in-memory list (post-load happy path)
        if let existing = conversationViewModel.conversations.first(where: { $0.id == conversationId }) {
            var conv = existing
            if ensureUnread && conv.userState.unreadCount == 0 {
                conv.userState.unreadCount = 1
            }
            router.navigateToConversation(conv, highlightMessageId: highlightMessageId)
            return
        }

        Task {
            // 2. Cache-first: GRDB conversations list (cold-start deep link path).
            // Avoids forcing a network round-trip when previous-session data is
            // already on disk; the network fetch then runs silently in the
            // background to refresh the cache.
            let cachedList = await CacheCoordinator.shared.conversations.load(for: "list")
            let cachedConversations: [MeeshyConversation]? = {
                switch cachedList {
                case .fresh(let list, _), .stale(let list, _): return list
                case .expired, .empty: return nil
                }
            }()
            if let cached = cachedConversations?.first(where: { $0.id == conversationId }) {
                var c = cached
                if ensureUnread && c.userState.unreadCount == 0 { c.userState.unreadCount = 1 }
                router.navigateToConversation(c, highlightMessageId: highlightMessageId)
                // Background refresh — keeps the displayed conversation in sync
                // without blocking navigation. Failures are silent: the user
                // already sees the cached version.
                Task.detached(priority: .utility) {
                    let currentUserId = await AuthManager.shared.currentUser?.id ?? ""
                    if let apiConv = try? await ConversationService.shared.getById(conversationId) {
                        let refreshed = apiConv.toConversation(currentUserId: currentUserId)
                        var merged = cachedConversations ?? []
                        if let i = merged.firstIndex(where: { $0.id == refreshed.id }) {
                            merged[i] = refreshed
                        } else {
                            merged.insert(refreshed, at: 0)
                        }
                        try? await CacheCoordinator.shared.conversations.save(merged, for: "list")
                        await SearchIndex.shared.indexConversations([refreshed])
                    }
                }
                return
            }

            // 3. Network fallback: cache miss + offline-aware error UX.
            //    A push notification for a freshly-created conversation can
            //    race the gateway's commit transaction (rare but observed
            //    in production) — the client sees the notification before
            //    the conversation row is fully visible to the same user
            //    via `findFirst`. Retry once after a short delay before
            //    surfacing an error to the user. This eats one extra
            //    round-trip in the worst case but turns "Impossible
            //    d'ouvrir" into a working open in the common case.
            let currentUserId = AuthManager.shared.currentUser?.id ?? ""
            var lastError: Error?
            for attempt in 0..<2 {
                do {
                    let apiConv = try await ConversationService.shared.getById(conversationId)
                    var conv = apiConv.toConversation(currentUserId: currentUserId)
                    if ensureUnread && conv.userState.unreadCount == 0 {
                        conv.userState.unreadCount = 1
                    }
                    router.navigateToConversation(conv, highlightMessageId: highlightMessageId)
                    return
                } catch {
                    lastError = error
                    Logger.messages.error("[RootView] navigateToConversationById attempt=\(attempt) id=\(conversationId, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
                    if attempt == 0 {
                        try? await Task.sleep(nanoseconds: 600_000_000)
                    }
                }
            }
            let underlying = (lastError as? LocalizedError)?.errorDescription ?? lastError?.localizedDescription
            let detail = underlying.map { " (\($0))" } ?? ""
            FeedbackToastManager.shared.showError(
                String(localized: "Impossible d'ouvrir la conversation", defaultValue: "Impossible d'ouvrir la conversation") + detail
            )
        }
    }

    // MARK: - Pending Settings Banner
    /// Surfaces the count of user-settings changes still queued in
    /// `SettingsActionQueue` (typed offline, replayed on reconnect). Self-
    /// hides when the queue drains. Shown only when the device is online so
    /// it does not stack with `OfflineBanner`.
    private var pendingSettingsBannerOverlay: some View {
        VStack(spacing: 6) {
            PendingSettingsBannerInline()
            PendingStoryBannerInline()
            Spacer()
        }
        .padding(.top, 50)
        .zIndex(189)
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

    // MARK: - Reels Liquid Reveal Orchestration

    /// Opens the reels overlay: animate the wavy disc 0→1 from the feed button.
    /// Two timers fire off the animation: playback starts 0.2s BEFORE the disc is
    /// full (so the reel is already running when revealed), and the mask drops at
    /// full screen (so the live `AVPlayer` surface renders instead of staying
    /// frozen under a persistent `.mask()`). Reduce Motion uses a quick cross-fade.
    private func openReels() {
        reelsRevealCompleted = false
        reelsRevealClosing = false
        reelsRevealMasked = true
        reelsRevealProgress = 0
        let duration: Double = reduceMotionEnabled ? 0.18 : 0.35
        withAnimation(.easeOut(duration: duration)) {
            reelsRevealProgress = 1
        }
        // Wait for the reveal to FINISH before the first reel plays. Starting
        // earlier played UNDER the (poster-freezing) `.mask()`: those frames were
        // invisible, then dropping the mask snapped the surface to an already-
        // advanced frame — the launch flash. Now, at the animation's end, drop the
        // mask FIRST (the poster / frame 0 shows), THEN start playback from frame 0
        // over the poster that stays underneath (`ReelVideoView` keeps `ReelPoster`
        // behind the surface) → seamless, no flash and no black gap.
        DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
            guard reelsPresenter.launch != nil, !reelsRevealClosing else { return }
            reelsRevealMasked = false
            reelsRevealCompleted = true
        }
    }

    /// Closes the reels overlay with the reverse wave: pause the reel, re-apply
    /// the mask, shrink the disc back toward the feed button (1→0), THEN dismiss.
    /// Reduce Motion cross-fades.
    private func closeReels() {
        guard !reelsRevealClosing else { return }
        reelsRevealClosing = true
        reelsRevealCompleted = false
        reelsRevealMasked = true
        SharedAVPlayerManager.shared.pause()
        // Couper aussi tout réel-AUDIO en cours : il est piloté par le moteur
        // externe `@StateObject` de la page (pas par `SharedAVPlayerManager`), et
        // ni `AudioPlayerView.onDisappear` (early-return pour moteur externe) ni
        // `ReelPageView.onChange(isActive)` (la page reste active à la fermeture)
        // ne le stoppent. `stopAllAudio()` coupe les players audio/externes en
        // laissant le moteur vidéo (repris par la surface de fond du feed).
        PlaybackCoordinator.shared.stopAllAudio()
        HapticFeedback.light()
        let duration: Double = reduceMotionEnabled ? 0.18 : 0.3
        withAnimation(.easeIn(duration: duration)) {
            reelsRevealProgress = 0
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
            reelsPresenter.dismiss()
            reelsRevealClosing = false
        }
    }

    // MARK: - Draggable Floating Buttons (Free Position)
    private var draggableFloatingButtons: some View {
        FreeFloatingButtonsContainer(
            leftPosition: $feedButtonPosition,
            rightPosition: $menuButtonPosition,
            leftA11yLabel: String(localized: "a11y.floating.feed", defaultValue: "Flux", bundle: .main),
            rightA11yLabel: String(localized: "a11y.floating.menu", defaultValue: "Menu", bundle: .main),
            onLeftTap: {
                HapticFeedback.light()
                // Le tap ouvre l'overlay Feed (sa vocation : l'icône est le Feed).
                // L'ouverture des Reels n'est PLUS déclenchée ici — elle se fait
                // désormais via le bouton Réels du header « Meeshy Feed ».
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    showFeed.toggle()
                }
            },
            onRightTap: {
                HapticFeedback.light()
                // Le bouton porte l'avatar de l'utilisateur. 1er tap = déplie le
                // menu ; 2e tap (menu déjà ouvert) = ouvre la page profil dans les
                // réglages et referme le menu, comme n'importe quel autre item.
                if showMenu {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showMenu = false
                    }
                    router.push(.profile)
                } else {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showMenu.toggle()
                    }
                }
            },
            onLeftLongPress: {
                HapticFeedback.medium()
                // Long-press : même action que le tap (ouvre/ferme l'overlay Feed).
                // Les Reels se lancent depuis le bouton dédié du header « Meeshy Feed ».
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    showFeed.toggle()
                }
            },
            onRightLongPress: {
                // Long-press sur l'avatar = raccourci direct vers la page profil
                // (sans passer par le menu). Les réglages restent accessibles via
                // le dernier item du menu (roue dentée).
                HapticFeedback.medium()
                if showMenu {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showMenu = false
                    }
                }
                router.push(.profile)
            },
            isSearchBarVisible: !isScrollingDown,
            leftA11yHint: String(localized: "a11y.floating.feed.hint", defaultValue: "Ouvre le flux d'actualité", bundle: .main),
            rightA11yHint: String(localized: "a11y.floating.menu.hint", defaultValue: "Ouvre le menu de navigation", bundle: .main),
            rightA11yValue: notificationManager.unreadCount > 0
                ? String(format: String(localized: "a11y.floating.menu.notifications-value", defaultValue: "%d notifications en attente", bundle: .main), notificationManager.unreadCount)
                : nil,
            rightA11yActionName: String(localized: "a11y.floating.menu.profile-action", defaultValue: "Modifier le profil", bundle: .main),
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
                            .font(MeeshyFont.relative(20, weight: .semibold))
                            .foregroundColor(.white)
                    }
                }
            },
            rightContent: {
                // Menu button content — porte l'avatar de l'utilisateur (ou ses
                // initiales) à l'intérieur de l'anneau dégradé. L'anneau vire au
                // rouge quand le menu est ouvert ; le badge de notifications reste.
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: showMenu ? [MeeshyColors.error, MeeshyColors.indigo300] : [MeeshyColors.indigo600, MeeshyColors.indigo300],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )

                    MeeshyAvatar(
                        name: getUserDisplayName(AuthManager.shared.currentUser, fallback: "M"),
                        context: .custom(38),
                        avatarURL: AuthManager.shared.currentUser?.avatar,
                        thumbHash: AuthManager.shared.currentUser?.avatarThumbHash
                    )
                    .allowsHitTesting(false)

                    // Badge
                    if !showMenu && notificationManager.unreadCount > 0 {
                        NotificationBadge(count: notificationManager.unreadCount)
                            .accessibilityLabel(String(format: String(localized: "a11y.notifications.unread_count", defaultValue: "%d notifications non lues", bundle: .main), notificationManager.unreadCount))
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
            let menuSpacing: CGFloat = MeeshySpacing.md

            // Determine if menu should expand up or down
            let expandDown = pos.y < 0.5

            // Calculate menu position
            let menuX = pos.isLeft ? buttonX : buttonX
            let menuStartY = expandDown ? buttonY + halfButton + menuSpacing + menuItemSize / 2 : buttonY - halfButton - menuSpacing - menuItemSize / 2

            // Menu items — boutons d'action. Le profil n'a PAS d'item dédié : il
            // s'ouvre via le 2e tap (ou le long-press) sur le bouton avatar. Le
            // DERNIER bouton est la roue dentée (→ préférences générales).
            let menuItems: [(icon: String, color: String, label: String, action: () -> Void)] = [
                ("link.badge.plus", "F8B500", String(localized: "root.menu.links", defaultValue: "Mes liens"), { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.links) }),
                ("bell.fill", "FF6B6B", String(localized: "root.menu.notifications", defaultValue: "Notifications"), { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.notifications) }),
                ("person.2.fill", "6366F1", String(localized: "root.menu.contacts", defaultValue: "Contacts"), { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.contacts) }),
                ("sparkle.magnifyingglass", "8B5CF6", String(localized: "root.menu.discover", defaultValue: "Découvrir"), { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.peopleDiscovery()) }),
                ("person.3.fill", "2ECC71", String(localized: "root.menu.communities", defaultValue: "Communautés"), { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.communityList) }),
                ("gearshape.fill", "64748B", String(localized: "root.menu.settings", defaultValue: "Réglages"), { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }; router.push(.settings) })
            ]

            ForEach(Array(menuItems.enumerated()), id: \.offset) { index, item in
                let yOffset = expandDown
                    ? CGFloat(index) * (menuItemSize + menuSpacing)
                    : -CGFloat(index) * (menuItemSize + menuSpacing)

                let itemY = menuStartY + yOffset

                // Special handling for notifications & pending-request badges
                Group {
                    if item.icon == "bell.fill" {
                        ThemedActionButton(
                            icon: item.icon, color: item.color,
                            label: item.label, hint: String(localized: "a11y.menu.item.hint", defaultValue: "Ouvrir cette section", bundle: .main),
                            badge: notificationManager.unreadCount, action: item.action
                        )
                    } else if item.icon == "sparkle.magnifyingglass" {
                        ThemedActionButton(
                            icon: item.icon, color: item.color,
                            label: item.label, hint: String(localized: "a11y.menu.item.hint", defaultValue: "Ouvrir cette section", bundle: .main),
                            badge: FriendshipCache.shared.pendingReceivedCount, action: item.action
                        )
                    } else {
                        ThemedActionButton(
                            icon: item.icon, color: item.color,
                            label: item.label, hint: String(localized: "a11y.menu.item.hint", defaultValue: "Ouvrir cette section", bundle: .main),
                            action: item.action
                        )
                    }
                }
                .position(x: menuX, y: itemY)
                .menuAnimation(showMenu: showMenu, delay: Double(index) * 0.04)
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

// MARK: - Reels Liquid Reveal Container

/// Masks the immersive reels view with a `LiquidRevealShape` (water-wave
/// circular reveal) born at the feed button's exact on-screen position. The
/// REAL first reel is visible inside the disc from the small-disc state onward
/// (we mask the live view, not a placeholder). Under Reduce Motion the wavy
/// mask is swapped for a plain cross-fade — still roughly honoring the origin.
///
/// Inlined alongside `RootView` so the file stays self-contained (no
/// project.pbxproj entry for a separate component file).
private struct ReelsRevealContainer<Content: View>: View {
    let revealProgress: Double
    /// When `false`, the mask is dropped entirely so the live `AVPlayer` surface
    /// renders (a persistent mask over an AVPlayer layer freezes it on the poster).
    /// RootView flips it off once the disc reaches full screen.
    let applyMask: Bool
    /// Raw "x,y" (0-1 normalized) feed button position as persisted by RootView.
    let feedButtonPositionRaw: String
    /// Mirrors the floating-button container's search-bar flag — it selects the
    /// bottom safe-zone used to place the button (and thus the reveal focus).
    let isSearchBarVisible: Bool
    let reduceMotion: Bool
    /// Receives the REAL safe-area insets (read before `.ignoresSafeArea()`) so
    /// the reels chrome (back button, scrub bar) can clear the Dynamic Island /
    /// home indicator while the media stays full-bleed.
    @ViewBuilder let content: (EdgeInsets) -> Content

    /// A continuously flowing phase so the liquid edge "ripples" while expanding.
    @State private var wavePhase: Double = 0

    var body: some View {
        GeometryReader { geo in
            let center = FeedButtonAnchor.unitPoint(
                fromRaw: feedButtonPositionRaw,
                screenSize: geo.size,
                safeArea: geo.safeAreaInsets,
                isSearchBarVisible: isSearchBarVisible
            )

            content(geo.safeAreaInsets)
                .ignoresSafeArea()
                .modifier(
                    ReelsRevealMaskModifier(
                        revealProgress: revealProgress,
                        applyMask: applyMask,
                        center: center,
                        wavePhase: wavePhase,
                        reduceMotion: reduceMotion
                    )
                )
        }
        .ignoresSafeArea()
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 2.4).repeatForever(autoreverses: false)) {
                wavePhase = 2 * .pi
            }
        }
    }
}

/// Applies the reveal mask. Split out so the wavy-vs-fade branch reads cleanly.
/// Once `applyMask` is false (disc full screen) the content renders untouched so
/// the AVPlayer surface is live.
private struct ReelsRevealMaskModifier: ViewModifier {
    let revealProgress: Double
    let applyMask: Bool
    let center: UnitPoint
    let wavePhase: Double
    let reduceMotion: Bool

    func body(content: Content) -> some View {
        if !applyMask {
            content
        } else if reduceMotion {
            // Plain cross-fade honoring the origin loosely (no wavy edge).
            content.opacity(revealProgress)
        } else {
            content.mask(
                LiquidRevealShape(
                    center: center,
                    progress: revealProgress,
                    baseRadius: 26,           // feed button radius (52pt circle)
                    amplitude: 16,
                    frequency: 9,
                    phase: wavePhase
                )
                .ignoresSafeArea()
            )
        }
    }
}

// MARK: - Feed Button Anchor (pure mapping)

/// Pure mapping from the persisted feed-button position ("x,y", 0-1 normalized)
/// to a `UnitPoint` (0-1 fraction of the full screen rect) for the reveal focus.
///
/// Mirrors `FreeFloatingButton.screenPosition(for:)` EXACTLY (same constants:
/// buttonSize 52, minEdgePadding 20, topSafeZone 50, bottomSafeZone 110/50) so
/// the disc is born at the button's true center, not a naive linear corner map.
/// Kept as a standalone helper so the math is unit-testable without SwiftUI.
enum FeedButtonAnchor {
    static let buttonSize: CGFloat = 52
    static let minEdgePadding: CGFloat = 20
    static let topSafeZone: CGFloat = 50
    static let bottomSafeZoneWithSearch: CGFloat = 110
    static let bottomSafeZoneNoSearch: CGFloat = 50

    /// Returns the button center as a screen point in the given geometry.
    static func screenPoint(
        fromRaw raw: String,
        screenSize: CGSize,
        safeArea: EdgeInsets,
        isSearchBarVisible: Bool
    ) -> CGPoint {
        let pos = parse(raw)
        let half = buttonSize / 2
        let bottomSafeZone = isSearchBarVisible ? bottomSafeZoneWithSearch : bottomSafeZoneNoSearch
        let minX = safeArea.leading + minEdgePadding + half
        let maxX = screenSize.width - safeArea.trailing - minEdgePadding - half
        let minY = safeArea.top + topSafeZone + half
        let maxY = screenSize.height - safeArea.bottom - bottomSafeZone - half
        let x = minX + (maxX - minX) * pos.x
        let y = minY + (maxY - minY) * pos.y
        return CGPoint(x: x, y: y)
    }

    /// Returns the button center as a `UnitPoint` (0-1 fraction of the full rect).
    static func unitPoint(
        fromRaw raw: String,
        screenSize: CGSize,
        safeArea: EdgeInsets,
        isSearchBarVisible: Bool
    ) -> UnitPoint {
        guard screenSize.width > 0, screenSize.height > 0 else { return .topLeading }
        let p = screenPoint(fromRaw: raw, screenSize: screenSize, safeArea: safeArea, isSearchBarVisible: isSearchBarVisible)
        return UnitPoint(x: p.x / screenSize.width, y: p.y / screenSize.height)
    }

    /// Parses "x,y" (0-1) → clamped CGPoint. Defaults to top-left (0,0) — the
    /// same default RootView persists for the feed button.
    static func parse(_ raw: String) -> CGPoint {
        let parts = raw.split(separator: ",")
        guard parts.count == 2,
              let x = Double(parts[0]),
              let y = Double(parts[1]) else {
            return CGPoint(x: 0, y: 0)
        }
        return CGPoint(x: min(max(x, 0), 1), y: min(max(y, 0), 1))
    }
}

// MARK: - Pending Settings Banner (inline)

/// Inlined alongside `RootView` so the file remains self-contained without
/// requiring a project.pbxproj entry for a separate component file.
private struct PendingSettingsBannerInline: View {
    @State private var pendingCount: Int = 0
    @State private var subscription: AnyCancellable?

    var body: some View {
        Group {
            if pendingCount > 0 {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(.white)

                    Text("\(String(localized: "root.pending_changes", defaultValue: "Modifications en attente", bundle: .main)) (\(pendingCount))")
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(.white)

                    Spacer()

                    Text(String(localized: "root.sync_on_reconnect", defaultValue: "Synchronisation au retour en ligne", bundle: .main))
                        .font(MeeshyFont.relative(10, weight: .regular))
                        .foregroundColor(.white.opacity(0.85))
                        .lineLimit(1)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    LinearGradient(
                        colors: [
                            MeeshyColors.indigo500.opacity(0.92),
                            MeeshyColors.indigo700.opacity(0.88)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
                .shadow(color: MeeshyColors.indigo500.opacity(0.3), radius: 6, y: 2)
                .padding(.horizontal, 16)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: pendingCount)
        .task {
            pendingCount = await SettingsActionQueue.shared.count
            subscription = SettingsActionQueue.shared.pendingCountChanged.publisher
                .receive(on: DispatchQueue.main)
                .sink { count in
                    pendingCount = count
                }
        }
        .onDisappear {
            subscription?.cancel()
            subscription = nil
        }
    }
}

// MARK: - Pending Story Banner (inline)

/// Surfaces the count of stories waiting in `StoryPublishQueue` (typically
/// composed offline). Mirrors `PendingSettingsBannerInline`. Self-hides
/// when the queue drains. Inlined to avoid a project.pbxproj edit.
private struct PendingStoryBannerInline: View {
    @StateObject private var publishService = StoryPublishService.shared

    var body: some View {
        Group {
            if publishService.pendingCount > 0 {
                HStack(spacing: 8) {
                    Image(systemName: "photo.stack")
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(.white)

                    Text("\(String(localized: "root.pending_stories", defaultValue: "Stories en attente", bundle: .main)) (\(publishService.pendingCount))")
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(.white)

                    Spacer()

                    Text(String(localized: "root.publish_on_reconnect", defaultValue: "Publication au retour en ligne", bundle: .main))
                        .font(MeeshyFont.relative(10, weight: .regular))
                        .foregroundColor(.white.opacity(0.85))
                        .lineLimit(1)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    LinearGradient(
                        colors: [
                            MeeshyColors.indigo500.opacity(0.92),
                            MeeshyColors.indigo700.opacity(0.88)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
                .shadow(color: MeeshyColors.indigo500.opacity(0.3), radius: 6, y: 2)
                .padding(.horizontal, 16)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: publishService.pendingCount)
    }
}
