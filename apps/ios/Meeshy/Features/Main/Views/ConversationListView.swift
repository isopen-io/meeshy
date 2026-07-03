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
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    // Theme stays a direct read (a theme flip should repaint the whole list
    // anyway, and it's infrequent). internal for cross-file extension access.
    var theme: ThemeManager { ThemeManager.shared }
    // Lock + block ARE observed: they drive the swipe-action icons (Unlock /
    // Unblock toggles built by `leadingSwipeActions` / `trailingSwipeActions`)
    // which the row's Equatable gate compares. A direct read would freeze a
    // stale action behind the gate after a lock/unlock or block/unblock (Opus
    // review finding 2026-06-10) — they aren't in `renderFingerprint`. Both
    // change only on explicit user action (rare), and the gate keeps unaffected
    // rows static, so observing them is free on the hot scroll path.
    private var lockManager: ConversationLockManager { ConversationLockManager.shared }
    private var blockService: BlockService { BlockService.shared }
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
    @State private var animateGradient = false
    @State private var expandedSections: Set<String> = ["pinned", "other"]

    // Scroll tracking
    @State private var hideSearchBar = false

    // Performance optimized scroll variables
    @State private var selectedProfileUser: ProfileSheetUser? = nil
    @State private var headerScrollOffset: CGFloat = 0
    @State private var lastScrollDirectionChange: Date = .distantPast

    // Pull-to-refresh : delegue tout a `MeeshyRefreshableScroll` (wrapper
    // brand-coherent qui combine `.refreshable` natif iOS + animation
    // Meeshy custom : logo dashes, degrade indigo, haptic au seuil et au
    // success). L'ancien state machine custom (pullPhase, peakPullDistance,
    // simultaneousGesture, startPullRefresh, completePullRefresh) ne
    // declenchait pas l'haptic ni le refresh sur device — `simultaneousGesture`
    // ne firait pas systematiquement parce que le ScrollView consomme le
    // drag vertical en priorite. Le wrapper utilise `.refreshable` qui est
    // robuste.

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

    /// Conversation dont l'overlay de menu contextuel custom est présenté
    /// (appui long). Menu custom qui dessine ses icônes — le `.contextMenu`
    /// natif ne les affiche pas sur iOS 26.
    @State var contextMenuConversation: Conversation? = nil
    /// Pilote l'animation zoom + rebond de l'overlay (false au montage → true
    /// via `.onAppear` ; false à la fermeture). Voir `conversationContextMenuOverlay`.
    @State var contextMenuAppeared = false
    /// Purge différée annulable de l'overlay (voir `dismissContextMenu`). Conservée
    /// pour l'annuler si une nouvelle ouverture survient avant la fin du zoom-out,
    /// sinon la purge en vol effacerait le menu qui vient de se rouvrir.
    @State var contextMenuDismissWork: DispatchWorkItem? = nil
    /// Tracks which conversation row has isPressed = true (scale animation active).
    /// When menu closes, this resets to nil and rows use .onChange to reset isPressed.
    /// Pas `private` : lu par les fichiers d'extension +Overlays/+Rows (un @State
    /// private est inaccessible depuis un fichier extension frère — cf. CLAUDE.md).
    @State var activelyPressedConversationId: String? = nil

    /// Renommage : conversation cible + texte en cours d'édition (action
    /// « Renommer » du menu contextuel, groupes/communautés uniquement).
    @State var renameTarget: Conversation? = nil
    @State var renameText: String = ""

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
        // rowWidth derives from the actual containing column width (iPad
        // left column is much narrower than `UIScreen.main.bounds.width`)
        // minus innerPadding(32) + avatar(52) + badge(28) + spacing(24).
        // On iPad the column ratio is roughly 0.38 of the screen, so we
        // clamp to that floor explicitly to avoid text overflow.
        let baseWidth = horizontalSizeClass == .regular
            ? min(UIScreen.main.bounds.width * 0.42, 520)
            : UIScreen.main.bounds.width - 32
        let rowWidth = max(120, baseWidth - 32 - 52 - 28 - 24)
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

    func storyRingState(for conversation: Conversation) -> StoryRingState {
        guard conversation.type == .direct, let userId = conversation.participantUserId else { return .none }
        return storyViewModel.storyRingState(forUserId: userId)
    }

    func conversationMoodStatus(for conversation: Conversation) -> StatusEntry? {
        guard conversation.type == .direct, let userId = conversation.participantUserId else { return nil }
        return statusViewModel.statusForUser(userId: userId)
    }

    // Builds one conversation row. The heavy subtree (swipe actions +
    // context menu + preview) lives in the nominal `ConversationRowItem`
    // struct (ConversationListView+Rows.swift) so it no longer bloats the
    // ConversationListView body type — that monolithic type was the
    // type-metadata instantiation crash on low-memory devices. This builder
    // only wires the row's inputs; the returned `some View` is the nominal
    // `ConversationRowItem`, which keeps the enclosing list type small.
    private func conversationRow(for conversation: Conversation, rowWidth: CGFloat) -> some View {
        let community: MeeshyCommunity? = {
            guard conversation.type == .community || conversation.communityId != nil,
                  let communityId = conversation.communityId else { return nil }
            return userCommunityLookup[communityId] ?? userCommunities.first(where: { $0.id == communityId })
        }()

        return ConversationRowItem(
            conversation: conversation,
            community: community,
            rowWidth: rowWidth,
            isDragging: draggingConversation?.id == conversation.id,
            presenceState: presenceManager.presenceState(for: conversation.participantUserId ?? ""),
            isDark: theme.mode.isDark,
            storyRingState: storyRingState(for: conversation),
            moodStatus: conversationMoodStatus(for: conversation),
            typingUsername: conversationViewModel.typingUsernames[conversation.id],
            isSelected: selectedConversationId == conversation.id,
            draftSummary: conversationViewModel.draftSummaries[conversation.id],
            // B1 (Prisme Linguistique) — resolved once at row creation
            // time. Re-evaluates when AuthManager publishes a new currentUser
            // because the parent body re-runs on @Published changes.
            preferredContentLanguages: AuthManager.shared.currentUser?.preferredContentLanguages ?? [],
            cachedPreviewMessages: conversationViewModel.previewMessages[conversation.id] ?? [],
            leadingActions: leadingSwipeActions(for: conversation),
            trailingActions: trailingSwipeActions(for: conversation),
            onViewStory: { handleStoryView(conversation) },
            onViewProfile: { handleProfileView(conversation) },
            onViewConversationInfo: { handleConversationInfoView(conversation) },
            onMoodBadgeTap: { anchor in handleMoodBadgeTap(conversation, at: anchor) },
            onCreateShareLink: canCreateShareLink(for: conversation) ? {
                inviteSheetConversation = conversation
            } : nil,
            onTap: {
                if ConversationLockManager.shared.isLocked(conversation.id) {
                    lockSheetMode = .openConversation
                    lockSheetConversation = conversation
                } else {
                    onSelect(conversation)
                }
            },
            onDragStart: {
                draggingConversation = conversation
                HapticFeedback.medium()
            },
            onLoadPreview: {
                await conversationViewModel.loadPreviewMessages(for: conversation.id)
            },
            onLongPress: {
                Task { await conversationViewModel.loadPreviewMessages(for: conversation.id) }
                // Montage instantané à l'état "replié" ; l'overlay anime
                // ensuite via `.onAppear` (zoom + rebond). Reset explicite au
                // cas où l'état resterait à true d'une ouverture précédente.
                // Annule une purge de fermeture encore en vol, sinon elle
                // effacerait ce menu fraîchement ouvert (~0.26 s plus tard).
                contextMenuDismissWork?.cancel()
                contextMenuDismissWork = nil
                contextMenuAppeared = false
                contextMenuConversation = conversation
                // P7-XX: Track which row has scale animation active
                activelyPressedConversationId = conversation.id
            },
            onMenuDismissed: {
                activelyPressedConversationId = nil
            },
            activelyPressedConversationId: activelyPressedConversationId
        )
        .equatable()
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
                icon: conversation.userState.isPinned ? "pin.slash.fill" : "pin.fill",
                label: conversation.userState.isPinned
                    ? String(localized: "swipe.unpin")
                    : String(localized: "swipe.pin"),
                color: MeeshyColors.pinnedBlue
            ) {
                Task { await conversationViewModel.togglePin(for: conversation.id) }
            },
            SwipeAction(
                icon: conversation.userState.isMuted ? "bell.fill" : "bell.slash.fill",
                label: conversation.userState.isMuted
                    ? String(localized: "swipe.unmute")
                    : String(localized: "swipe.mute"),
                color: MeeshyColors.neutral500
            ) {
                Task { await conversationViewModel.toggleMute(for: conversation.id) }
            },
            SwipeAction(
                icon: isLocked ? "lock.open.fill" : "lock.fill",
                label: isLocked
                    ? String(localized: "swipe.unlock")
                    : String(localized: "swipe.lock"),
                color: MeeshyColors.warning
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
        // Per-user archive state (same source as the list filter + `.setArchived`
        // mutation). NOT `conversation.isActive` (server lifecycle flag, never
        // toggled by archiving) — reading it froze this swipe on "Archiver" so
        // archived conversations could never be unarchived from the swipe.
        let isArchived = conversation.userState.isArchived
        let isRead = conversation.userState.unreadCount == 0
        var actions: [SwipeAction] = [
            SwipeAction(
                icon: isArchived ? "tray.and.arrow.up.fill" : "archivebox.fill",
                label: isArchived
                    ? String(localized: "swipe.unarchive")
                    : String(localized: "swipe.archive"),
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
                    ? String(localized: "swipe.mark_unread")
                    : String(localized: "swipe.mark_read"),
                color: MeeshyColors.indigo400
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
                    ? String(localized: "swipe.unblock")
                    : String(localized: "swipe.block"),
                color: MeeshyColors.error
            ) {
                if isBlocked {
                    Task {
                        await BlockActionCoordinator.shared.unblock(userId: userId)
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
            label: String(localized: "swipe.hide"),
            color: MeeshyColors.error
        ) {
            Task { await conversationViewModel.deleteConversation(conversationId: conversation.id) }
        })

        return actions
    }

    // Pagination footer now lives in `ConversationPaginationFooter`
    // (ConversationListView+Rows.swift).

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
            .adaptiveOnChange(of: selectedProfileUser) { _, newValue in
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
                viaUsername: entry.username,
                repostOfId: entry.id,
                repostAudioUrl: entry.audioUrl
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
            .adaptiveOnChange(of: isScrollingDown) { wasHidden, isHidden in
                if !wasHidden && isHidden { showSearchOverlay = false }
            }
            .onAppear {
                withAnimation(.easeOut(duration: 0.25)) { isScrollingDown = false }
            }
            .task {
                async let conversations: Void = conversationViewModel.loadConversations()
                async let communities: Void = loadUserCommunities()
                _ = await (conversations, communities)
            }
            .adaptiveOnChange(of: scenePhase) { _, newPhase in
                if newPhase == .active {
                    conversationViewModel.handleForegroundReturn()
                    conversationViewModel.handleForegroundReactivation()
                }
            }
            .adaptiveOnChange(of: conversationViewModel.userCategories) { _, categories in
                for cat in categories where cat.isExpanded { expandedSections.insert(cat.id) }
            }
            .adaptiveOnChange(of: conversationViewModel.groupedConversations.isEmpty) { _, isEmpty in
                if isEmpty && isScrollingDown {
                    withAnimation(.easeOut(duration: 0.25)) { isScrollingDown = false }
                }
            }
            .adaptiveOnChange(of: conversationViewModel.selectedFilter) { _, _ in
                withAnimation(.easeOut(duration: 0.25)) { isScrollingDown = false }
            }
            .adaptiveOnChange(of: feedIsVisible) { wasVisible, isVisible in
                if wasVisible && !isVisible {
                    withAnimation(.easeOut(duration: 0.25)) { isScrollingDown = false }
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
            .overlay { conversationContextMenuOverlay }
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
            .alert(String(localized: "conversation.list.master_pin_required.title", bundle: .main), isPresented: $showNoMasterPinAlert) {
                Button(String(localized: "conversation.list.master_pin_required.configure", bundle: .main), role: .none) { router.push(.settings) }
                Button(String(localized: "common.cancel", bundle: .main), role: .cancel) {}
            } message: {
                Text(String(localized: "conversation.list.master_pin_required.message", bundle: .main))
            }
            .alert(
                String(localized: "conversation.rename.title", defaultValue: "Renommer la conversation", bundle: .main),
                isPresented: Binding(
                    get: { renameTarget != nil },
                    set: { if !$0 { renameTarget = nil } }
                )
            ) {
                TextField(String(localized: "conversation.rename.placeholder", defaultValue: "Nom", bundle: .main), text: $renameText)
                Button(String(localized: "common.save", defaultValue: "Enregistrer", bundle: .main)) {
                    if let target = renameTarget {
                        Task { await conversationViewModel.renameConversation(conversationId: target.id, title: renameText) }
                    }
                    renameTarget = nil
                }
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {
                    renameTarget = nil
                }
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
                String(localized: "block.confirm.title"),
                isPresented: $showBlockConfirmation,
                titleVisibility: .visible
            ) {
                Button(String(localized: "action.block"), role: .destructive) {
                    guard let conv = blockTargetConversation,
                          let targetUserId = conv.participantUserId else { return }
                    Task {
                        await BlockActionCoordinator.shared.block(userId: targetUserId)
                        await conversationViewModel.archiveConversation(conversationId: conv.id)
                        HapticFeedback.success()
                    }
                }
                Button(String(localized: "action.cancel"), role: .cancel) {}
            } message: {
                Text(String(localized: "block.confirm.message"))
            }
    }

    private var mainContentZStack: some View {
        ZStack(alignment: .bottom) {
            // Layer 1: Full-screen scroll content
            // Wrapper Meeshy : `.refreshable` natif iOS + indicator brand
            // anime (logo dashes + degrade indigo). Le contenu est insere
            // tel quel, le wrapper s'occupe du sentinel scrollOffset, du
            // MeeshyPullIndicator au top, des haptics et de l'orchestration
            // de la sequence pull -> armed -> refreshing -> completing -> idle.
            // The scroll subtree's type is kept small by the nominal
            // ConversationRowItem / ConversationPaginationFooter structs
            // (ConversationListView+Rows.swift) — no AnyView seam needed.
            MeeshyRefreshableScroll(
                onRefresh: {
                    async let convRefresh: Void = conversationViewModel.pullToRefresh()
                    async let storyRefresh: Void = storyViewModel.loadStories(forceNetwork: true)
                    async let statusRefresh: Void = statusViewModel.refresh()
                    async let communitiesRefresh: Void = loadUserCommunities()
                    _ = await (convRefresh, storyRefresh, statusRefresh, communitiesRefresh)
                },
                coordinateSpaceName: "scroll",
                onScrollOffsetChange: { offset in
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
                },
                topPadding: CollapsibleHeaderMetrics.expandedHeight
            ) {
                VStack(spacing: 0) {
                    // Story carousel
                    StoryTrayView(viewModel: storyViewModel, onViewStory: { userId in
                        onStoryViewRequest?(userId, true)
                    }, onAddStatus: {
                        showStatusComposer = true
                    })

                    // Sectioned conversation list (skeleton -> content -> empty/error).
                    // Skeleton ONLY when cold-start with no cached groups —
                    // cache-first principle: any cached/stale data must
                    // render immediately, no skeleton on top of it.
                    // Drive the gate from `loadState == .loading` (not the
                    // legacy `isLoading` flag) so cachedStale/cachedFresh
                    // paths bypass the placeholder even on first paint.
                    if conversationViewModel.loadState == .loading
                        && conversationViewModel.groupedConversations.isEmpty {
                        LazyVStack(spacing: 8) {
                            ForEach(0..<6, id: \.self) { index in
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
                            title: String(localized: "conversations.error.title"),
                            subtitle: String(localized: "conversations.error.subtitle"),
                            actionLabel: String(localized: "conversations.error.retry"),
                            onAction: {
                                Task { await conversationViewModel.forceRefresh() }
                            }
                        )
                        .padding(.top, 60)
                        .transition(.opacity)
                    } else if conversationViewModel.groupedConversations.isEmpty {
                        EmptyStateView(
                            icon: "bubble.left.and.bubble.right",
                            title: String(localized: "conversations.empty.title"),
                            subtitle: String(localized: "conversations.empty.subtitle"),
                            actionLabel: String(localized: "conversations.empty.action"),
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
                    ConversationPaginationFooter()

                    Color.clear.frame(height: 280)
                        .adaptiveOnChange(of: draggingConversation) { oldValue, newValue in
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
            .scrollDismissesKeyboard(.interactively)

            // Layer 2: Bottom overlay — Search bar + Communities & Filters
            ConversationListBottomBar(
                showSearchOverlay: $showSearchOverlay,
                isSearching: $isSearching,
                showWidgetPreview: $showWidgetPreview,
                showGlobalSearch: $showGlobalSearch,
                userCommunities: userCommunities
            )
            .padding(.bottom, 8)
            // Hide on scroll down
            .offset(y: isScrollingDown ? 150 : 0)
            .opacity(isScrollingDown ? 0 : 1)
            .animation(.easeOut(duration: 0.25), value: isScrollingDown)
            .animation(.easeOut(duration: 0.25), value: showSearchOverlay)
        }
        // Layer 3: Collapsible header overlay — pinned to top, respects safe area.
        // A compact story trail is integrated *inside* the header (accessory
        // slot, below the title/actions bar) and reveals as the full-size trail
        // scrolls up under the header.
        .overlay(alignment: .top) {
            ConversationListHeaderOverlay(
                scrollOffset: headerScrollOffset,
                iPadFeedAction: iPadFeedAction,
                iPadNotificationCount: iPadNotificationCount,
                onNotificationsTap: onNotificationsTap,
                onSettingsTap: onSettingsTap,
                onNewConversation: onNewConversation,
                showShareLinkSheet: $showShareLinkSheet,
                accessory: {
                    AnyView(
                        PinnedStoryTrailBand(
                            viewModel: storyViewModel,
                            scrollOffset: headerScrollOffset,
                            onViewStory: { userId in onStoryViewRequest?(userId, true) }
                        )
                    )
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
        // Lookup par userId uniquement — l'ancien fallback par display name
        // (`$0.username == conversation.name`) ouvrait la story d'un homonyme
        // ou cassait dès que l'utilisateur renommait son profil.
        guard conversation.type == .direct,
              let userId = conversation.participantUserId,
              storyViewModel.hasStories(forUserId: userId) else { return }
        onStoryViewRequest?(userId, false)
    }

    // MARK: - Handle Profile View
    func handleProfileView(_ conversation: Conversation) {
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
    /// Cache-first community load (iOS Local-First Wave 1, Task 2.1).
    ///
    /// Flow:
    /// - `.fresh` -> apply cache, no network call.
    /// - `.stale` -> apply cache immediately, then revalidate silently;
    ///   the fresh result replaces the cached one when it lands.
    /// - `.expired`/`.empty` -> fetch the network, apply, persist.
    ///
    /// The cache key is the single bucket `"list"` because the conversation
    /// list only ever calls `CommunityService.shared.list(offset: 0, limit: 10)`
    /// (no search, fixed window). A different bucket / param-aware key would
    /// be needed if the call surface grew to support pagination or search.
    private func loadUserCommunities() async {
        let cacheKey = "list"
        let cacheResult = await CacheCoordinator.shared.communities.load(for: cacheKey)
        switch cacheResult {
        case .fresh(let cached, _):
            applyCommunities(cached)
        case .stale(let cached, _):
            applyCommunities(cached)
            Task {
                do {
                    let response = try await CommunityService.shared.list(offset: 0, limit: 10)
                    applyCommunities(response.data)
                    try? await CacheCoordinator.shared.communities.save(response.data, for: cacheKey)
                } catch {
                    Logger.cache.warning("[ConversationListView] Communities silent revalidate failed: \(error.localizedDescription)")
                }
            }
        case .expired, .empty:
            do {
                let response = try await CommunityService.shared.list(offset: 0, limit: 10)
                applyCommunities(response.data)
                try? await CacheCoordinator.shared.communities.save(response.data, for: cacheKey)
            } catch {
                Logger.messages.error("[ConversationListView] Error loading communities: \(error.localizedDescription)")
            }
        }
    }

    /// Maps API payloads to the domain `MeeshyCommunity` type and updates
    /// both the array and the id-keyed lookup the rows consume. Pulled out
    /// so the cache-first switch in `loadUserCommunities` stays readable
    /// and the same transform is reused across the fresh / stale / network
    /// branches.
    private func applyCommunities(_ apiCommunities: [APICommunity]) {
        let mapped = apiCommunities.map { $0.toCommunity() }
        userCommunities = mapped
        userCommunityLookup = Dictionary(uniqueKeysWithValues: mapped.map { ($0.id, $0) })
    }

    // communitiesSection, categoryFilters, themedSearchBar now live in
    // ConversationListBottomBar (ConversationListView+Overlays.swift).

    // Pull-to-refresh entierement gere par MeeshyRefreshableScroll.
    // Voir Layer 1 dans `mainContentZStack`.
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
                            .font(MeeshyFont.relative(48))
                            .foregroundStyle(MeeshyColors.indigo300)
                        Text(String(localized: "conversation.list.no_eligible_conversation", bundle: .main))
                            .font(MeeshyFont.relative(16, weight: .medium))
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
                                    .font(MeeshyFont.relative(16))
                                    .foregroundColor(MeeshyColors.indigo500)
                                    .frame(width: 32, height: 32)
                                    .accessibilityHidden(true)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(conversation.name)
                                        .font(MeeshyFont.relative(16, weight: .medium))
                                        .foregroundColor(theme.textPrimary)
                                        .lineLimit(1)

                                    Text(conversation.type.rawValue.capitalized)
                                        .font(MeeshyFont.relative(13))
                                        .foregroundColor(theme.textSecondary)
                                }

                                Spacer()

                                Image(systemName: "link")
                                    .font(MeeshyFont.relative(14))
                                    .foregroundColor(MeeshyColors.indigo400)
                                    .accessibilityHidden(true)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(String(localized: "conversation.list.create_share_link.title", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.close", bundle: .main)) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
