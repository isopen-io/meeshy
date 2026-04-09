import SwiftUI
import os
import MeeshySDK
import MeeshyUI

// MARK: - Section Drop Delegate

struct SectionDropDelegate: DropDelegate {
    let sectionId: String
    @Binding var dropTargetSection: String?
    @Binding var draggingConversation: Conversation?
    let onDrop: ([NSItemProvider]) -> Bool

    func dropEntered(info: DropInfo) {
        guard sectionId != "pinned" else { return }
        withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) {
            dropTargetSection = sectionId
        }
    }

    func dropExited(info: DropInfo) {
        withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) {
            if dropTargetSection == sectionId {
                dropTargetSection = nil
            }
        }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        guard sectionId != "pinned" else {
            return DropProposal(operation: .forbidden)
        }
        return DropProposal(operation: .move)
    }

    func performDrop(info: DropInfo) -> Bool {
        guard sectionId != "pinned" else { return false }
        let result = onDrop(info.itemProviders(for: [.text]))
        withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) {
            dropTargetSection = nil
            draggingConversation = nil
        }
        return result
    }
}

// MARK: - Conversation List View
struct ConversationListView: View {
    @Binding var isScrollingDown: Bool
    @Binding var feedIsVisible: Bool  // Track Feed visibility to show search bar when Feed closes
    let onSelect: (Conversation) -> Void
    var onStoryViewRequest: ((String, Bool) -> Void)? = nil  // (userId, fromTray)
    var onNewConversation: (() -> Void)? = nil

    // iPad-specific: extra trailing icons and Feed button in header
    var iPadNotificationCount: Int = 0
    var onNotificationsTap: (() -> Void)? = nil
    var onSettingsTap: (() -> Void)? = nil
    var iPadFeedAction: (() -> Void)? = nil

    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject var theme = ThemeManager.shared
    @ObservedObject var lockManager = ConversationLockManager.shared
    // Lecture directe sans @ObservedObject — évite que chaque event presence force
    // un re-render complet de la liste. La présence est rafraîchie lors des refreshs naturels.
    private var presenceManager: PresenceManager { PresenceManager.shared }
    @EnvironmentObject var storyViewModel: StoryViewModel
    @EnvironmentObject var statusViewModel: StatusViewModel
    @EnvironmentObject var conversationViewModel: ConversationListViewModel
    @EnvironmentObject var router: Router

    // Status
    @State private var showStatusComposer = false
    @State private var showStatusBubble = false
    @State private var selectedStatusEntry: StatusEntry?
    @State private var moodBadgeAnchor: CGPoint = .zero

    // Search and Filters
    @FocusState var isSearching: Bool
    @State var showSearchOverlay: Bool = false
    @State var searchBounce: Bool = false
    @State private var animateGradient = false
    @State private var expandedSections: Set<String> = ["pinned", "other"]

    // Scroll tracking
    @State private var hideSearchBar = false

    // Performance optimized scroll variables
    @State private var isPullingToRefresh = false  // Track pull-to-refresh gesture
    @State private var selectedProfileUser: ProfileSheetUser? = nil
    @State private var headerScrollOffset: CGFloat = 0
    @State private var lastScrollDirectionChange: Date = .distantPast
    
    // UI states
    @State var blockTargetConversation: Conversation? = nil
    @State var showBlockConfirmation = false
    @State var lockSheetMode: ConversationLockSheet.Mode = .lockConversation
    @State var lockSheetConversation: Conversation? = nil
    @State var showNoMasterPinAlert = false
    @State var showGlobalSearch = false
    @State var conversationInfoConversation: Conversation? = nil
    
    // Widget preview state
    @State var showWidgetPreview = false
    @State private var showShareLinkSheet = false

    // Invite sheet
    @State var inviteSheetConversation: Conversation? = nil

    // Status republication
    @State private var republishStatusEntry: StatusEntry? = nil

    // Communities data
    @State var userCommunities: [MeeshyCommunity] = []

    // Preview state for hard press
    @State private var previewConversation: Conversation? = nil

    // Drag & Drop state
    @State private var draggingConversation: Conversation? = nil
    @State private var dropTargetSection: String? = nil

    @State var userCommunityLookup: [String: MeeshyCommunity] = [:]


    // Alternative init without binding for backward compatibility
    init(
        isScrollingDown: Binding<Bool>? = nil,
        feedIsVisible: Binding<Bool>? = nil,
        onSelect: @escaping (Conversation) -> Void,
        onStoryViewRequest: ((String, Bool) -> Void)? = nil,
        onNewConversation: (() -> Void)? = nil,
        iPadNotificationCount: Int = 0,
        onNotificationsTap: (() -> Void)? = nil,
        onSettingsTap: (() -> Void)? = nil,
        iPadFeedAction: (() -> Void)? = nil
    ) {
        self._isScrollingDown = isScrollingDown ?? .constant(false)
        self._feedIsVisible = feedIsVisible ?? .constant(false)
        self.onSelect = onSelect
        self.onStoryViewRequest = onStoryViewRequest
        self.onNewConversation = onNewConversation
        self.iPadNotificationCount = iPadNotificationCount
        self.onNotificationsTap = onNotificationsTap
        self.onSettingsTap = onSettingsTap
        self.iPadFeedAction = iPadFeedAction
    }

    // The filtered and grouped conversations are now calculated on a background queue 
    // inside `ConversationListViewModel` to prevent main thread freezes and overheating.

    @ViewBuilder
    private var sectionsContent: some View {
        LazyVStack(spacing: 8) {
            ForEach(conversationViewModel.groupedConversations, id: \.section.id) { group in
                sectionView(for: group)
            }
        }
    }

    @ViewBuilder
    private func sectionView(for group: (section: ConversationSection, conversations: [Conversation])) -> some View {
        // Section Header with drop target
        SectionHeaderView(
            section: group.section,
            count: group.conversations.count,
            isExpanded: expandedSections.contains(group.section.id),
            isDropTarget: dropTargetSection == group.section.id && group.section.id != "pinned"
        ) {
            toggleSection(group.section.id)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .onDrop(of: [.text], delegate: SectionDropDelegate(
            sectionId: group.section.id,
            dropTargetSection: $dropTargetSection,
            draggingConversation: $draggingConversation,
            onDrop: { handleDrop(to: group.section.id, providers: $0) }
        ))

        // Section Content with animated expand/collapse
        if expandedSections.contains(group.section.id) {
            sectionConversations(group.conversations)
                .padding(.horizontal, 16)
                .transition(.asymmetric(
                    insertion: .opacity.combined(with: .scale(scale: 0.95, anchor: .top)).combined(with: .offset(y: -8)),
                    removal: .opacity.combined(with: .scale(scale: 0.98, anchor: .top))
                ))
        }
    }

    @ViewBuilder
    private func sectionConversations(_ conversations: [Conversation]) -> some View {
        // rowWidth = (screenWidth - sectionPadding) - innerPadding - avatar - badge - spacing
        // sectionPadding: 16+16=32 applied by caller; innerPadding: 32; avatar: 52; badge: 28; spacing: 24
        let rowWidth = UIScreen.main.bounds.width - 32 - 32 - 52 - 28 - 24
        LazyVStack(spacing: 6) {
            ForEach(conversations, id: \.id) { conversation in
                conversationRow(for: conversation, rowWidth: rowWidth)
                    .onAppear {
                        // Scroll infini uniquement pour les users avec >1000 conversations
                        // (loadMore() est no-op sinon)
                        triggerLoadMoreIfNeeded(conversation: conversation)
                    }
            }
        }
    }

    private func storyRingState(for conversation: Conversation) -> StoryRingState {
        guard conversation.type == .direct, let userId = conversation.participantUserId else { return .none }
        if storyViewModel.hasUnviewedStories(forUserId: userId) { return .unread }
        if storyViewModel.hasStories(forUserId: userId) { return .read }
        return .none
    }

    private func conversationMoodStatus(for conversation: Conversation) -> StatusEntry? {
        guard conversation.type == .direct, let userId = conversation.participantUserId else { return nil }
        return statusViewModel.statusForUser(userId: userId)
    }

    @ViewBuilder
    private func conversationRow(for conversation: Conversation, rowWidth: CGFloat) -> some View {
        let community: MeeshyCommunity? = {
            guard conversation.type == .community || conversation.communityId != nil,
                  let communityId = conversation.communityId else { return nil }
            return userCommunityLookup[communityId] ?? userCommunities.first(where: { $0.id == communityId })
        }()

        SwipeableRow(
            leadingActions: leadingSwipeActions(for: conversation),
            trailingActions: trailingSwipeActions(for: conversation)
        ) {
            ThemedConversationRow(
                conversation: conversation,
                community: community,
                availableWidth: rowWidth,
                isDragging: draggingConversation?.id == conversation.id,
                presenceState: presenceManager.presenceState(for: conversation.participantUserId ?? ""),
                onViewStory: {
                    handleStoryView(conversation)
                },
                onViewProfile: {
                    handleProfileView(conversation)
                },
                onViewConversationInfo: {
                    handleConversationInfoView(conversation)
                },
                onMoodBadgeTap: { anchor in
                    handleMoodBadgeTap(conversation, at: anchor)
                },
                onCreateShareLink: canCreateShareLink(for: conversation) ? {
                    inviteSheetConversation = conversation
                } : nil,
                isDark: theme.mode.isDark,
                storyRingState: storyRingState(for: conversation),
                moodStatus: conversationMoodStatus(for: conversation),
                typingUsername: conversationViewModel.typingUsernames[conversation.id]
            )
            .equatable()
            .contentShape(Rectangle())
            .onTapGesture {
                HapticFeedback.light()
                if ConversationLockManager.shared.isLocked(conversation.id) {
                    lockSheetMode = .openConversation
                    lockSheetConversation = conversation
                } else {
                    onSelect(conversation)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
            .accessibilityHint("Ouvre la conversation")
            .onDrag {
                draggingConversation = conversation
                HapticFeedback.medium()
                return NSItemProvider(object: conversation.id as NSString)
            }
            .contextMenu {
                conversationContextMenu(for: conversation)
            } preview: {
                ConversationPreviewView(
                    conversation: conversation,
                    cachedMessages: conversationViewModel.previewMessages[conversation.id] ?? []
                )
            }
            .task {
                await conversationViewModel.loadPreviewMessages(for: conversation.id)
            }
        }
    }

    // MARK: - Share Link Permission

    func canCreateShareLink(for conversation: Conversation) -> Bool {
        if conversation.type == .direct { return false }
        if conversation.type == .group {
            let role = conversation.currentUserRole?.lowercased() ?? "member"
            return ["admin", "moderator", "owner", "co-owner", "bigboss"].contains(role)
        }
        return true
    }

    func shareConversationLink(for conversation: Conversation) async {
        do {
            let linkName = "Rejoins la conversation \"\(conversation.name)\""
            let welcome = "Rejoins moi pour échanger sans filtre ni barrière..."
            let request = CreateShareLinkRequest(
                conversationId: conversation.id,
                name: linkName,
                description: welcome,
                allowAnonymousMessages: true,
                allowAnonymousFiles: false,
                allowAnonymousImages: true,
                allowViewHistory: true,
                requireAccount: false,
                requireNickname: true,
                requireEmail: false,
                requireBirthday: false
            )
            let result = try await ShareLinkService.shared.createShareLink(request: request)
            let shareURL = "https://meeshy.me/join/\(result.linkId)"
            await MainActor.run {
                let activityVC = UIActivityViewController(activityItems: [shareURL], applicationActivities: nil)
                if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                   let rootVC = windowScene.windows.first?.rootViewController {
                    var topVC = rootVC
                    while let presented = topVC.presentedViewController { topVC = presented }
                    activityVC.popoverPresentationController?.sourceView = topVC.view
                    topVC.present(activityVC, animated: true)
                }
            }
            HapticFeedback.success()
        } catch {
            HapticFeedback.error()
        }
    }

    // MARK: - Swipe Actions

    private func leadingSwipeActions(for conversation: Conversation) -> [SwipeAction] {
        let isLocked = lockManager.isLocked(conversation.id)
        return [
            SwipeAction(
                icon: conversation.isPinned ? "pin.slash.fill" : "pin.fill",
                label: conversation.isPinned
                    ? String(localized: "swipe.unpin", defaultValue: "D\u{00e9}s\u{00e9}pingler")
                    : String(localized: "swipe.pin", defaultValue: "\u{00c9}pingler"),
                color: Color(hex: "3B82F6")
            ) {
                Task { await conversationViewModel.togglePin(for: conversation.id) }
            },
            SwipeAction(
                icon: conversation.isMuted ? "bell.fill" : "bell.slash.fill",
                label: conversation.isMuted
                    ? String(localized: "swipe.unmute", defaultValue: "Son")
                    : String(localized: "swipe.mute", defaultValue: "Silence"),
                color: Color(hex: "6B7280")
            ) {
                Task { await conversationViewModel.toggleMute(for: conversation.id) }
            },
            SwipeAction(
                icon: isLocked ? "lock.open.fill" : "lock.fill",
                label: isLocked
                    ? String(localized: "swipe.unlock", defaultValue: "D\u{00e9}verrouiller")
                    : String(localized: "swipe.lock", defaultValue: "Verrouiller"),
                color: Color(hex: "F59E0B")
            ) {
                if isLocked {
                    lockSheetMode = .unlockConversation
                    lockSheetConversation = conversation
                } else if lockManager.masterPinConfigured {
                    lockSheetMode = .lockConversation
                    lockSheetConversation = conversation
                } else {
                    showNoMasterPinAlert = true
                }
            }
        ]
    }

    private func trailingSwipeActions(for conversation: Conversation) -> [SwipeAction] {
        let isArchived = !conversation.isActive
        let isRead = conversation.unreadCount == 0
        var actions: [SwipeAction] = [
            SwipeAction(
                icon: isArchived ? "tray.and.arrow.up.fill" : "archivebox.fill",
                label: isArchived
                    ? String(localized: "swipe.unarchive", defaultValue: "D\u{00e9}sarchiver")
                    : String(localized: "swipe.archive", defaultValue: "Archiver"),
                color: MeeshyColors.warning
            ) {
                if isArchived {
                    Task { await conversationViewModel.unarchiveConversation(conversationId: conversation.id) }
                } else {
                    Task { await conversationViewModel.archiveConversation(conversationId: conversation.id) }
                }
            },
            SwipeAction(
                icon: isRead ? "envelope.badge.fill" : "envelope.open.fill",
                label: isRead
                    ? String(localized: "swipe.mark_unread", defaultValue: "Non lu")
                    : String(localized: "swipe.mark_read", defaultValue: "Lu"),
                color: Color(hex: "8B5CF6")
            ) {
                if isRead {
                    Task { await conversationViewModel.markAsUnread(conversationId: conversation.id) }
                } else {
                    Task { await conversationViewModel.markAsRead(conversationId: conversation.id) }
                }
            }
        ]

        if conversation.type == .direct, let userId = conversation.participantUserId {
            let isBlocked = BlockService.shared.isBlocked(userId: userId)
            actions.append(SwipeAction(
                icon: isBlocked ? "hand.raised.slash.fill" : "hand.raised.fill",
                label: isBlocked
                    ? String(localized: "swipe.unblock", defaultValue: "D\u{00e9}bloquer")
                    : String(localized: "swipe.block", defaultValue: "Bloquer"),
                color: Color(hex: "EF4444")
            ) {
                if isBlocked {
                    Task {
                        try? await BlockService.shared.unblockUser(userId: userId)
                        HapticFeedback.success()
                    }
                } else {
                    blockTargetConversation = conversation
                    showBlockConfirmation = true
                }
            })
        }

        actions.append(SwipeAction(
            icon: "eye.slash.fill",
            label: String(localized: "swipe.hide", defaultValue: "Masquer"),
            color: Color(hex: "EF4444")
        ) {
            Task { await conversationViewModel.deleteConversation(conversationId: conversation.id) }
        })

        return actions
    }

    private func triggerLoadMoreIfNeeded(conversation: Conversation) {
        let all = conversationViewModel.conversations
        // Scroll infini uniquement au-delà de 1000 conversations chargées
        // (en dessous, loadAllRemainingBackground() a tout chargé)
        guard all.count >= 1000 else { return }
        guard let idx = all.firstIndex(where: { $0.id == conversation.id }) else { return }
        let threshold = max(0, all.count - 5)
        if idx >= threshold {
            Task { await conversationViewModel.loadMore() }
        }
    }

    private func toggleSection(_ sectionId: String) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            if expandedSections.contains(sectionId) {
                expandedSections.remove(sectionId)
            } else {
                expandedSections.insert(sectionId)
            }
        }
        HapticFeedback.light()
        let isUserCategory = conversationViewModel.userCategories.contains(where: { $0.id == sectionId })
        if isUserCategory {
            conversationViewModel.persistCategoryExpansion(id: sectionId, isExpanded: expandedSections.contains(sectionId))
        }
    }

    var body: some View {
        mainContent
            .onChange(of: selectedProfileUser) { _, newValue in
                if let user = newValue {
                    selectedProfileUser = nil
                    router.deepLinkProfileUser = user
                }
            }
            .sheet(item: $conversationInfoConversation) { conversation in
                ConversationInfoSheet(
                    conversation: conversation,
                    accentColor: conversation.accentColor,
                    messages: []
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .sheet(item: $inviteSheetConversation) { conversation in
                InviteFriendsSheet(conversation: conversation)
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
        .withStatusBubble()
        .sheet(item: $republishStatusEntry) { entry in
            StatusComposerView(
                viewModel: statusViewModel,
                initialEmoji: entry.moodEmoji,
                initialText: entry.content,
                viaUsername: entry.username
            )
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $showStatusComposer) {
            StatusComposerView(viewModel: statusViewModel)
                .presentationDetents([.medium])
        }
    }

    private var mainContent: some View {
        mainContentZStack
            .animation(.spring(response: 0.4, dampingFraction: 0.8), value: conversationViewModel.selectedFilter)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: expandedSections)
            .onChange(of: isScrollingDown) { wasHidden, isHidden in
                if !wasHidden && isHidden { showSearchOverlay = false }
            }
            .onAppear {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { isScrollingDown = false }
            }
            .task {
                async let conversations: Void = conversationViewModel.loadConversations()
                async let communities: Void = loadUserCommunities()
                _ = await (conversations, communities)
            }
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase == .active {
                    conversationViewModel.handleForegroundReturn()
                }
            }
            .onChange(of: conversationViewModel.userCategories) { _, categories in
                for cat in categories where cat.isExpanded { expandedSections.insert(cat.id) }
            }
            .onChange(of: conversationViewModel.filteredConversations.isEmpty) { _, isEmpty in
                if isEmpty && isScrollingDown {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { isScrollingDown = false }
                }
            }
            .onChange(of: conversationViewModel.selectedFilter) { _, _ in
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { isScrollingDown = false }
            }
            .onChange(of: feedIsVisible) { wasVisible, isVisible in
                if wasVisible && !isVisible {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { isScrollingDown = false }
                }
            }
            .overlay {
                if showStatusBubble, let status = selectedStatusEntry {
                    StatusBubbleOverlay(status: status, anchorPoint: moodBadgeAnchor, isPresented: $showStatusBubble, onRepublish: { entry in
                        republishStatusEntry = entry
                    })
                        .zIndex(200)
                }
            }
            .sheet(item: $lockSheetConversation) { conversation in
                ConversationLockSheet(
                    mode: lockSheetMode,
                    conversationId: conversation.id,
                    conversationName: conversation.name,
                    onSuccess: {
                        if case .openConversation = lockSheetMode { onSelect(conversation) }
                    }
                )
                .environmentObject(theme)
            }
            .alert("Master PIN requis", isPresented: $showNoMasterPinAlert) {
                Button("Configurer", role: .none) { router.push(.settings) }
                Button("Annuler", role: .cancel) {}
            } message: {
                Text("Configurez d'abord un master PIN dans Paramètres > Sécurité pour verrouiller des conversations.")
            }
            .sheet(isPresented: $showWidgetPreview) {
                WidgetPreviewView(onNewConversation: onNewConversation)
                    .environmentObject(conversationViewModel)
                    .environmentObject(router)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
            .fullScreenCover(isPresented: $showGlobalSearch) {
                GlobalSearchView()
                    .environmentObject(conversationViewModel)
                    .environmentObject(router)
            }
            .confirmationDialog(
                String(localized: "block.confirm.title", defaultValue: "Bloquer cet utilisateur ?"),
                isPresented: $showBlockConfirmation,
                titleVisibility: .visible
            ) {
                Button(String(localized: "action.block", defaultValue: "Bloquer"), role: .destructive) {
                    guard let conv = blockTargetConversation,
                          let targetUserId = conv.participantUserId else { return }
                    Task {
                        try? await BlockService.shared.blockUser(userId: targetUserId)
                        await conversationViewModel.archiveConversation(conversationId: conv.id)
                        HapticFeedback.success()
                    }
                }
                Button(String(localized: "action.cancel", defaultValue: "Annuler"), role: .cancel) {}
            } message: {
                Text(String(localized: "block.confirm.message", defaultValue: "Cette personne ne pourra plus vous envoyer de messages dans cette conversation."))
            }
    }

    private var mainContentZStack: some View {
        ZStack(alignment: .bottom) {
            // Layer 1: Full-screen scroll content
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    // Scroll offset detector (MUST be first child)
                    GeometryReader { geo in
                        Color.clear.preference(
                            key: ScrollOffsetPreferenceKey.self,
                            value: geo.frame(in: .named("scroll")).minY
                        )
                    }
                    .frame(height: 0)

                    // Header spacer — pushes content below the expanded header
                    Color.clear.frame(height: CollapsibleHeaderMetrics.expandedHeight)

                    // Story carousel
                    StoryTrayView(viewModel: storyViewModel, onViewStory: { userId in
                        onStoryViewRequest?(userId, true)
                    }, onAddStatus: {
                        showStatusComposer = true
                    })

                    // Connection status banner (banner manages its own socket observation)
                    ConnectionBanner()
                        .padding(.top, 4)

                    // Sectioned conversation list (skeleton -> content -> empty)
                    if conversationViewModel.isLoading && conversationViewModel.filteredConversations.isEmpty {
                        LazyVStack(spacing: 8) {
                            ForEach(0..<8, id: \.self) { index in
                                SkeletonConversationRow()
                                    .staggeredAppear(index: index, baseDelay: 0.04)
                            }
                        }
                        .padding(.horizontal, 16)
                        .transition(.opacity)
                    } else if conversationViewModel.filteredConversations.isEmpty {
                        EmptyStateView(
                            icon: "bubble.left.and.bubble.right",
                            title: String(localized: "conversations.empty.title", defaultValue: "Aucune conversation"),
                            subtitle: String(localized: "conversations.empty.subtitle", defaultValue: "Commencez a discuter avec vos amis ou rejoignez une communaute"),
                            actionLabel: String(localized: "conversations.empty.action", defaultValue: "Commencer une discussion"),
                            onAction: {
                                onNewConversation?()
                            }
                        )
                        .padding(.top, 60)
                        .transition(.opacity)
                    } else {
                        sectionsContent
                            .transition(.opacity)
                    }

                    // Loading more indicator
                    if conversationViewModel.isLoadingMore {
                        HStack {
                            Spacer()
                            ProgressView()
                                .tint(MeeshyColors.indigo400)
                            Spacer()
                        }
                        .padding(.vertical, 16)
                    }

                    Color.clear.frame(height: 280)
                        .onChange(of: draggingConversation) { oldValue, newValue in
                            if oldValue != nil && newValue == nil {
                                withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) {
                                    dropTargetSection = nil
                                }
                            }
                        }
                }
                .padding(.top, 8)
                .padding(.bottom, 120)
            }
            .coordinateSpace(name: "scroll")
            .onPreferenceChange(ScrollOffsetPreferenceKey.self) { offset in
                headerScrollOffset = offset
                guard !isSearching, !showSearchOverlay else { return }
                let scrollingDown = offset < -30
                if scrollingDown != isScrollingDown {
                    // Throttle direction changes to avoid rapid toggling during bounce/overscroll
                    let now = Date()
                    guard now.timeIntervalSince(lastScrollDirectionChange) > 0.15 else { return }
                    lastScrollDirectionChange = now
                    isScrollingDown = scrollingDown
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable {
                HapticFeedback.medium()
                async let convRefresh: Void = conversationViewModel.forceRefresh()
                async let storyRefresh: Void = storyViewModel.loadStories()
                async let statusRefresh: Void = statusViewModel.refresh()
                _ = await (convRefresh, storyRefresh, statusRefresh)

                if isScrollingDown {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        isScrollingDown = false
                    }
                }
            }

            // Layer 2: Bottom overlay — Search bar + Communities & Filters
            VStack(spacing: 0) {
                Spacer()

                // Communities carousel - only when search overlay is open (loupe tap)
                if showSearchOverlay {
                    communitiesSection
                        .padding(.vertical, 10)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }

                // Category filters - only when search overlay is open (loupe tap)
                if showSearchOverlay {
                    categoryFilters
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }

                // Search bar - always visible (unless scrolled away)
                themedSearchBar
            }
            .padding(.bottom, 8)
            // Hide on scroll down
            .offset(y: isScrollingDown ? 150 : 0)
            .opacity(isScrollingDown ? 0 : 1)
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: isScrollingDown)
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: showSearchOverlay)
        }
        // Layer 3: Collapsible header overlay — pinned to top, respects safe area
        .overlay(alignment: .top) {
            CollapsibleHeader(
                title: "Meeshy",
                scrollOffset: headerScrollOffset,
                showBackButton: false,
                titleColor: theme.textPrimary,
                backArrowColor: MeeshyColors.indigo500,
                backgroundColor: theme.backgroundPrimary,
                leading: {
                    if let iPadFeedAction {
                        Button {
                            HapticFeedback.light()
                            iPadFeedAction()
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "square.stack.fill")
                                    .font(.system(size: 13, weight: .semibold))
                                Text("Feed")
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundStyle(
                                LinearGradient(colors: [MeeshyColors.indigo500, MeeshyColors.indigo700], startPoint: .leading, endPoint: .trailing)
                            )
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(
                                Capsule()
                                    .fill(MeeshyColors.indigo100.opacity(theme.mode.isDark ? 0.15 : 1))
                            )
                        }
                    }
                },
                titleView: {
                    Text("Meeshy")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundStyle(
                            LinearGradient(colors: [MeeshyColors.indigo500, MeeshyColors.indigo700], startPoint: .leading, endPoint: .trailing)
                        )
                },
                trailing: {
                    HStack(spacing: 12) {
                        Button {
                            showShareLinkSheet = true
                        } label: {
                            Image(systemName: "link.badge.plus")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(MeeshyColors.indigo500)
                        }
                        .accessibilityLabel("Creer un lien de partage")

                        Button {
                            onNewConversation?()
                        } label: {
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundColor(MeeshyColors.indigo500)
                        }
                        .accessibilityLabel("Nouvelle conversation")

                        if let onNotificationsTap {
                            Button {
                                HapticFeedback.light()
                                onNotificationsTap()
                            } label: {
                                ZStack(alignment: .topTrailing) {
                                    Image(systemName: "bell.fill")
                                        .font(.system(size: 18, weight: .semibold))
                                        .foregroundColor(MeeshyColors.indigo500)

                                    if iPadNotificationCount > 0 {
                                        Text("\(min(iPadNotificationCount, 99))")
                                            .font(.system(size: 9, weight: .bold))
                                            .foregroundColor(.white)
                                            .frame(width: 16, height: 16)
                                            .background(Circle().fill(MeeshyColors.error))
                                            .offset(x: 6, y: -6)
                                    }
                                }
                            }
                            .accessibilityLabel("Notifications")
                        }

                        if let onSettingsTap {
                            Button {
                                HapticFeedback.light()
                                onSettingsTap()
                            } label: {
                                Image(systemName: "gearshape.fill")
                                    .font(.system(size: 18, weight: .semibold))
                                    .foregroundColor(MeeshyColors.indigo500)
                            }
                            .accessibilityLabel("Reglages")
                        }
                    }
                }
            )
        }
        .sheet(isPresented: $showShareLinkSheet) {
            ShareLinkPickerSheet(
                conversations: conversationViewModel.conversations.filter { canCreateShareLink(for: $0) },
                onSelect: { conversation in
                    showShareLinkSheet = false
                    inviteSheetConversation = conversation
                }
            )
        }
    }

    // MARK: - Handle Story View
    private func handleStoryView(_ conversation: Conversation) {
        guard conversation.type == .direct else { return }

        if let userId = conversation.participantUserId,
           storyViewModel.groupIndex(forUserId: userId) != nil {
            onStoryViewRequest?(userId, false)
            return
        }

        if let group = storyViewModel.storyGroups.first(where: { $0.username == conversation.name }) {
            onStoryViewRequest?(group.id, false)
            return
        }
    }

    // MARK: - Handle Profile View
    private func handleProfileView(_ conversation: Conversation) {
        // Open user profile sheet (works for DM, uses participant data)
        selectedProfileUser = .from(conversation: conversation)
    }

    // MARK: - Handle Conversation Info View
    private func handleConversationInfoView(_ conversation: Conversation) {
        // Open conversation info sheet (works for all conversation types)
        conversationInfoConversation = conversation
    }

    // MARK: - Handle Mood Badge Tap (opens status bubble)
    private func handleMoodBadgeTap(_ conversation: Conversation, at anchor: CGPoint) {
        guard conversation.type == .direct,
              let userId = conversation.participantUserId,
              let status = statusViewModel.statusForUser(userId: userId) else { return }
        StatusBubbleController.shared.show(entry: status, anchor: anchor)
    }

    // See ConversationListView+Overlays.swift for conversationContextMenu

    // MARK: - Handle Drop
    private func handleDrop(to sectionId: String, providers: [NSItemProvider]) -> Bool {
        guard sectionId != "pinned" else { return false }
        guard let dragging = draggingConversation else { return false }

        conversationViewModel.moveToSection(conversationId: dragging.id, sectionId: sectionId)
        HapticFeedback.success()

        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            draggingConversation = nil
            dropTargetSection = nil
        }

        return true
    }

    // MARK: - Load Communities
    private func loadUserCommunities() async {
        do {
            let response = try await CommunityService.shared.list(offset: 0, limit: 10)
            userCommunities = response.data.map { $0.toCommunity() }
            userCommunityLookup = Dictionary(uniqueKeysWithValues: userCommunities.map { ($0.id, $0) })
        } catch {
            Logger.messages.error("[ConversationListView] Error loading communities: \(error.localizedDescription)")
        }
    }

    // See ConversationListView+Overlays.swift for communitiesSection, categoryFilters, themedSearchBar
}

// See ThemedConversationRow.swift
// See ConversationListHelpers.swift (SectionHeaderView, ConversationPreviewView, ThemedCommunityCard, ThemedFilterChip, TagChip, legacy wrappers)

// MARK: - Share Link Picker Sheet

struct ShareLinkPickerSheet: View {
    let conversations: [Conversation]
    let onSelect: (Conversation) -> Void
    @Environment(\.dismiss) private var dismiss

    private var theme: ThemeManager { .shared }

    var body: some View {
        NavigationStack {
            Group {
                if conversations.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "link.badge.plus")
                            .font(.system(size: 48))
                            .foregroundStyle(MeeshyColors.indigo300)
                        Text("Aucune conversation eligible")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(conversations) { conversation in
                        Button {
                            onSelect(conversation)
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: conversation.type == .group ? "person.3.fill" : "globe")
                                    .font(.system(size: 16))
                                    .foregroundColor(MeeshyColors.indigo500)
                                    .frame(width: 32, height: 32)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(conversation.name)
                                        .font(.system(size: 16, weight: .medium))
                                        .foregroundColor(theme.textPrimary)
                                        .lineLimit(1)

                                    Text(conversation.type.rawValue.capitalized)
                                        .font(.system(size: 13))
                                        .foregroundColor(theme.textSecondary)
                                }

                                Spacer()

                                Image(systemName: "link")
                                    .font(.system(size: 14))
                                    .foregroundColor(MeeshyColors.indigo400)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Creer un lien de partage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
