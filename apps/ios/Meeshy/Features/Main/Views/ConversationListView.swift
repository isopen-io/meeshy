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
    @State var searchText = ""
    @State var selectedFilter: ConversationFilter = .all
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

    // Alternative init without binding for backward compatibility
    init(isScrollingDown: Binding<Bool>? = nil, feedIsVisible: Binding<Bool>? = nil, onSelect: @escaping (Conversation) -> Void, onStoryViewRequest: ((Int, Bool) -> Void)? = nil) {
        self._isScrollingDown = isScrollingDown ?? .constant(false)
        self._feedIsVisible = feedIsVisible ?? .constant(false)
        self.onSelect = onSelect
        self.onStoryViewRequest = onStoryViewRequest
    }

    private var filtered: [Conversation] {
        conversationViewModel.conversations.filter { c in
            let filterMatch: Bool
            switch selectedFilter {
            case .all: filterMatch = c.isActive
            case .unread: filterMatch = c.unreadCount > 0
            case .personnel: filterMatch = c.type == .direct && c.isActive
            case .privee: filterMatch = c.type == .group && c.isActive
            case .ouvertes: filterMatch = (c.type == .public || c.type == .community) && c.isActive
            case .globales: filterMatch = c.type == .global && c.isActive
            case .channels: filterMatch = c.isAnnouncementChannel && c.isActive
            case .archived: filterMatch = !c.isActive
            }
            let searchMatch = searchText.isEmpty || c.name.localizedCaseInsensitiveContains(searchText)
            return filterMatch && searchMatch
        }
    }

    // Group conversations by section (user categories from backend + pinned + uncategorized)
    private var groupedConversations: [(section: ConversationSection, conversations: [Conversation])] {
        var result: [(section: ConversationSection, conversations: [Conversation])] = []

        // First: Pinned section (conversations pinned without a category)
        let pinnedOnly = filtered.filter { $0.isPinned && $0.sectionId == nil }
        if !pinnedOnly.isEmpty {
            result.append((ConversationSection.pinned, pinnedOnly.sorted { $0.lastMessageAt > $1.lastMessageAt }))
        }

        // Then: User categories from backend (dynamic)
        let categories = conversationViewModel.userCategories
        let categoryIds = Set(categories.map(\.id))
        for category in categories {
            let sectionConvs = filtered.filter { $0.sectionId == category.id }
            if !sectionConvs.isEmpty {
                let sorted = sectionConvs.sorted { a, b in
                    if a.isPinned != b.isPinned { return a.isPinned }
                    return a.lastMessageAt > b.lastMessageAt
                }
                result.append((category, sorted))
            }
        }

        // Conversations with unknown sectionId (category deleted or not yet synced)
        let orphaned = filtered.filter { conv in
            guard let sid = conv.sectionId else { return false }
            return !categoryIds.contains(sid) && !(conv.isPinned && conv.sectionId == nil)
        }

        // Finally: Uncategorized ("Mes conversations") — no sectionId + not pinned, plus orphaned
        let uncategorized = filtered.filter { $0.sectionId == nil && !$0.isPinned }
        let allUncategorized = uncategorized + orphaned
        if !allUncategorized.isEmpty {
            result.append((ConversationSection.other, allUncategorized.sorted { $0.lastMessageAt > $1.lastMessageAt }))
        }

        return result
    }

    // MARK: - Sections Content (extracted for compiler)
    @ViewBuilder
    private var sectionsContent: some View {
        LazyVStack(spacing: 8) {
            ForEach(groupedConversations, id: \.section.id) { group in
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
                onMoodBadgeTap: { anchor in
                    handleMoodBadgeTap(conversation, at: anchor)
                }
            )
            .contentShape(Rectangle())
            .onTapGesture {
                HapticFeedback.light()
                isSearching = false
                if ConversationLockManager.shared.isLocked(conversation.id) {
                    lockSheetMode = .verifyPassword
                    lockSheetConversation = conversation
                } else {
                    onSelect(conversation)
                }
            }
            .contextMenu {
                conversationContextMenu(for: conversation)
            } preview: {
                ConversationPreviewView(conversation: conversation)
            }
            .onDrag {
                draggingConversation = conversation
                HapticFeedback.medium()
                return NSItemProvider(object: conversation.id as NSString)
            }
        }
    }

    // MARK: - Swipe Actions

    private func leadingSwipeActions(for conversation: Conversation) -> [SwipeAction] {
        [
            SwipeAction(
                icon: conversation.isPinned ? "pin.slash.fill" : "pin.fill",
                label: conversation.isPinned ? "Désépingler" : "Épingler",
                color: Color(hex: "3B82F6")
            ) {
                Task { await conversationViewModel.togglePin(for: conversation.id) }
            },
            SwipeAction(
                icon: conversation.isMuted ? "bell.fill" : "bell.slash.fill",
                label: conversation.isMuted ? "Son" : "Silence",
                color: Color(hex: "6B7280")
            ) {
                Task { await conversationViewModel.toggleMute(for: conversation.id) }
            }
        ]
    }

    private func trailingSwipeActions(for conversation: Conversation) -> [SwipeAction] {
        [
            SwipeAction(
                icon: "archivebox.fill",
                label: "Archiver",
                color: MeeshyColors.orange
            ) {
                Task { await conversationViewModel.archiveConversation(conversationId: conversation.id) }
            },
            SwipeAction(
                icon: "trash.fill",
                label: "Supprimer",
                color: Color(hex: "EF4444")
            ) {
                Task { await conversationViewModel.deleteConversation(conversationId: conversation.id) }
            }
        ]
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
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            // Main scroll content with gesture detection
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    // Scroll position tracker
                    GeometryReader { geo in
                        let offset = geo.frame(in: .named("scroll")).minY
                        Color.clear
                            .onChange(of: offset) { newOffset in
                                handleScrollChange(newOffset)
                            }
                    }
                    .frame(height: 0)

                    // Top spacer
                    Color.clear.frame(height: 70)

                    // Story carousel
                    StoryTrayView(viewModel: storyViewModel) { groupIndex in
                        onStoryViewRequest?(groupIndex, true)  // fromTray = true → all groups
                    }

                    // Connection status banner
                    ConnectionBanner()
                        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: socketManager.isConnected)
                        .padding(.top, 4)

                    // Sectioned conversation list (skeleton → content → empty)
                    if conversationViewModel.isLoading && filtered.isEmpty {
                        LazyVStack(spacing: 8) {
                            ForEach(0..<8, id: \.self) { index in
                                SkeletonConversationRow()
                                    .staggeredAppear(index: index, baseDelay: 0.04)
                            }
                        }
                        .padding(.horizontal, 16)
                        .transition(.opacity)
                    } else if filtered.isEmpty {
                        EmptyStateView(
                            icon: "bubble.left.and.bubble.right",
                            title: "Aucune conversation",
                            subtitle: "Commencez a discuter avec vos amis ou rejoignez une communaute",
                            actionTitle: "Commencer une discussion"
                        ) {
                            NotificationCenter.default.post(
                                name: Notification.Name("navigateToNewConversation"),
                                object: nil
                            )
                        }
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
                        .onChange(of: draggingConversation) { newValue in
                            if newValue == nil {
                                withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) {
                                    dropTargetSection = nil
                                }
                            }
                        }
                }
            }
            .coordinateSpace(name: "scroll")
            .refreshable {
                HapticFeedback.medium()
                await conversationViewModel.forceRefresh()
            }
            // Gesture for scroll detection with velocity
            .simultaneousGesture(
                DragGesture(minimumDistance: 8)
                    .onChanged { value in
                        let verticalMovement = value.translation.height
                        // Scrolling down (finger moving up) = hide immediately
                        if verticalMovement < -20 && !hideSearchBar {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                hideSearchBar = true
                                isScrollingDown = true
                            }
                        }
                        // Scrolling up (finger moving down) = show if moved enough
                        // This makes the search bar appear with any noticeable upward scroll
                        if verticalMovement > 40 && hideSearchBar {
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                hideSearchBar = false
                                isScrollingDown = false
                            }
                            HapticFeedback.light()
                        }
                    }
                    .onEnded { value in
                        // Calculate velocity (points per second)
                        let velocity = value.predictedEndLocation.y - value.location.y
                        let isScrollingUp = velocity > 0
                        let hasMinimalVelocity = abs(velocity) > 30 // Much lower threshold for sensitivity

                        // Show on any scroll UP with minimal velocity
                        if isScrollingUp && hasMinimalVelocity && hideSearchBar {
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                hideSearchBar = false
                                isScrollingDown = false
                            }
                            HapticFeedback.light()
                        }
                    }
            )

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
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: selectedFilter)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: expandedSections)
        .onChange(of: hideSearchBar) { newValue in
            isScrollingDown = newValue
            // Dismiss keyboard and overlay when hiding search bar
            if newValue {
                isSearching = false
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
        }
        .onChange(of: conversationViewModel.userCategories) { categories in
            for cat in categories where cat.isExpanded {
                expandedSections.insert(cat.id)
            }
        }
        // Show search bar when filtered list is empty
        .onChange(of: filtered.isEmpty) { isEmpty in
            if isEmpty && hideSearchBar {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    hideSearchBar = false
                    isScrollingDown = false
                }
            }
        }
        // Show search bar when category changes
        .onChange(of: selectedFilter) { _ in
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                hideSearchBar = false
                isScrollingDown = false
            }
        }
        // Show search bar when Feed is closed (user comes back from Feed)
        .onChange(of: feedIsVisible) { isVisible in
            if !isVisible {
                // Feed just closed, show search bar
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
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(user: user)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
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
        .fullScreenCover(isPresented: $showGlobalSearch) {
            GlobalSearchView()
                .environmentObject(conversationViewModel)
                .environmentObject(router)
        }
        .confirmationDialog(
            "Bloquer cet utilisateur ?",
            isPresented: $showBlockConfirmation,
            titleVisibility: .visible
        ) {
            Button("Bloquer", role: .destructive) {
                guard let conv = blockTargetConversation,
                      let targetUserId = conv.participantUserId else { return }
                Task {
                    try? await BlockService.shared.blockUser(userId: targetUserId)
                    HapticFeedback.success()
                }
            }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Cette personne ne pourra plus vous envoyer de messages dans cette conversation.")
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
        selectedProfileUser = .from(conversation: conversation)
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
        // Initialize on first call
        guard let last = lastScrollOffset else {
            lastScrollOffset = offset
            return
        }

        let delta = offset - last

        // Pull-to-refresh detection: offset > threshold means user pulled past the top
        // This happens when the content is at the top and user pulls down
        if offset > pullToShowThreshold && hideSearchBar {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                hideSearchBar = false
                isScrollingDown = false
            }
            HapticFeedback.light()
        }

        // Scrolling down (negative delta) = hide
        // No velocity check needed for hiding - hide immediately
        // But only hide if we're not in pull-to-refresh zone
        if delta < -scrollThreshold && !hideSearchBar && offset < 0 {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                hideSearchBar = true
                isScrollingDown = true
            }
        }
        // Note: Showing is handled by DragGesture with velocity check

        lastScrollOffset = offset
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

    // See ConversationListView+Overlays.swift for communitiesSection, categoryFilters, themedSearchBar
}

// See ThemedConversationRow.swift
// See ConversationListHelpers.swift (SectionHeaderView, ConversationPreviewView, ThemedCommunityCard, ThemedFilterChip, TagChip, legacy wrappers)
