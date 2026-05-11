import SwiftUI
import Combine
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

    /// iPad / macOS split view: id of the currently-open conversation, to highlight
    /// the matching row with an accent tint + leading bar. nil on iPhone.
    var selectedConversationId: String? = nil

    @Environment(\.scenePhase) private var scenePhase
    // Lecture directe sans @ObservedObject — évite que chaque changement de thème ou de verrou
    // force un re-render complet de la liste (centaines de rows). Les valeurs sont lues
    // lors des refreshs naturels (scroll, interaction).
    // internal for cross-file extension access
    var theme: ThemeManager { ThemeManager.shared }
    var lockManager: ConversationLockManager { ConversationLockManager.shared }
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
    @State private var selectedProfileUser: ProfileSheetUser? = nil
    @State private var headerScrollOffset: CGFloat = 0
    @State private var lastScrollDirectionChange: Date = .distantPast

    // Pull-to-refresh state machine (custom Meeshy indicator avec logo
    // dashes + dégradé indigo + haptics). Remplace le `.refreshable`
    // standard d'iOS pour avoir un visuel brand-coherent. Le drag-end
    // est détecté via simultaneousGesture sur le ScrollView.
    @State private var pullPhase: MeeshyPullPhase = .idle
    @State private var peakPullDistance: CGFloat = 0
    @State private var hasFiredArmedHaptic: Bool = false
    @State private var pullRefreshTask: Task<Void, Never>? = nil

    /// Distance de pull (pt) à partir de laquelle le refresh s'amorce
    /// au release. ~90pt = doigt confortable sur grand écran.
    private static let pullRefreshThreshold: CGFloat = 90
    
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
        iPadFeedAction: (() -> Void)? = nil,
        selectedConversationId: String? = nil
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
        self.selectedConversationId = selectedConversationId
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

    private var isSingleUngroupedSection: Bool {
        conversationViewModel.groupedConversations.count == 1
        && conversationViewModel.groupedConversations[0].section.id == "other"
    }

    @ViewBuilder
    private func sectionView(for group: (section: ConversationSection, conversations: [Conversation])) -> some View {
        // Hide section header when there are no user categories (flat list)
        if !isSingleUngroupedSection {
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
        }

        // Section Content — always visible when no categories, otherwise animated expand/collapse
        if isSingleUngroupedSection || expandedSections.contains(group.section.id) {
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
                        // Cursor-based infinite scroll: trigger `loadMore`
                        // 5 rows before the loaded tail. The ViewModel
                        // short-circuits when `hasMore == false`, so it
                        // is safe to call this on every onAppear past
                        // the threshold.
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
                typingUsername: conversationViewModel.typingUsernames[conversation.id],
                isSelected: selectedConversationId == conversation.id
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

    @ViewBuilder
    private var paginationFooter: some View {
        switch conversationViewModel.paginationState {
        case .loadingMore:
            HStack {
                Spacer()
                ProgressView()
                    .tint(MeeshyColors.indigo400)
                Spacer()
            }
            .padding(.vertical, 16)
        case .exhausted:
            // Show the "all loaded" hint only on lists that actually
            // had to paginate -- avoids cluttering empty/small lists.
            if conversationViewModel.conversations.count > 30 {
                Text(String(
                    localized: "conversations.pagination.allLoaded",
                    defaultValue: "Toutes les conversations chargees"
                ))
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
            }
        case .error:
            VStack(spacing: 6) {
                Text(String(
                    localized: "conversations.pagination.errorTitle",
                    defaultValue: "Erreur de chargement"
                ))
                .font(.caption)
                .foregroundStyle(.secondary)
                Button {
                    Task { await conversationViewModel.loadMore() }
                } label: {
                    Text(String(
                        localized: "conversations.pagination.retry",
                        defaultValue: "Reessayer"
                    ))
                    .font(.caption.weight(.medium))
                    .foregroundStyle(MeeshyColors.indigo400)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
        case .idle:
            // Invisible sentinel: when the user scrolls deep enough to
            // reveal this row, fire `loadMore`. The ViewModel guards
            // against re-entry and short-circuits when hasMore=false.
            if conversationViewModel.hasMore {
                Color.clear
                    .frame(height: 1)
                    .onAppear {
                        Task { await conversationViewModel.loadMore() }
                    }
            }
        }
    }

    private func triggerLoadMoreIfNeeded(conversation: Conversation) {
        let all = conversationViewModel.conversations
        // Always-on infinite scroll: trigger `loadMore` as soon as the
        // user scrolls within 5 rows of the loaded tail. The 1000-
        // conversation gate that lived here assumed `fullSync()`
        // always succeeded for accounts below the cap, so `loadMore`
        // was reserved for power users. In practice, partial sync
        // failures stranded users at 50/88+ with no way to scroll
        // beyond the loaded chunk. `loadMore()` itself short-circuits
        // when `hasMore == false`, so calling it on every onAppear
        // past the threshold is safe.
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
                print("[DIAG] ConversationListView.task ENTERED")
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
            .onChange(of: conversationViewModel.groupedConversations.isEmpty) { _, isEmpty in
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

                    // Sectioned conversation list (skeleton -> content -> empty/error)
                    if conversationViewModel.isLoading && conversationViewModel.groupedConversations.isEmpty {
                        LazyVStack(spacing: 8) {
                            ForEach(0..<8, id: \.self) { index in
                                SkeletonConversationRow()
                                    .staggeredAppear(index: index, baseDelay: 0.04)
                            }
                        }
                        .padding(.horizontal, 16)
                        .transition(.opacity)
                    } else if conversationViewModel.groupedConversations.isEmpty && conversationViewModel.loadFailed {
                        // Cold-start sync failed AND cache is empty: offer a
                        // retry instead of the misleading "no conversations"
                        // placeholder. This is the path users hit after a
                        // cold start with stale/expired token or network
                        // issues — previously they were trapped on an empty
                        // list with no feedback.
                        EmptyStateView(
                            icon: "exclamationmark.arrow.triangle.2.circlepath",
                            title: String(localized: "conversations.error.title", defaultValue: "Impossible de charger les conversations"),
                            subtitle: String(localized: "conversations.error.subtitle", defaultValue: "Verifiez votre connexion puis reessayez"),
                            actionLabel: String(localized: "conversations.error.retry", defaultValue: "Reessayer"),
                            onAction: {
                                Task { await conversationViewModel.forceRefresh() }
                            }
                        )
                        .padding(.top, 60)
                        .transition(.opacity)
                    } else if conversationViewModel.groupedConversations.isEmpty {
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

                    // Pagination footer driven by `paginationState`.
                    // - .loadingMore: spinner while a page is in flight
                    // - .exhausted:   discreet "all loaded" hint once
                    //                 the gateway signalled hasMore=false
                    //                 (only shown for non-trivial lists)
                    // - .error:       inline retry button (transient
                    //                 errors keep hasMore=true)
                    // - .idle:        invisible spacer that triggers
                    //                 loadMore via onAppear once the
                    //                 user reaches the tail (back-up to
                    //                 the per-row threshold trigger)
                    paginationFooter

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
                updatePullPhase(scrollOffset: offset)
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
            // simultaneousGesture co-existe avec le scroll natif du
            // ScrollView (ne bloque pas le drag). onEnded fire au
            // moment où le doigt se lève — c'est là qu'on décide si le
            // refresh est armé (peak dépasse threshold).
            .simultaneousGesture(
                DragGesture(minimumDistance: 0).onEnded { _ in
                    handlePullDragEnded()
                }
            )

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
        // Layer 2.5: Pull-to-refresh indicator overlay — positionné JUSTE
        // SOUS le header (donc au-dessus du contenu scrollé), avec une
        // hauteur auto-gérée par la phase. Quand idle : hauteur 0 →
        // invisible. Pull/refresh : pousse visuellement sous le header
        // pendant que l'utilisateur tire. Doit apparaître AVANT le
        // header overlay pour que CollapsibleHeader reste topmost.
        .overlay(alignment: .top) {
            VStack(spacing: 0) {
                Color.clear.frame(height: CollapsibleHeaderMetrics.expandedHeight)
                MeeshyPullIndicator(phase: pullPhase)
                Spacer(minLength: 0)
            }
            .allowsHitTesting(false)
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

    // MARK: - Custom Pull-to-Refresh

    /// Mise à jour de la phase pull à partir du scroll offset courant.
    /// Appelée depuis `.onPreferenceChange(ScrollOffsetPreferenceKey)`.
    /// Le ScrollView envoie un minY négatif quand le contenu est tiré
    /// vers le bas — c'est notre signal de pull.
    private func updatePullPhase(scrollOffset: CGFloat) {
        // Ne pas perturber l'affichage pendant le refresh ou la sortie
        // en cours — le state machine reste en .refreshing/.completing
        // tant que le Task n'est pas terminé.
        if case .refreshing = pullPhase { return }
        if case .completing = pullPhase { return }

        let pullDistance = max(0, -scrollOffset)
        peakPullDistance = max(peakPullDistance, pullDistance)

        if pullDistance == 0 {
            // Retour à l'état neutre quand le scroll est revenu à 0.
            if pullPhase != .idle {
                pullPhase = .idle
            }
            return
        }

        let threshold = Self.pullRefreshThreshold
        if pullDistance >= threshold {
            if pullPhase != .armed {
                pullPhase = .armed
            }
            // Haptic feedback "armé" tiré une seule fois au crossing.
            if !hasFiredArmedHaptic {
                hasFiredArmedHaptic = true
                HapticFeedback.medium()
            }
        } else {
            // Progression normalisée 0...1 jusqu'au seuil.
            let progress = pullDistance / threshold
            pullPhase = .pulling(progress: progress)
            // Repasse en pull < threshold → on reset le flag haptic
            // pour qu'un nouveau crossing produise à nouveau le tap.
            if hasFiredArmedHaptic {
                hasFiredArmedHaptic = false
            }
        }
    }

    /// Appelée au release du doigt (drag end). Si on a franchi le seuil,
    /// on déclenche le refresh — sinon on remet en .idle proprement.
    private func handlePullDragEnded() {
        defer {
            peakPullDistance = 0
            hasFiredArmedHaptic = false
        }
        guard pullRefreshTask == nil else { return }
        if peakPullDistance >= Self.pullRefreshThreshold,
           case .armed = pullPhase {
            startPullRefresh()
        }
    }

    /// Orchestre le refresh : invalidation transverse via le ViewModel
    /// (qui purge listing + préférences + assets) puis re-fetch stories,
    /// statuses et communautés en parallèle. Spring-back + haptic
    /// success au succès, error au pire.
    private func startPullRefresh() {
        pullPhase = .refreshing
        pullRefreshTask = Task { [weak conversationViewModel, weak storyViewModel, weak statusViewModel] in
            // Démarre tous les refresh en parallèle. ConversationListVM
            // a l'invalidation la plus large (caches transverses), les
            // autres ViewModels gèrent leur propre store.
            async let convRefresh: Void = conversationViewModel?.pullToRefresh() ?? ()
            async let storyRefresh: Void = storyViewModel?.loadStories(forceNetwork: true) ?? ()
            async let statusRefresh: Void = statusViewModel?.refresh() ?? ()
            async let communitiesRefresh: Void = loadUserCommunities()
            _ = await (convRefresh, storyRefresh, statusRefresh, communitiesRefresh)

            await MainActor.run {
                completePullRefresh(success: true)
            }
        }
    }

    /// Sortie propre du refresh — animation spring-back, haptic et
    /// retour en idle après une courte phase .completing pour laisser
    /// l'utilisateur percevoir que le refresh est fini.
    @MainActor
    private func completePullRefresh(success: Bool) {
        pullRefreshTask = nil
        if success {
            HapticFeedback.success()
        } else {
            HapticFeedback.error()
        }
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            pullPhase = .completing
        }
        // Brève fenêtre où l'utilisateur voit que c'est terminé, puis
        // l'indicator se replie. Le scroll content se remet en place
        // automatiquement via le spring (l'indicator passe à hauteur 0).
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 350_000_000)
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                pullPhase = .idle
            }
        }
    }
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
