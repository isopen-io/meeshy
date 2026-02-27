import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Scroll Offset Preference Key
struct ScrollOffsetPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

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
    var onStoryViewRequest: ((Int, Bool) -> Void)? = nil  // (groupIndex, fromTray)

    @ObservedObject var theme = ThemeManager.shared
    @ObservedObject var socketManager = MessageSocketManager.shared
    @EnvironmentObject var storyViewModel: StoryViewModel
    @EnvironmentObject var statusViewModel: StatusViewModel
    @EnvironmentObject var conversationViewModel: ConversationListViewModel
    @EnvironmentObject var router: Router

    // Status bubble overlay state
    @State private var showStatusBubble = false
    @State private var selectedStatusEntry: StatusEntry?
    @State private var moodBadgeAnchor: CGPoint = .zero
    @FocusState var isSearching: Bool
    @State var showSearchOverlay: Bool = false
    @State var searchBounce: Bool = false
    @State private var animateGradient = false
    @State var showGlobalSearch = false

    // Scroll tracking
    @State private var lastScrollOffset: CGFloat? = nil
    @State private var hideSearchBar = false
    @State private var isPullingToRefresh = false  // Track pull-to-refresh gesture
    @State private var selectedProfileUser: ProfileSheetUser? = nil
    @State var conversationInfoConversation: Conversation? = nil
    private let scrollThreshold: CGFloat = 15
    private let pullToShowThreshold: CGFloat = 60  // How much to pull down to show search bar

    // Section expansion state (pinned + other always expanded, user categories added dynamically)
    @State private var expandedSections: Set<String> = ["pinned", "other"]

    // Preview state for hard press
    @State private var previewConversation: Conversation? = nil

    // Drag & Drop state
    @State private var draggingConversation: Conversation? = nil
    @State private var dropTargetSection: String? = nil

    // Lock & Block state
    @State var lockSheetConversation: Conversation? = nil
    @State var lockSheetMode: ConversationLockSheet.Mode = .setPassword
    @State var showBlockConfirmation = false
    @State var blockTargetConversation: Conversation? = nil

    // Widget preview state
    @State var showWidgetPreview = false

    // Communities data (replaces SampleData)
    @State var userCommunities: [MeeshyCommunity] = []

    // Alternative init without binding for backward compatibility
    init(isScrollingDown: Binding<Bool>? = nil, feedIsVisible: Binding<Bool>? = nil, onSelect: @escaping (Conversation) -> Void, onStoryViewRequest: ((Int, Bool) -> Void)? = nil) {
        self._isScrollingDown = isScrollingDown ?? .constant(false)
        self._feedIsVisible = feedIsVisible ?? .constant(false)
        self.onSelect = onSelect
        self.onStoryViewRequest = onStoryViewRequest
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
        ForEach(Array(conversations.enumerated()), id: \.element.id) { index, conversation in
            conversationRow(for: conversation)
                .staggeredAppear(index: index, baseDelay: 0.04)
                .onAppear {
                    triggerLoadMoreIfNeeded(conversation: conversation)
                }
        }
    }

    @ViewBuilder
    private func conversationRow(for conversation: Conversation) -> some View {
        let rowWidth = UIScreen.main.bounds.width - 32 - 52 - 28 - 24
        SwipeableRow(
            leadingActions: leadingSwipeActions(for: conversation),
            trailingActions: trailingSwipeActions(for: conversation)
        ) {
            ThemedConversationRow(
                conversation: conversation,
                availableWidth: rowWidth,
                isDragging: draggingConversation?.id == conversation.id,
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
                }
            )
            .contentShape(Rectangle())
            .onTapGesture {
                HapticFeedback.light()
                if ConversationLockManager.shared.isLocked(conversation.id) {
                    lockSheetMode = .verifyPassword
                    lockSheetConversation = conversation
                } else {
                    onSelect(conversation)
                }
            }
            .onDrag {
                draggingConversation = conversation
                HapticFeedback.medium()
                return NSItemProvider(object: conversation.id as NSString)
            }
            .contextMenu {
                conversationContextMenu(for: conversation)
            } preview: {
                ConversationPreviewView(conversation: conversation)
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
            let request = CreateShareLinkRequest(
                conversationId: conversation.id,
                name: conversation.name,
                allowAnonymousMessages: true
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
        let lockManager = ConversationLockManager.shared
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
                    lockSheetMode = .removePassword
                    lockSheetConversation = conversation
                } else if lockManager.hasMasterPin() {
                    lockSheetMode = .setPassword
                    lockSheetConversation = conversation
                } else {
                    lockSheetMode = .setPassword
                    lockSheetConversation = conversation
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
                color: MeeshyColors.orange
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
            icon: "trash.fill",
            label: String(localized: "swipe.delete", defaultValue: "Supprimer"),
            color: Color(hex: "EF4444")
        ) {
            Task { await conversationViewModel.deleteConversation(conversationId: conversation.id) }
        })

        return actions
    }

    private func triggerLoadMoreIfNeeded(conversation: Conversation) {
        let all = conversationViewModel.conversations
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
    }

    private var mainContent: some View {
        ZStack(alignment: .bottom) {
            // Main scroll content with gesture detection
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    // Top spacer
                    Color.clear.frame(height: 70)

                    // Story carousel
                    StoryTrayView(viewModel: storyViewModel) { groupIndex in
                        onStoryViewRequest?(groupIndex, true)  // fromTray = true -> all groups
                    }

                    // Connection status banner
                    ConnectionBanner()
                        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: socketManager.isConnected)
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
                                NotificationCenter.default.post(
                                    name: Notification.Name("navigateToNewConversation"),
                                    object: nil
                                )
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
                                .tint(MeeshyColors.cyan)
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
                // Background view to track scroll changes cleanly without fighting ScrollView gestures
                .background(
                    GeometryReader { proxy in
                        Color.clear.onChange(of: proxy.frame(in: .named("scroll")).minY) { oldVal, newVal in
                            let delta = newVal - oldVal
                            // The delta is calculated per frame (e.g. 1/60th or 1/120th of a sec)
                            // Therefore, values strictly > 2 or < -2 are ample to detect user intent avoiding jitters.
                            
                            // Prevent hiding when bouncing at the top (pull-to-refresh snap back)
                            if delta < -2 && !hideSearchBar && newVal < -20 {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                    hideSearchBar = true
                                    isScrollingDown = true
                                }
                            } else if (delta > 4 || newVal > -5) && hideSearchBar {
                                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                    hideSearchBar = false
                                    isScrollingDown = false
                                }
                            }
                        }
                    }
                )
            }
            .coordinateSpace(name: "scroll")
            .refreshable {
                HapticFeedback.medium()
                await conversationViewModel.forceRefresh()
                
                // Show the search bar seamlessly after reloading finishes
                if hideSearchBar {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        hideSearchBar = false
                        isScrollingDown = false
                    }
                }
            }

            // Bottom overlay: Search bar (always) + Communities & Filters (when loupe tapped)
            VStack(spacing: 0) {
                Spacer()

                // Communities carousel - only when search overlay is open (loupe tap)
                if showSearchOverlay {
                    communitiesSection
                        .padding(.vertical, 10)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                // Category filters - only when search overlay is open (loupe tap)
                if showSearchOverlay {
                    categoryFilters
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                // Search bar - always visible (unless scrolled away)
                themedSearchBar
            }
            .padding(.bottom, 8)
            // Hide on scroll down
            .offset(y: hideSearchBar ? 150 : 0)
            .opacity(hideSearchBar ? 0 : 1)
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: hideSearchBar)
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: showSearchOverlay)
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: conversationViewModel.selectedFilter)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: expandedSections)
        .onChange(of: hideSearchBar) { wasHidden, isHidden in
            isScrollingDown = isHidden
            if !wasHidden && isHidden {
                showSearchOverlay = false
            }
        }
        // Show search bar when returning to this view
        .onAppear {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                hideSearchBar = false
                isScrollingDown = false
            }
        }
        .task {
            await conversationViewModel.loadConversations()
            await loadUserCommunities()
        }
        .onChange(of: conversationViewModel.userCategories) { _, categories in
            for cat in categories where cat.isExpanded {
                expandedSections.insert(cat.id)
            }
        }
        // Show search bar when filtered list is empty
        .onChange(of: conversationViewModel.filteredConversations.isEmpty) { _, isEmpty in
            if isEmpty && hideSearchBar {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    hideSearchBar = false
                    isScrollingDown = false
                }
            }
        }
        // Show search bar when category changes
        .onChange(of: conversationViewModel.selectedFilter) { _, _ in
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                hideSearchBar = false
                isScrollingDown = false
            }
        }
        // Show search bar when Feed is closed (user comes back from Feed)
        .onChange(of: feedIsVisible) { wasVisible, isVisible in
            if wasVisible && !isVisible {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    hideSearchBar = false
                    isScrollingDown = false
                }
            }
        }
        .overlay {
            // Status bubble overlay
            if showStatusBubble, let status = selectedStatusEntry {
                StatusBubbleOverlay(
                    status: status,
                    anchorPoint: moodBadgeAnchor,
                    isPresented: $showStatusBubble,
                    onReply: {
                        // Find conversation for this user and navigate
                        if let conv = conversationViewModel.conversations.first(where: { $0.participantUserId == status.userId && $0.type == .direct }) {
                            onSelect(conv)
                        }
                    },
                    onShare: {
                        // Find conversation for this user and navigate (share context)
                        if let conv = conversationViewModel.conversations.first(where: { $0.participantUserId == status.userId && $0.type == .direct }) {
                            onSelect(conv)
                        }
                    },
                    onReaction: { emoji in
                        // Fire & forget reaction to status
                        Task {
                            let _: APIResponse<[String: AnyCodable]>? = try? await APIClient.shared.post(
                                endpoint: "/posts/\(status.id)/like",
                                body: ["emoji": emoji]
                            )
                        }
                    }
                )
                .zIndex(200)
            }
        }
        .sheet(item: $lockSheetConversation) { conversation in
            ConversationLockSheet(
                mode: lockSheetMode,
                conversationId: conversation.id,
                conversationName: conversation.name,
                onSuccess: {
                    if lockSheetMode == .verifyPassword {
                        onSelect(conversation)
                    }
                }
            )
            .environmentObject(theme)
        }
        .sheet(isPresented: $showWidgetPreview) {
            WidgetPreviewView()
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

    // MARK: - Handle Story View
    private func handleStoryView(_ conversation: Conversation) {
        guard conversation.type == .direct else { return }

        if let userId = conversation.participantUserId,
           let groupIndex = storyViewModel.groupIndex(forUserId: userId) {
            onStoryViewRequest?(groupIndex, false)
            return
        }

        if let groupIndex = storyViewModel.storyGroups.firstIndex(where: { $0.username == conversation.name }) {
            onStoryViewRequest?(groupIndex, false)
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
        selectedStatusEntry = status
        moodBadgeAnchor = anchor
        showStatusBubble = true
    }

    // See ConversationListView+Overlays.swift for conversationContextMenu

    // MARK: - Handle Scroll Change
    private func handleScrollChange(_ offset: CGFloat) {
        // Obsolete (geometric proxy removed)
    }

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
        } catch {
            print("[ConversationListView] Error loading communities: \(error)")
        }
    }

    // See ConversationListView+Overlays.swift for communitiesSection, categoryFilters, themedSearchBar
}

// See ThemedConversationRow.swift
// See ConversationListHelpers.swift (SectionHeaderView, ConversationPreviewView, ThemedCommunityCard, ThemedFilterChip, TagChip, legacy wrappers)
