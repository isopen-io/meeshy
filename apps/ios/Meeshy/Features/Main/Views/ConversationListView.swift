import SwiftUI
import MeeshySDK

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

    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject var storyViewModel: StoryViewModel
    @EnvironmentObject var statusViewModel: StatusViewModel
    @EnvironmentObject var conversationViewModel: ConversationListViewModel

    // Status bubble overlay state
    @State private var showStatusBubble = false
    @State private var selectedStatusEntry: StatusEntry?
    @State private var moodBadgeAnchor: CGPoint = .zero
    @State private var searchText = ""
    @State private var selectedCategory: ConversationCategory = .all
    @FocusState private var isSearching: Bool
    @State private var searchBounce: Bool = false
    @State private var animateGradient = false

    // Scroll tracking
    @State private var lastScrollOffset: CGFloat? = nil
    @State private var hideSearchBar = false
    @State private var isPullingToRefresh = false  // Track pull-to-refresh gesture
    @State private var profileAlertName: String? = nil
    private let scrollThreshold: CGFloat = 15
    private let pullToShowThreshold: CGFloat = 60  // How much to pull down to show search bar

    // Section expansion state
    @State private var expandedSections: Set<String> = Set(ConversationSection.allSections.map { $0.id })

    // Preview state for hard press
    @State private var previewConversation: Conversation? = nil

    // Drag & Drop state
    @State private var draggingConversation: Conversation? = nil
    @State private var dropTargetSection: String? = nil

    // Alternative init without binding for backward compatibility
    init(isScrollingDown: Binding<Bool>? = nil, feedIsVisible: Binding<Bool>? = nil, onSelect: @escaping (Conversation) -> Void, onStoryViewRequest: ((Int, Bool) -> Void)? = nil) {
        self._isScrollingDown = isScrollingDown ?? .constant(false)
        self._feedIsVisible = feedIsVisible ?? .constant(false)
        self.onSelect = onSelect
        self.onStoryViewRequest = onStoryViewRequest
    }

    private var filtered: [Conversation] {
        conversationViewModel.conversations.filter { c in
            let categoryMatch: Bool
            switch selectedCategory {
            case .all: categoryMatch = c.isActive
            case .unread: categoryMatch = c.unreadCount > 0
            case .personnel: categoryMatch = c.type == .direct && c.isActive
            case .privee: categoryMatch = c.type == .group && c.isActive
            case .ouvertes: categoryMatch = (c.type == .public || c.type == .community || c.type == .channel) && c.isActive
            case .archived: categoryMatch = !c.isActive
            }
            let searchMatch = searchText.isEmpty || c.name.localizedCaseInsensitiveContains(searchText)
            return categoryMatch && searchMatch
        }
    }

    // Group conversations by section
    private var groupedConversations: [(section: ConversationSection, conversations: [Conversation])] {
        var result: [(section: ConversationSection, conversations: [Conversation])] = []

        // First: Pinned section (conversations pinned without a section)
        let pinnedOnly = filtered.filter { $0.isPinned && $0.sectionId == nil }
        if !pinnedOnly.isEmpty {
            result.append((ConversationSection.pinned, pinnedOnly.sorted { $0.lastMessageAt > $1.lastMessageAt }))
        }

        // Then: Other sections with their conversations
        for section in ConversationSection.allSections where section.id != "pinned" {
            let sectionConvs = filtered.filter { $0.sectionId == section.id }
            if !sectionConvs.isEmpty {
                // Sort: pinned first, then by date
                let sorted = sectionConvs.sorted { a, b in
                    if a.isPinned != b.isPinned { return a.isPinned }
                    return a.lastMessageAt > b.lastMessageAt
                }
                result.append((section, sorted))
            }
        }

        // Finally: Uncategorized ("Autres")
        let uncategorized = filtered.filter { $0.sectionId == nil && !$0.isPinned }
        if !uncategorized.isEmpty {
            result.append((ConversationSection.other, uncategorized.sorted { $0.lastMessageAt > $1.lastMessageAt }))
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
        }
    }

    @ViewBuilder
    private func conversationRow(for conversation: Conversation) -> some View {
        let rowWidth = UIScreen.main.bounds.width - 32 - 52 - 28 - 24
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
            onSelect(conversation)
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

                    // Sectioned conversation list
                    sectionsContent
                        .padding(.bottom, 280)
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

            // Bottom overlay: Search bar (always) + Communities & Filters (when focused)
            VStack(spacing: 0) {
                Spacer()

                // Communities carousel - only when searching
                if isSearching {
                    communitiesSection
                        .padding(.vertical, 10)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                // Category filters - only when searching
                if isSearching {
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
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: isSearching)
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: selectedCategory)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: expandedSections)
        .onChange(of: hideSearchBar) { newValue in
            isScrollingDown = newValue
            // Dismiss keyboard when hiding search bar
            if newValue {
                isSearching = false
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
        .onChange(of: selectedCategory) { _ in
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
        .alert("Navigation", isPresented: Binding(
            get: { profileAlertName != nil },
            set: { if !$0 { profileAlertName = nil } }
        )) {
            Button("OK") { profileAlertName = nil }
        } message: {
            Text("Naviguer vers le profil de \(profileAlertName ?? "")")
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
        profileAlertName = conversation.name
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

    // MARK: - Context Menu
    @ViewBuilder
    private func conversationContextMenu(for conversation: Conversation) -> some View {
        // Pin/Unpin
        Button {
            HapticFeedback.medium()
            Task { await conversationViewModel.togglePin(for: conversation.id) }
        } label: {
            Label(conversation.isPinned ? "Désépingler" : "Épingler", systemImage: conversation.isPinned ? "pin.slash.fill" : "pin.fill")
        }

        // Mute/Unmute
        Button {
            HapticFeedback.light()
            Task { await conversationViewModel.toggleMute(for: conversation.id) }
        } label: {
            Label(conversation.isMuted ? "Réactiver les notifications" : "Mettre en silence", systemImage: conversation.isMuted ? "bell.fill" : "bell.slash.fill")
        }

        // Lock/Unlock
        // BACKEND_NEEDED: No lock/unlock endpoint exists. Requires a new conversation
        // preference field (isLocked) and biometric/PIN verification on the client.
        Button {
            HapticFeedback.medium()
        } label: {
            Label("Verrouiller", systemImage: "lock.fill")
        }

        Divider()

        // Mark as read/unread
        if conversation.unreadCount > 0 {
            Button {
                HapticFeedback.light()
                Task { await conversationViewModel.markAsRead(conversationId: conversation.id) }
            } label: {
                Label("Marquer comme lu", systemImage: "envelope.open.fill")
            }
        } else {
            Button {
                HapticFeedback.light()
                Task { await conversationViewModel.markAsUnread(conversationId: conversation.id) }
            } label: {
                Label("Marquer comme non lu", systemImage: "envelope.badge.fill")
            }
        }

        // Add reaction
        // REST endpoints now exist: POST/DELETE /conversations/:id/messages/:messageId/reactions
        // TODO: Wire reaction buttons to call the API (requires knowing the last messageId)
        Menu {
            ForEach(["❤️", "👍", "😂", "😮", "😢", "🔥", "🎉", "💯"], id: \.self) { emoji in
                Button {
                    HapticFeedback.light()
                } label: {
                    Text(emoji)
                }
            }
        } label: {
            Label("Réagir", systemImage: "face.smiling.fill")
        }

        Divider()

        // Move to section
        // BACKEND_NEEDED: Section/category mapping between iOS sectionId and backend
        // categoryId is not yet aligned. Local-only for now.
        Menu {
            ForEach(ConversationSection.allSections.filter { $0.id != "pinned" }) { section in
                Button {
                    HapticFeedback.light()
                    conversationViewModel.moveToSection(conversationId: conversation.id, sectionId: section.id)
                } label: {
                    Label(section.name, systemImage: section.icon)
                }
            }
        } label: {
            Label("Déplacer vers...", systemImage: "folder.fill")
        }

        // Archive
        Button {
            HapticFeedback.medium()
            Task { await conversationViewModel.archiveConversation(conversationId: conversation.id) }
        } label: {
            Label("Archiver", systemImage: "archivebox.fill")
        }

        Divider()

        // Block (destructive style)
        // BACKEND_NEEDED: No block user/conversation endpoint exists yet.
        // Requires a new blocking system with user-level block list.
        Button(role: .destructive) {
            HapticFeedback.heavy()
        } label: {
            Label("Bloquer", systemImage: "hand.raised.fill")
        }

        // Delete (destructive)
        Button(role: .destructive) {
            HapticFeedback.heavy()
            Task { await conversationViewModel.deleteConversation(conversationId: conversation.id) }
        } label: {
            Label("Supprimer", systemImage: "trash.fill")
        }
    }

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

    // MARK: - Communities Section
    private var communitiesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Communautés")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(hex: "FF6B6B"), Color(hex: "4ECDC4")],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                Spacer()

                HStack(spacing: 12) {
                    Button {} label: {
                        Text("Voir tout")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color(hex: "4ECDC4"))
                    }

                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            isSearching = false
                        }
                        HapticFeedback.light()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [Color(hex: "FF6B6B"), Color(hex: "FF6B6B").opacity(0.7)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                    }
                }
            }
            .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(Array(SampleData.communities.enumerated()), id: \.element.id) { index, community in
                        ThemedCommunityCard(community: community)
                            .staggeredAppear(index: index, baseDelay: 0.06)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    // MARK: - Category Filters
    private var categoryFilters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(ConversationCategory.allCases) { category in
                    ThemedFilterChip(
                        title: category.rawValue,
                        color: category.color,
                        isSelected: selectedCategory == category
                    ) {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            selectedCategory = category
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Themed Search Bar
    private var themedSearchBar: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(
                    isSearching ?
                    AnyShapeStyle(LinearGradient(colors: [Color(hex: "FF6B6B"), Color(hex: "4ECDC4")], startPoint: .leading, endPoint: .trailing)) :
                    AnyShapeStyle(theme.textMuted)
                )
                .scaleEffect(isSearching ? 1.15 : 1.0)
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isSearching)

            TextField("Rechercher...", text: $searchText)
                .focused($isSearching)
                .foregroundColor(theme.textPrimary)
                .font(.system(size: 15))

            if !searchText.isEmpty {
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { searchText = "" }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(Color(hex: "FF6B6B"))
                        .scaleEffect(1.0)
                }
                .transition(.scale.combined(with: .opacity))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 22)
                        .stroke(
                            isSearching ?
                            AnyShapeStyle(LinearGradient(colors: [Color(hex: "FF6B6B"), Color(hex: "4ECDC4")], startPoint: .leading, endPoint: .trailing)) :
                            AnyShapeStyle(theme.inputBorder),
                            lineWidth: isSearching ? 2 : 1
                        )
                )
                .shadow(color: isSearching ? Color(hex: "4ECDC4").opacity(0.25) : .clear, radius: 12, y: 5)
        )
        .scaleEffect(searchBounce ? 1.02 : 1.0)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: searchText.isEmpty)
        .onChange(of: isSearching) { newValue in
            withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                searchBounce = newValue
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
    }
}

// MARK: - Section Header View
struct SectionHeaderView: View {
    let section: ConversationSection
    let count: Int
    let isExpanded: Bool
    var isDropTarget: Bool = false
    let onToggle: () -> Void

    @ObservedObject private var theme = ThemeManager.shared
    @State private var isTapped = false

    var body: some View {
        Button(action: {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) {
                isTapped = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                isTapped = false
            }
            onToggle()
        }) {
            HStack(spacing: 10) {
                // Section icon with glow
                ZStack {
                    // Glow ring behind icon
                    Circle()
                        .fill(Color(hex: section.color).opacity(isExpanded ? 0.15 : 0))
                        .frame(width: 40, height: 40)
                        .blur(radius: 4)
                        .animation(.easeInOut(duration: 0.4), value: isExpanded)

                    Circle()
                        .fill(Color(hex: section.color).opacity(isDropTarget ? 0.5 : (theme.mode.isDark ? 0.25 : 0.18)))
                        .frame(width: 32, height: 32)
                        .scaleEffect(isDropTarget ? 1.15 : (isTapped ? 1.2 : 1.0))

                    Image(systemName: section.icon)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Color(hex: section.color))
                        .scaleEffect(isTapped ? 1.15 : 1.0)
                }
                .animation(.spring(response: 0.25, dampingFraction: 0.6), value: isTapped)

                // Section name
                Text(section.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(isDropTarget ? Color(hex: section.color) : theme.textPrimary)

                // Count badge
                Text("\(count)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Color(hex: section.color))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(
                        Capsule()
                            .fill(Color(hex: section.color).opacity(isDropTarget ? 0.4 : (theme.mode.isDark ? 0.2 : 0.15)))
                    )
                    .scaleEffect(isTapped ? 1.1 : 1.0)
                    .animation(.spring(response: 0.25, dampingFraction: 0.6), value: isTapped)

                Spacer()

                // Drop indicator when dragging over
                if isDropTarget {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(Color(hex: section.color))
                        .transition(.scale.combined(with: .opacity))
                }

                // Expand/collapse chevron with rotation animation
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Color(hex: section.color))
                    .opacity(isDropTarget ? 0.5 : 1)
                    .rotationEffect(.degrees(isExpanded ? 90 : 0))
                    .animation(.spring(response: 0.3, dampingFraction: 0.65), value: isExpanded)
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isDropTarget ? Color(hex: section.color).opacity(theme.mode.isDark ? 0.15 : 0.1) : (isExpanded ? Color(hex: section.color).opacity(0.04) : Color.clear))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(
                                isDropTarget ? Color(hex: section.color).opacity(0.5) : Color.clear,
                                lineWidth: 2
                            )
                            .animation(.easeInOut(duration: 0.3), value: isDropTarget)
                    )
            )
            .contentShape(Rectangle())
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isDropTarget)
            .animation(.easeInOut(duration: 0.3), value: isExpanded)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Conversation Preview View (for hard press)
struct ConversationPreviewView: View {
    let conversation: Conversation

    @ObservedObject private var theme = ThemeManager.shared

    private var accentColor: String { conversation.accentColor }
    private var secondaryColor: String { conversation.colorPalette.secondary }

    // Sample messages for preview
    private var previewMessages: [Message] {
        SampleData.messages(conversationId: conversation.id)
            .suffix(6)
            .reversed()
            .map { $0 }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header with avatar and name
            HStack(spacing: 12) {
                // Avatar
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 44, height: 44)
                        .shadow(color: Color(hex: accentColor).opacity(0.4), radius: 6, y: 3)

                    Text(String(conversation.name.prefix(1)))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                }

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(conversation.name)
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)

                        if conversation.isPinned {
                            Image(systemName: "pin.fill")
                                .font(.system(size: 9))
                                .foregroundColor(Color(hex: "FF6B6B"))
                        }

                        if conversation.isMuted {
                            Image(systemName: "bell.slash.fill")
                                .font(.system(size: 9))
                                .foregroundColor(theme.textMuted)
                        }
                    }

                    HStack(spacing: 6) {
                        if conversation.type != .direct {
                            HStack(spacing: 3) {
                                Image(systemName: conversation.type == .group ? "person.2.fill" : "person.3.fill")
                                    .font(.system(size: 9))
                                Text("\(conversation.memberCount) membres")
                                    .font(.system(size: 11, weight: .medium))
                            }
                            .foregroundColor(Color(hex: accentColor))
                        } else {
                            Circle()
                                .fill(Color(hex: "2ECC71"))
                                .frame(width: 8, height: 8)
                            Text("En ligne")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(Color(hex: "2ECC71"))
                        }
                    }
                }

                Spacer()

                if conversation.unreadCount > 0 {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 26, height: 26)

                        Text("\(min(conversation.unreadCount, 99))")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                    }
                }
            }
            .padding(14)
            .background(
                theme.surfaceGradient(tint: accentColor)
                    .overlay(
                        Rectangle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(hex: accentColor).opacity(0.1), Color.clear],
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                            )
                    )
            )

            // Messages preview using ThemedMessageBubble style
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 8) {
                    ForEach(Array(previewMessages.enumerated()), id: \.element.id) { _, message in
                        ThemedMessageBubble(message: message, contactColor: accentColor)
                            .scaleEffect(0.9)
                            .padding(.horizontal, 4)
                    }
                }
                .padding(.vertical, 10)
                .padding(.horizontal, 8)
            }
            .frame(height: 300)
            .background(previewBackground)
        }
        .frame(width: 320)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(
                    LinearGradient(
                        colors: [Color(hex: accentColor).opacity(0.5), Color(hex: secondaryColor).opacity(0.3)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        )
        .shadow(color: Color(hex: accentColor).opacity(0.3), radius: 20, y: 10)
    }

    private var previewBackground: some View {
        ZStack {
            theme.backgroundGradient

            // Accent colored orbs (smaller for preview)
            Circle()
                .fill(Color(hex: accentColor).opacity(theme.mode.isDark ? 0.1 : 0.06))
                .frame(width: 200, height: 200)
                .blur(radius: 60)
                .offset(x: 80, y: -80)

            Circle()
                .fill(Color(hex: secondaryColor).opacity(theme.mode.isDark ? 0.08 : 0.05))
                .frame(width: 150, height: 150)
                .blur(radius: 50)
                .offset(x: -60, y: 100)
        }
    }
}

// MARK: - Themed Conversation Row
struct ThemedConversationRow: View {
    let conversation: Conversation
    var availableWidth: CGFloat = 200 // Default width for tags calculation
    var isDragging: Bool = false
    var onViewStory: (() -> Void)? = nil
    var onViewProfile: (() -> Void)? = nil
    var onMoodBadgeTap: ((CGPoint) -> Void)? = nil

    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var presenceManager = PresenceManager.shared
    @EnvironmentObject var storyViewModel: StoryViewModel
    @EnvironmentObject var statusViewModel: StatusViewModel

    @State private var showLastSeenTooltip = false

    private var accentColor: String { conversation.accentColor }

    // Calculate visible tags based on available width
    private var visibleTagsInfo: (tags: [ConversationTag], remaining: Int) {
        guard !conversation.tags.isEmpty else { return ([], 0) }

        var totalWidth: CGFloat = 0
        var visibleTags: [ConversationTag] = []
        let tagSpacing: CGFloat = 6
        let remainingBadgeWidth: CGFloat = 32 // Space for "+N" badge

        for tag in conversation.tags {
            let tagWidth = tag.estimatedWidth
            let neededWidth = totalWidth + tagWidth + (visibleTags.isEmpty ? 0 : tagSpacing)

            // Check if we have space (reserve space for +N badge if there are more tags)
            let remainingTagsCount = conversation.tags.count - visibleTags.count - 1
            let reserveSpace = remainingTagsCount > 0 ? remainingBadgeWidth + tagSpacing : 0

            if neededWidth + reserveSpace <= availableWidth {
                visibleTags.append(tag)
                totalWidth = neededWidth
            } else {
                break
            }
        }

        // Ensure at least one tag is shown if available
        if visibleTags.isEmpty && !conversation.tags.isEmpty {
            visibleTags.append(conversation.tags[0])
        }

        let remaining = conversation.tags.count - visibleTags.count
        return (visibleTags, remaining)
    }

    var body: some View {
        HStack(spacing: 14) {
            // Dynamic Avatar
            avatarView

            // Content
            VStack(alignment: .leading, spacing: 4) {
                // Tags row (if any)
                if !conversation.tags.isEmpty {
                    tagsRow
                }

                HStack {
                    // Name with type indicator
                    HStack(spacing: 6) {
                        Text(conversation.name)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)

                        // Type badge
                        if conversation.type != .direct {
                            typeBadge
                        }
                    }

                    Spacer()

                    // Timestamp
                    Text(timeAgo(conversation.lastMessageAt))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Color(hex: accentColor))
                }

                // Last message
                Text(conversation.lastMessagePreview ?? "")
                    .font(.system(size: 13))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }

            // Unread badge
            if conversation.unreadCount > 0 {
                unreadBadge
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .stroke(
                            isDragging ?
                            LinearGradient(colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.5)], startPoint: .topLeading, endPoint: .bottomTrailing) :
                            theme.border(tint: accentColor),
                            lineWidth: isDragging ? 2 : 1
                        )
                )
                .shadow(color: Color(hex: accentColor).opacity(isDragging ? 0.4 : (theme.mode.isDark ? 0.15 : 0.1)), radius: isDragging ? 16 : 8, y: isDragging ? 8 : 4)
        )
        .scaleEffect(isDragging ? 1.02 : 1.0)
        .opacity(isDragging ? 0.8 : 1.0)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isDragging)
    }

    // MARK: - Tags Row
    private var tagsRow: some View {
        let tagInfo = visibleTagsInfo
        return HStack(spacing: 6) {
            // Show dynamically calculated visible tags
            ForEach(tagInfo.tags) { tag in
                TagChip(tag: tag)
            }

            // Show +N if more tags
            if tagInfo.remaining > 0 {
                Text("+\(tagInfo.remaining)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule()
                            .fill(theme.mode.isDark ? Color.white.opacity(0.1) : Color.black.opacity(0.08))
                    )
            }
        }
    }

    // MARK: - Avatar

    private var hasStoryRing: Bool {
        guard conversation.type == .direct, let userId = conversation.participantUserId else { return false }
        return storyViewModel.hasStories(forUserId: userId)
    }

    private var hasUnviewedStoryRing: Bool {
        guard conversation.type == .direct, let userId = conversation.participantUserId else { return false }
        return storyViewModel.hasUnviewedStories(forUserId: userId)
    }

    private var moodStatus: StatusEntry? {
        guard conversation.type == .direct, let userId = conversation.participantUserId else { return nil }
        return statusViewModel.statusForUser(userId: userId)
    }

    private var avatarStoryState: StoryRingState {
        if hasUnviewedStoryRing { return .unread }
        if hasStoryRing { return .read }
        return .none
    }

    private var avatarContextMenuItems: [AvatarContextMenuItem] {
        var items: [AvatarContextMenuItem] = []
        if hasStoryRing {
            items.append(AvatarContextMenuItem(label: "Voir les stories", icon: "play.circle.fill") {
                onViewStory?()
            })
        }
        items.append(AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
            onViewProfile?()
        })
        if conversation.type == .direct {
            items.append(AvatarContextMenuItem(label: "Infos utilisateur", icon: "info.circle.fill") {
                onViewProfile?()
            })
        }
        return items
    }

    private var avatarView: some View {
        ZStack {
            MeeshyAvatar(
                name: conversation.name,
                mode: .conversationList,
                accentColor: accentColor,
                secondaryColor: conversation.colorPalette.secondary,
                avatarURL: conversation.type == .direct ? conversation.participantAvatarURL : conversation.avatar,
                storyState: avatarStoryState,
                moodEmoji: moodStatus?.moodEmoji,
                presenceState: (conversation.type == .direct && moodStatus == nil) ? presenceManager.presenceState(for: conversation.participantUserId ?? "") : .offline,
                onViewProfile: onViewProfile,
                onViewStory: onViewStory,
                onMoodTap: onMoodBadgeTap,
                onOnlineTap: {
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                        showLastSeenTooltip = true
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        withAnimation(.easeOut(duration: 0.2)) {
                            showLastSeenTooltip = false
                        }
                    }
                },
                contextMenuItems: avatarContextMenuItems
            )

            // Last seen tooltip
            if showLastSeenTooltip, let text = conversation.lastSeenText {
                Text(text)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        Capsule()
                            .fill(Color.black.opacity(0.75))
                    )
                    .offset(x: 0, y: -34)
                    .transition(.scale.combined(with: .opacity))
            }
        }
    }

    // MARK: - Type Badge
    private var typeBadge: some View {
        HStack(spacing: 3) {
            Image(systemName: typeBadgeIcon)
                .font(.system(size: 8))
            if conversation.memberCount > 1 {
                Text("\(conversation.memberCount)")
                    .font(.system(size: 9, weight: .medium))
            }
        }
        .foregroundColor(Color(hex: accentColor))
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(
            Capsule()
                .fill(Color(hex: accentColor).opacity(theme.mode.isDark ? 0.2 : 0.15))
        )
    }

    private var typeBadgeIcon: String {
        switch conversation.type {
        case .group: return "person.2.fill"
        case .community: return "person.3.fill"
        case .channel: return "megaphone.fill"
        case .bot: return "sparkles"
        case .public, .global: return "globe"
        case .direct: return "person.fill"
        }
    }

    // MARK: - Unread Badge
    private var unreadBadge: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [Color(hex: accentColor), Color(hex: conversation.colorPalette.secondary)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 24, height: 24)
                .shadow(color: Color(hex: accentColor).opacity(0.5), radius: 6)

            Text("\(min(conversation.unreadCount, 99))")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white)
        }
        .pulse(intensity: 0.08)
    }

    private func timeAgo(_ date: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 60 { return "now" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)d"
    }
}

// MARK: - Themed Community Card
struct ThemedCommunityCard: View {
    let community: Community
    @ObservedObject private var theme = ThemeManager.shared
    @State private var isPressed = false

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            // Gradient background
            LinearGradient(
                colors: [
                    Color(hex: community.color),
                    Color(hex: community.color).opacity(0.85)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            // Banner emoji
            Text(community.emoji)
                .font(.system(size: 36))
                .offset(x: 70, y: -20)
                .opacity(1.0)
                .rotationEffect(.degrees(isPressed ? -10 : 0))
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isPressed)

            // Dark overlay for text readability
            LinearGradient(
                colors: [.clear, .clear, Color.black.opacity(0.7)],
                startPoint: .top,
                endPoint: .bottom
            )

            // Content
            VStack(alignment: .leading, spacing: 3) {
                Text(community.name)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(3)
                    .minimumScaleFactor(0.8)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 6) {
                    HStack(spacing: 2) {
                        Image(systemName: "person.2.fill")
                            .font(.system(size: 8))
                        Text(formatCount(community.memberCount))
                            .font(.system(size: 9, weight: .semibold))
                    }
                    HStack(spacing: 2) {
                        Image(systemName: "bubble.left.fill")
                            .font(.system(size: 8))
                        Text(formatCount(community.conversationCount))
                            .font(.system(size: 9, weight: .semibold))
                    }
                }
                .foregroundColor(.white.opacity(0.9))
            }
            .padding(8)
        }
        .frame(width: 130, height: 110)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .scaleEffect(isPressed ? 0.95 : 1)
        .onTapGesture {
            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) {
                isPressed = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) {
                    isPressed = false
                }
            }
            HapticFeedback.light()
        }
    }

    private func formatCount(_ count: Int) -> String {
        if count >= 1000000 {
            return String(format: "%.1fM", Double(count) / 1000000.0)
        } else if count >= 1000 {
            return String(format: "%.1fk", Double(count) / 1000.0)
        }
        return "\(count)"
    }
}

// MARK: - Themed Filter Chip
struct ThemedFilterChip: View {
    let title: String
    let color: String
    let isSelected: Bool
    let action: () -> Void

    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        Button(action: {
            HapticFeedback.light()
            action()
        }) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(isSelected ? .white : Color(hex: color))
                .padding(.horizontal, 16)
                .padding(.vertical, 9)
                .background(
                    Capsule()
                        .fill(
                            isSelected ?
                            AnyShapeStyle(LinearGradient(colors: [Color(hex: color), Color(hex: color).opacity(0.85)], startPoint: .leading, endPoint: .trailing)) :
                            AnyShapeStyle(Color(hex: color).opacity(theme.mode.isDark ? 0.4 : 0.3))
                        )
                        .overlay(
                            Capsule()
                                .stroke(Color(hex: color).opacity(isSelected ? 0 : 0.7), lineWidth: 1)
                        )
                )
        }
        .scaleEffect(isSelected ? 1.05 : 1)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isSelected)
    }
}

// MARK: - Tag Chip Component
struct TagChip: View {
    let tag: ConversationTag
    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        Text(tag.name)
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(Color(hex: tag.color))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(
                Capsule()
                    .fill(Color(hex: tag.color).opacity(theme.mode.isDark ? 0.25 : 0.18))
                    .overlay(
                        Capsule()
                            .stroke(Color(hex: tag.color).opacity(0.4), lineWidth: 0.5)
                    )
            )
    }
}

// MARK: - Legacy Support
struct SemanticColors {
    static let vibrantPalette: [String] = [
        "FF6B6B", "4ECDC4", "45B7D1", "96CEB4", "FFEAA7",
        "DDA0DD", "98D8C8", "F7DC6F", "BB8FCE", "85C1E9",
        "F8B500", "00CED1", "FF7F50", "9B59B6", "1ABC9C",
        "E74C3C", "3498DB", "2ECC71", "F39C12", "E91E63"
    ]

    static func colorForName(_ name: String) -> String {
        DynamicColorGenerator.colorForName(name)
    }
}

// Legacy aliases
struct ColorfulConversationRow: View {
    let conversation: Conversation
    var hasUnread: Bool = false
    var availableWidth: CGFloat = 200

    var body: some View {
        ThemedConversationRow(conversation: conversation, availableWidth: availableWidth)
    }
}

struct CommunityCard: View {
    let community: Community

    var body: some View {
        ThemedCommunityCard(community: community)
    }
}

struct ColorfulFilterChip: View {
    let title: String
    let color: String
    let isSelected: Bool

    var body: some View {
        ThemedFilterChip(title: title, color: color, isSelected: isSelected) {}
    }
}

struct ConversationRow: View {
    let conversation: Conversation
    var hasUnread: Bool = false

    var body: some View {
        ThemedConversationRow(conversation: conversation)
    }
}

struct CategoryPill: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        ThemedFilterChip(title: title, color: "4ECDC4", isSelected: isSelected, action: action)
    }
}

struct FilterChip: View {
    let title: String
    let isSelected: Bool

    var body: some View {
        ThemedFilterChip(title: title, color: "4ECDC4", isSelected: isSelected) {}
    }
}
