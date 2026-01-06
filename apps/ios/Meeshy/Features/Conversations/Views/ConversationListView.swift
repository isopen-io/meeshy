//
//  ConversationListView.swift
//  Meeshy
//
//  Main conversation list view (home screen)
//  iOS 16+
//
//  FEATURES:
//  - Sections (Pinned always first, then Categories by order, Uncategorized last)
//  - Search bar at bottom with community tiles appearing on search
//  - Adaptive layout: NavigationSplitView on iPad (regular), NavigationStack on iPhone (compact)
//  - Swipe actions (delete, archive, mute, pin)
//  - Real-time updates via ConversationListViewModel
//  - Sorting by lastMessageAt (newest first) within each section
//  - Dynamic view title based on selected filter
//
//  ARCHITECTURE:
//  - Uses @Environment(\.horizontalSizeClass) to detect iPad vs iPhone
//  - iPad (regular): NavigationSplitView with sidebar toggle support
//  - iPhone (compact): NavigationStack with standard push navigation
//  - Selection state is shared between both modes for seamless transitions
//

import SwiftUI
import UniformTypeIdentifiers
import Combine


// MARK: - Conversation List View

struct ConversationListView: View {
    // MARK: - Properties

    @StateObject private var viewModel = ConversationListViewModel()
    @State private var collapsedSections: Set<String> = []
    @State private var selectedConversationId: String?
    @State private var navigationPath = NavigationPath() // For NavigationStack state preservation
    @State private var isSearchActive = false
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var showEmojiPicker = false
    @State private var emojiPickerConversationId: String?
    @State private var showNewConversationSheet = false
    @State private var showMeeshyFeed = false
    @State private var actionMenuConversation: Conversation?

    /// Track previous size class to detect orientation changes
    @State private var previousSizeClass: UserInterfaceSizeClass?

    /// Category drag-and-drop reordering state
    @State private var draggedCategoryId: String?

    /// Keyboard height for positioning search bar above keyboard
    @State private var keyboardHeight: CGFloat = 0

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    // MARK: - Computed Properties

    private var currentUserId: String {
        AuthenticationManager.shared.currentUser?.id ?? ""
    }

    private var currentUserDisplayName: String {
        AuthenticationManager.shared.currentUser?.displayName ?? "Utilisateur"
    }

    /// Determines if we should use SplitView (iPad) or NavigationStack (iPhone)
    /// This is the KEY decision point for adaptive layout
    private var useSplitView: Bool {
        UIDevice.current.userInterfaceIdiom == .pad
    }

    /// Currently selected conversation object (derived from ID)
    private var selectedConversation: Conversation? {
        guard let id = selectedConversationId else { return nil }
        return viewModel.conversations.first { $0.id == id }
    }

    /// Dynamic view title based on selected filter
    private var viewTitle: String {
        switch viewModel.selectedCommunityFilter {
        case .all:
            return "Conversations"
        case .community(let id):
            if let community = viewModel.communitiesList.first(where: { $0.id == id }) {
                return community.name
            }
            return "Communauté"
        case .archived:
            return "Conversations archivées"
        case .reacted:
            return "Favorites"
        }
    }

    /// Conversation Meeshy (assistant AI)
    private var meeshyConversation: Conversation? {
        viewModel.conversations.first { $0.identifier.lowercased() == "meeshy" }
    }

    /// Dynamic text for the "load more" button based on current filter
    private var loadMoreButtonText: String {
        switch viewModel.selectedCommunityFilter {
        case .all:
            return "Charger 100 conversations suivantes"
        case .community:
            return "Charger plus de conversations"
        case .archived, .reacted:
            return "Charger plus"
        }
    }

    /// Dynamic text for "all loaded" indicator based on current filter
    private var allLoadedText: String {
        let filteredCount = viewModel.filteredConversations.count
        let totalCount = viewModel.conversations.count

        switch viewModel.selectedCommunityFilter {
        case .all:
            // Affiche le total charge
            return "Toutes les \(totalCount) conversations chargees"
        case .community(let communityId):
            if let communityCard = viewModel.communityCards.first(where: {
                if case .community(let id) = $0.type { return id == communityId }
                return false
            }) {
                return "\(filteredCount)/\(communityCard.conversationCount) de \(communityCard.title)"
            }
            return "\(filteredCount) conversations de la communaute"
        case .archived:
            return "\(filteredCount) conversations archivees"
        case .reacted:
            return "\(filteredCount) favorites"
        }
    }

    /// Navigate to the Meeshy conversation (opens as feed view)
    private func navigateToMeeshy() {
        guard meeshyConversation != nil else {
            chatLogger.warn("Meeshy conversation not found")
            return
        }

        // Open Meeshy as a full-screen feed view
        showMeeshyFeed = true
    }

    /// Conversations filtered by search and selected filter
    private var displayConversations: [Conversation] {
        return viewModel.filteredConversations
    }

    /// Organize conversations into sections (only non-empty sections)
    /// IMPORTANT: Ne retourne des sections que si les catégories sont prêtes
    /// pour éviter le flash où tout apparaît dans "non catégorisé"
    private var sections: [ConversationSection] {
        // GUARD: Si les données ne sont pas prêtes, retourner vide
        // Cela maintient l'affichage du loading jusqu'à ce que tout soit structuré
        guard viewModel.isDataReady else {
            return []
        }

        var result: [ConversationSection] = []
        let conversations = displayConversations

        // 1. Pinned section (ALWAYS FIRST if has conversations)
        let pinnedConversations = conversations.filter { $0.isPinned }
        if !pinnedConversations.isEmpty {
            let sortedPinned = pinnedConversations.sorted { $0.lastMessageAt > $1.lastMessageAt }
            result.append(ConversationSection(
                id: "pinned",
                title: "ÉPINGLÉES",
                icon: "pin.fill",
                color: .orange,
                order: Int.min,
                conversations: sortedPinned
            ))
        }

        // 2. Get all categories and group conversations
        let nonPinnedConversations = conversations.filter { !$0.isPinned }

        // Group by category
        // Check both userPreferences.categoryId and preferences.category.id (API may return in either)
        var categoryGroups: [String: [Conversation]] = [:]
        var uncategorized: [Conversation] = []

        for conv in nonPinnedConversations {
            // Try userPreferences.categoryId first, then preferences.category.id
            let categoryId = conv.userPreferences?.categoryId ?? conv.preferences?.category?.id

            if let categoryId = categoryId {
                if categoryGroups[categoryId] == nil {
                    categoryGroups[categoryId] = []
                }
                categoryGroups[categoryId]?.append(conv)
            } else {
                uncategorized.append(conv)
            }
        }

        // IMPORTANT: Créer les sections de catégories SEULEMENT si on a des catégories
        // Sinon, attendre que les catégories soient chargées
        for category in viewModel.sortedCategories {
            if let convs = categoryGroups[category.id], !convs.isEmpty {
                let sortedConvs = convs.sorted { $0.lastMessageAt > $1.lastMessageAt }
                result.append(ConversationSection(
                    id: category.id,
                    title: category.name.uppercased(),
                    icon: category.icon ?? "folder.fill",
                    color: Color(hex: category.color ?? "#007AFF") ?? .blue,
                    order: category.order,
                    conversations: sortedConvs
                ))
            }
        }

        // 3. Uncategorized section (ALWAYS LAST if has conversations)
        if !uncategorized.isEmpty {
            let sortedUncategorized = uncategorized.sorted { $0.lastMessageAt > $1.lastMessageAt }
            result.append(ConversationSection(
                id: "uncategorized",
                title: "NON CATÉGORISÉ",
                icon: "tray.fill",
                color: .gray,
                order: Int.max,
                conversations: sortedUncategorized
            ))
        }

        return result
    }

    // MARK: - Body

    var body: some View {
        Group {
            // ADAPTIVE LAYOUT: SplitView for iPad, NavigationStack for iPhone
            if useSplitView {
                splitViewLayout
            } else {
                stackViewLayout
            }
        }
        // Shared modifiers for both layouts
        .refreshable {
            await viewModel.refreshConversations()
        }
        .task(id: "load-conversations") {
            await viewModel.loadInitialConversations()
        }
        // CRITICAL: Handle orientation changes to preserve conversation state
        .onChange(of: horizontalSizeClass) { oldValue, newValue in
            handleSizeClassChange(from: oldValue, to: newValue)
        }
        // Initialize collapsed sections from categories' isExpanded state
        .onChange(of: viewModel.categories) { _, _ in
            initializeCollapsedSections()
        }
        .onAppear {
            initializeCollapsedSections()
        }
        .sheet(isPresented: $showNewConversationSheet) {
            NewConversationView()
        }
        .sheet(isPresented: $showEmojiPicker) {
            EmojiPickerSheet(
                quickReactions: QuickReactionsConfig.extendedEmojis,
                onSelect: { emoji in
                    if let conversationId = emojiPickerConversationId {
                        Task {
                            await viewModel.setConversationReaction(conversationId, emoji: emoji)
                        }
                    }
                    showEmojiPicker = false
                    emojiPickerConversationId = nil
                }
            )
            .presentationDetents([.medium])
        }
        .sheet(item: $actionMenuConversation) { conversation in
            MeeshyBottomActionMenu(
                title: conversation.displayName,
                subtitle: conversationTypeLabel(for: conversation),
                actions: buildConversationActions(for: conversation),
                quickReactions: QuickReactionsConfig.defaultEmojis,
                onReaction: { emoji in
                    Task {
                        await viewModel.setConversationReaction(conversation.id, emoji: emoji)
                    }
                },
                onDismiss: {
                    actionMenuConversation = nil
                }
            )
        }
        // Meeshy Feed View (full screen avec swipe to dismiss)
        .fullScreenCover(isPresented: $showMeeshyFeed) {
            if let meeshy = meeshyConversation {
                MeeshyFeedView(
                    conversation: meeshy,
                    currentUserName: currentUserDisplayName,
                    isAnonymous: false
                )
            }
        }
    }

    // MARK: - Orientation Change Handler

    /// Handles transition between SplitView (landscape) and NavigationStack (portrait)
    /// Preserves the selected conversation across layout changes
    private func handleSizeClassChange(from oldValue: UserInterfaceSizeClass?, to newValue: UserInterfaceSizeClass?) {
        guard let newValue = newValue else { return }
        guard oldValue != nil else {
            // Initial load - just store the current class
            previousSizeClass = newValue
            return
        }

        // Only handle SplitView transitions on iPad
        guard UIDevice.current.userInterfaceIdiom == .pad else { return }

        if newValue == .compact && oldValue == .regular {
            // Transitioning from SplitView → NavigationStack (landscape → portrait)
            // If a conversation was selected in SplitView, push it onto the NavigationStack
            if let conversationId = selectedConversationId {
                // Use a slight delay to ensure the view hierarchy is ready
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    // Ensure we still have the same selection
                    if self.selectedConversationId == conversationId {
                        self.navigationPath = NavigationPath()
                        self.navigationPath.append(conversationId)
                    }
                }
            }
        } else if newValue == .regular && oldValue == .compact {
            // Transitioning from NavigationStack → SplitView (portrait → landscape)
            // Extract current conversation from navigation path if any
            if !navigationPath.isEmpty {
                // The selectedConversationId should already be set via onAppear
                // Just clear the navigation path
                navigationPath = NavigationPath()
            }
        }

        previousSizeClass = newValue
    }

    // MARK: - iPad Layout (NavigationSplitView)

    /// iPad uses NavigationSplitView for master-detail layout
    /// - Sidebar shows conversation list
    /// - Detail shows selected conversation or placeholder
    /// - Supports sidebar toggle via columnVisibility
    private var splitViewLayout: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            // SIDEBAR: Conversation list
            conversationListContent
                .navigationTitle(viewTitle)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        // Bouton Meeshy pour ouvrir la conversation avec l'assistant AI
                        Button(action: navigateToMeeshy) {
                            Image("MeeshyLogo")
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(width: 32, height: 32)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .disabled(meeshyConversation == nil)
                        .opacity(meeshyConversation == nil ? 0.5 : 1.0)
                    }
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button(action: { showNewConversationSheet = true }) {
                            Image(systemName: "square.and.pencil")
                                .foregroundColor(.meeshyPrimary)
                        }
                    }
                }
        } detail: {
            // DETAIL: Selected conversation or placeholder
            if let conversation = selectedConversation {
                ModernConversationView(
                    conversation: conversation,
                    onToggleSidebar: {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            columnVisibility = columnVisibility == .detailOnly ? .all : .detailOnly
                        }
                    },
                    isSidebarVisible: columnVisibility != .detailOnly,
                    isInSplitView: true, // Key: tells ModernConversationView we're in SplitView
                    initialDraft: viewModel.getDraft(for: conversation.id),
                    onDraftChanged: { text in
                        viewModel.saveDraft(for: conversation.id, text: text)
                    }
                )
                .id(conversation.id)
            } else {
                // Placeholder when no conversation selected
                SplitViewPlaceholder()
            }
        }
        .navigationSplitViewStyle(.balanced)
    }

    // MARK: - iPhone Layout (NavigationStack)

    /// iPhone uses standard NavigationStack with push navigation
    /// - Uses NavigationPath for state preservation across orientation changes
    /// - No sidebar toggle button needed
    /// - Standard back navigation
    private var stackViewLayout: some View {
        NavigationStack(path: $navigationPath) {
            conversationListContent
                .navigationTitle(viewTitle)
                .navigationDestination(for: String.self) { conversationId in
                    if let conversation = viewModel.conversations.first(where: { $0.id == conversationId }) {
                        ModernConversationView(
                            conversation: conversation,
                            onToggleSidebar: nil, // No sidebar on iPhone
                            isSidebarVisible: false,
                            isInSplitView: false, // Key: tells ModernConversationView we're NOT in SplitView
                            initialDraft: viewModel.getDraft(for: conversation.id),
                            onDraftChanged: { text in
                                viewModel.saveDraft(for: conversation.id, text: text)
                            }
                        )
                        .id(conversation.id)
                        .onAppear {
                            // Sync selectedConversationId when navigating in stack mode
                            selectedConversationId = conversationId
                        }
                        .onDisappear {
                            // Clear selection when going back (only if still on this conversation)
                            if selectedConversationId == conversationId {
                                selectedConversationId = nil
                            }
                        }
                    } else {
                        ProgressView("Chargement...")
                            .task {
                                await viewModel.loadConversationIfNeeded(conversationId)
                            }
                    }
                }
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        // Bouton Meeshy pour ouvrir la conversation avec l'assistant AI
                        Button(action: navigateToMeeshy) {
                            Image("MeeshyLogo")
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(width: 32, height: 32)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .disabled(meeshyConversation == nil)
                        .opacity(meeshyConversation == nil ? 0.5 : 1.0)
                    }
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button(action: { showNewConversationSheet = true }) {
                            Image(systemName: "square.and.pencil")
                                .foregroundColor(.meeshyPrimary)
                        }
                    }
                }
        }
    }

    // MARK: - Conversation List Content

    /// Safe area bottom inset for calculating proper positioning
    private var safeAreaBottom: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first?.safeAreaInsets.bottom ?? 0
    }

    /// Bottom padding for floating tab bar (when keyboard is hidden)
    private let tabBarBottomPadding: CGFloat = 90

    private var conversationListContent: some View {
        GeometryReader { geometry in
            ZStack(alignment: .bottom) {
                // Main content (scrollable area)
                Group {
                    // OPTIMISATION: Attendre que les données soient prêtes (structurées par catégorie)
                    // Cela évite le double rendu où tout apparaît dans "non catégorisé" puis se déplace
                    if (viewModel.isLoading && viewModel.conversations.isEmpty) || !viewModel.isDataReady {
                        loadingView
                    } else if let error = viewModel.errorMessage {
                        errorView(error: error)
                    } else if viewModel.conversations.isEmpty {
                        emptyView
                    } else if sections.isEmpty && !viewModel.searchQuery.isEmpty {
                        searchEmptyStateView
                    } else {
                        sectionsListView
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                // Floating Search Bar & Community Carousel - positioned at BOTTOM
                VStack(spacing: 8) { // Same spacing as search bar to keyboard
                    Spacer() // Push everything to bottom

                    // Community Carousel (appears ABOVE search bar when search is active)
                    if isSearchActive {
                        CommunityCarouselView(
                            cards: viewModel.communityCards,
                            selectedFilter: viewModel.selectedCommunityFilter,
                            onSelect: { filter in
                                viewModel.selectedCommunityFilter = filter
                                closeSearch()
                            },
                            onRefresh: {
                                await viewModel.refreshCommunities()
                            }
                        )
                        // Transparent background - no ultraThinMaterial
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    // Search Bar
                    searchBarView
                        .padding(.bottom, keyboardHeight > 0 ? 8 : tabBarBottomPadding)
                }
                .frame(maxWidth: .infinity)
                .padding(.bottom, keyboardHeight > 0 ? keyboardHeight - safeAreaBottom : 0)
                .animation(.easeOut(duration: 0.25), value: keyboardHeight)
                .animation(.easeInOut(duration: 0.25), value: isSearchActive)
            }
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .onReceive(keyboardWillShowPublisher) { height in
            keyboardHeight = height
        }
        .onReceive(keyboardWillHidePublisher) { _ in
            keyboardHeight = 0
        }
    }

    // MARK: - Keyboard Publishers

    private var keyboardWillShowPublisher: AnyPublisher<CGFloat, Never> {
        NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)
            .compactMap { notification -> CGFloat? in
                guard let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else {
                    return nil
                }
                return frame.height
            }
            .eraseToAnyPublisher()
    }

    private var keyboardWillHidePublisher: AnyPublisher<Void, Never> {
        NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)
            .map { _ in () }
            .eraseToAnyPublisher()
    }

    // MARK: - Search Bar View

    private var searchBarView: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary)
                .font(.system(size: 18))

            TextField("Rechercher une conversation...", text: $viewModel.searchQuery, onEditingChanged: { editing in
                withAnimation(.easeInOut(duration: 0.25)) {
                    isSearchActive = editing
                }
            })
            .textFieldStyle(.plain)
            .autocapitalization(.none)
            .autocorrectionDisabled()

            if !viewModel.searchQuery.isEmpty {
                Button {
                    viewModel.searchQuery = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                    .foregroundColor(.secondary)
                }
            }

            if isSearchActive {
                Button("Annuler") {
                    viewModel.searchQuery = ""
                    isSearchActive = false
                    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                }
                .foregroundColor(.meeshyPrimary)
                .fontWeight(.medium)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
        .cornerRadius(20)
        .shadow(color: Color.black.opacity(0.1), radius: 5, x: 0, y: 2)
        .padding(.horizontal, 16)
    }

    // MARK: - Sections List View

    private var sectionsListView: some View {
        List(selection: useSplitView ? $selectedConversationId : nil) {
            // 1. Pinned Section
            if let pinnedSection = sections.first(where: { $0.id == "pinned" }) {
                Section {
                    if !collapsedSections.contains(pinnedSection.id) {
                        ForEach(pinnedSection.conversations) { conversation in
                            conversationRow(for: conversation)
                        }
                    }
                } header: {
                    CollapsibleSectionHeader(
                        section: pinnedSection,
                        isCollapsed: collapsedSections.contains(pinnedSection.id),
                        onToggle: { toggleSection(pinnedSection.id) }
                    )
                }
            }
            
            // 2. Category Sections (Reorderable via drag and drop)
            let categorySections = sections.filter { $0.id != "pinned" && $0.id != "uncategorized" }

            ForEach(categorySections) { section in
                Section {
                    if !collapsedSections.contains(section.id) {
                        ForEach(section.conversations) { conversation in
                            conversationRow(for: conversation)
                        }
                    }
                } header: {
                    CollapsibleSectionHeader(
                        section: section,
                        isCollapsed: collapsedSections.contains(section.id),
                        onToggle: { toggleSection(section.id) },
                        isDraggable: true,
                        isBeingDragged: draggedCategoryId == section.id,
                        onDragStarted: {
                            draggedCategoryId = section.id
                        }
                    )
                    .onDrop(of: [.text], isTargeted: nil) { providers in
                        guard let provider = providers.first else { return false }

                        provider.loadObject(ofClass: NSString.self) { item, _ in
                            guard let droppedId = item as? String,
                                  droppedId != section.id else { return }

                            DispatchQueue.main.async {
                                reorderCategory(draggedId: droppedId, targetId: section.id, sections: categorySections)
                                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                                draggedCategoryId = nil
                            }
                        }
                        return true
                    }
                }
            }
            
            // 3. Uncategorized Section
            if let uncategorizedSection = sections.first(where: { $0.id == "uncategorized" }) {
                Section {
                    if !collapsedSections.contains(uncategorizedSection.id) {
                        ForEach(uncategorizedSection.conversations) { conversation in
                            conversationRow(for: conversation)
                        }
                    }
                } header: {
                    CollapsibleSectionHeader(
                        section: uncategorizedSection,
                        isCollapsed: collapsedSections.contains(uncategorizedSection.id),
                        onToggle: { toggleSection(uncategorizedSection.id) }
                    )
                }
            }

            // 4. Pagination Footer (auto-load on scroll to bottom + manual button)
            Section {
                if viewModel.hasMoreForCurrentFilter {
                    VStack(spacing: 12) {
                        // Loading indicator - triggers load when appearing
                        HStack {
                            Spacer()
                            if viewModel.isLoadingMore || viewModel.isLoadingCommunity {
                                ProgressView()
                                    .scaleEffect(0.8)
                                Text("Chargement...")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(.secondary)
                            } else {
                                ProgressView()
                                    .scaleEffect(0.7)
                                    .opacity(0.6)
                            }
                            Spacer()
                        }
                        .onAppear {
                            // Auto-load next page when this view appears
                            Task {
                                if case .community = viewModel.selectedCommunityFilter {
                                    await viewModel.loadMoreCommunityConversations()
                                } else {
                                    await viewModel.loadMoreConversations()
                                }
                            }
                        }

                        // Manual load button (fallback if auto-load doesn't trigger)
                        Button {
                            Task {
                                if case .community = viewModel.selectedCommunityFilter {
                                    await viewModel.loadMoreCommunityConversations()
                                } else {
                                    await viewModel.loadMoreConversations()
                                }
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "arrow.down.circle.fill")
                                    .font(.system(size: 16))
                                Text(loadMoreButtonText)
                                    .font(.system(size: 13, weight: .medium))
                            }
                            .foregroundColor(.meeshyPrimary)
                            .padding(.vertical, 8)
                            .padding(.horizontal, 16)
                            .background(
                                RoundedRectangle(cornerRadius: 20)
                                    .fill(Color.meeshyPrimary.opacity(0.1))
                            )
                        }
                        .disabled(viewModel.isLoadingMore || viewModel.isLoadingCommunity)
                        .opacity((viewModel.isLoadingMore || viewModel.isLoadingCommunity) ? 0.5 : 1.0)
                    }
                    .padding(.vertical, 12)
                } else {
                    // All conversations loaded indicator
                    VStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 24))
                            .foregroundColor(.green.opacity(0.7))
                        Text(allLoadedText)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.secondary)
                        Text("\(viewModel.filteredConversations.count) conversations")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary.opacity(0.7))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 20)
                }
            }
            .listRowBackground(Color.clear)

            // Spacer for floating UI
            Color.clear
                .frame(height: 140)
                .listRowBackground(Color.clear)
        }
        .listStyle(.insetGrouped)
        .animation(.easeInOut(duration: 0.25), value: collapsedSections)
    }

    // MARK: - Conversation Row

    @ViewBuilder
    private func conversationRow(for conversation: Conversation) -> some View {
        NavigationLink(value: conversation.id) {
            ConversationRowView(conversation: conversation, currentUserId: currentUserId)
        }
        // Long press to show bottom action menu (simultaneousGesture allows NavigationLink tap to work)
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.5)
                .onEnded { _ in
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    actionMenuConversation = conversation
                }
        )
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                Task { await viewModel.deleteConversation(conversation.id) }
            } label: {
                Label("Supprimer", systemImage: "trash")
            }

            Button {
                Task { await viewModel.archiveConversation(conversation.id) }
            } label: {
                Label("Archiver", systemImage: "archivebox")
            }
            .tint(.blue)

            Button {
                Task {
                    if conversation.isMuted {
                        await viewModel.unmuteConversation(conversation.id)
                    } else {
                        await viewModel.muteConversation(conversation.id)
                    }
                }
            } label: {
                Label(
                    conversation.isMuted ? "Activer" : "Muet",
                    systemImage: conversation.isMuted ? "bell" : "bell.slash"
                )
            }
            .tint(.purple)
        }
        .swipeActions(edge: .leading) {
            Button {
                Task {
                    if conversation.isPinned {
                        await viewModel.unpinConversation(conversation.id)
                    } else {
                        await viewModel.pinConversation(conversation.id)
                    }
                }
            } label: {
                Label(
                    conversation.isPinned ? "Désépingler" : "Épingler",
                    systemImage: conversation.isPinned ? "pin.slash" : "pin"
                )
            }
            .tint(.orange)
        }
    }


    // MARK: - Conversation Type Label

    /// Returns a localized label for the conversation type
    private func conversationTypeLabel(for conversation: Conversation) -> String {
        switch conversation.type {
        case .direct, .oneOnOne:
            return "Conversation directe"
        case .group:
            return "Groupe"
        case .community:
            return "Communauté"
        case .announcement:
            return "Annonce"
        case .public:
            return "Public"
        case .global:
            return "Global"
        }
    }

    // MARK: - Build Conversation Actions

    /// Build actions for the bottom action menu with hybrid layout (compact grid + full list)
    private func buildConversationActions(for conversation: Conversation) -> [MeeshyActionItem] {
        var actions: [MeeshyActionItem] = []

        // --- COMPACT ACTIONS (Grid) ---

        // Pin/Unpin
        actions.append(MeeshyActionItem(
            icon: conversation.isPinned ? "pin.slash.fill" : "pin.fill",
            title: conversation.isPinned ? "Désépingler" : "Épingler",
            displayStyle: .compact,
            accentColor: .orange
        ) {
            Task {
                if conversation.isPinned {
                    await viewModel.unpinConversation(conversation.id)
                } else {
                    await viewModel.pinConversation(conversation.id)
                }
            }
        })

        // Mark as read (if has unread)
        if conversation.hasUnread {
            actions.append(MeeshyActionItem(
                icon: "checkmark.circle.fill",
                title: "Lu",
                displayStyle: .compact,
                accentColor: .green
            ) {
                Task { await viewModel.markConversationAsRead(conversation.id) }
            })
        }

        // Mute/Unmute
        actions.append(MeeshyActionItem(
            icon: conversation.isMuted ? "bell.fill" : "bell.slash.fill",
            title: conversation.isMuted ? "Activer" : "Muet",
            displayStyle: .compact,
            accentColor: .purple
        ) {
            Task {
                if conversation.isMuted {
                    await viewModel.unmuteConversation(conversation.id)
                } else {
                    await viewModel.muteConversation(conversation.id)
                }
            }
        })

        // Archive
        let isArchived = conversation.userPreferences?.isArchived ?? conversation.preferences?.isArchived ?? false
        actions.append(MeeshyActionItem(
            icon: isArchived ? "tray.and.arrow.up.fill" : "archivebox.fill",
            title: isArchived ? "Restaurer" : "Archiver",
            displayStyle: .compact,
            accentColor: .blue
        ) {
            Task { await viewModel.archiveConversation(conversation.id) }
        })

        // Category (if not uncategorized)
        actions.append(MeeshyActionItem(
            icon: "folder.fill",
            title: "Catégorie",
            displayStyle: .compact,
            accentColor: .indigo
        ) {
            // TODO: Show category picker
        })

        // More emoji reactions
        actions.append(MeeshyActionItem(
            icon: "face.smiling.fill",
            title: "Plus",
            displayStyle: .compact,
            accentColor: .cyan
        ) {
            emojiPickerConversationId = conversation.id
            showEmojiPicker = true
        })

        // --- FULL ACTIONS (List) ---

        // Delete (destructive)
        actions.append(MeeshyActionItem(
            icon: "trash.fill",
            title: "Supprimer",
            subtitle: "Supprimer cette conversation",
            style: .destructive,
            displayStyle: .full
        ) {
            Task { await viewModel.deleteConversation(conversation.id) }
        })

        return actions
    }

    // MARK: - State Views

    private var loadingView: some View {
        VStack {
            Spacer()
            ProgressView("Chargement des conversations...")
            Spacer()
        }
    }

    private func errorView(error: String) -> some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundColor(.orange)
            Text("Erreur de chargement")
                .font(.headline)
            Text(error)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            Button("Réessayer") {
                Task { await viewModel.refreshConversations() }
            }
            .buttonStyle(.borderedProminent)
            Spacer()
        }
        .padding()
    }

    private var emptyView: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 64))
                .foregroundColor(.gray.opacity(0.5))
            Text("Aucune conversation")
                .font(.headline)
                .foregroundColor(.secondary)
            Text("Créez une nouvelle conversation pour commencer à discuter")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            Button(action: { showNewConversationSheet = true }) {
                Label("Nouvelle conversation", systemImage: "plus.circle.fill")
            }
            .buttonStyle(.borderedProminent)
            Spacer()
        }
        .padding()
    }

    private var searchEmptyStateView: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "magnifyingglass")
                .font(.system(size: 64))
                .foregroundColor(.gray.opacity(0.5))
            Text("Aucun résultat")
                .font(.headline)
                .foregroundColor(.secondary)
            Text("Essayez avec d'autres mots-clés")
                .font(.subheadline)
                .foregroundColor(.secondary)
            Spacer()
        }
    }

    // MARK: - Methods

    private func toggleSection(_ sectionId: String) {
        let isCurrentlyCollapsed = collapsedSections.contains(sectionId)
        let willBeExpanded = isCurrentlyCollapsed

        withAnimation(.easeInOut(duration: 0.25)) {
            if isCurrentlyCollapsed {
                collapsedSections.remove(sectionId)
            } else {
                collapsedSections.insert(sectionId)
            }
        }

        // Sync with backend for category sections (not pinned/uncategorized)
        if sectionId != "pinned" && sectionId != "uncategorized" {
            Task {
                await syncCategoryExpandedState(categoryId: sectionId, isExpanded: willBeExpanded)
            }
        }
    }

    /// Sync category expanded state with backend
    private func syncCategoryExpandedState(categoryId: String, isExpanded: Bool) async {
        do {
            let request = UserConversationCategoryUpdateRequest(
                name: nil,
                color: nil,
                icon: nil,
                order: nil,
                isExpanded: isExpanded
            )
            _ = try await CategoryService.shared.updateCategory(id: categoryId, request: request)
        } catch {
            // Log error but don't revert UI - user can still see local state
            print("[ConversationListView] Failed to sync category expanded state: \(error.localizedDescription)")
        }
    }

    /// Initialize collapsed sections from categories' isExpanded state
    private func initializeCollapsedSections() {
        var collapsed = Set<String>()
        for category in viewModel.categories {
            print("📂 [FOLD/UNFOLD] Category '\(category.name)' isExpanded: \(category.isExpanded)")
            if !category.isExpanded {
                collapsed.insert(category.id)
            }
        }
        print("📂 [FOLD/UNFOLD] Collapsed sections: \(collapsed.count) categories folded")
        // Only update if different to avoid unnecessary state changes
        if collapsed != collapsedSections {
            collapsedSections = collapsed
        }
    }

    /// Reorder a category by moving it to the position of another category
    private func reorderCategory(draggedId: String, targetId: String, sections: [ConversationSection]) {
        // Find indices in the current sections array
        guard let draggedIndex = sections.firstIndex(where: { $0.id == draggedId }),
              let targetIndex = sections.firstIndex(where: { $0.id == targetId }) else {
            draggedCategoryId = nil
            return
        }

        // Map sections to categories
        let displayedCategories = sections.compactMap { section in
            viewModel.categories.first(where: { $0.id == section.id })
        }

        // Calculate the new offset for moveCategory
        // If dragging down, insert after target; if dragging up, insert before target
        let newOffset = targetIndex > draggedIndex ? targetIndex + 1 : targetIndex

        // Use the existing moveCategory function which handles local update and backend sync
        viewModel.moveCategory(
            from: IndexSet(integer: draggedIndex),
            to: newOffset,
            displayedCategories: displayedCategories
        )

        // Clear dragged state with haptic feedback
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        draggedCategoryId = nil
    }

    // MARK: - Helpers

    private func closeSearch() {
        viewModel.searchQuery = ""
        isSearchActive = false
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

// MARK: - Conversation Section Model

struct ConversationSection: Identifiable {
    let id: String
    let title: String
    let icon: String
    let color: Color
    let order: Int
    let conversations: [Conversation]

    var conversationCount: Int { conversations.count }
    var unreadCount: Int { conversations.reduce(0) { $0 + $1.unreadCount } }
}

// MARK: - Collapsible Section Header

struct CollapsibleSectionHeader: View {
    let section: ConversationSection
    let isCollapsed: Bool
    let onToggle: () -> Void
    var isDraggable: Bool = false
    var isBeingDragged: Bool = false
    var onDragStarted: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 8) {
            // Drag handle (only for draggable sections) - with its own drag gesture
            if isDraggable {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.secondary)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
                    .onDrag {
                        onDragStarted?()
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        return NSItemProvider(object: section.id as NSString)
                    } preview: {
                        // Drag preview
                        HStack(spacing: 8) {
                            Image(systemName: section.icon)
                                .foregroundColor(section.color)
                            Text(section.title)
                                .font(.system(size: 13, weight: .bold))
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(section.color.opacity(0.3))
                        .cornerRadius(8)
                    }
            }

            // Toggle button for expand/collapse
            Button(action: onToggle) {
                HStack(spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(section.color.opacity(0.15))
                            .frame(width: 32, height: 32)

                        Image(systemName: section.icon)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(section.color)
                    }

                    Text(section.title)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.primary)
                        .tracking(0.5)

                    Text("\(section.conversationCount)")
                        .font(.caption2)
                        .fontWeight(.medium)
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(section.color.opacity(0.8)))

                    if section.unreadCount > 0 {
                        Text("\(section.unreadCount)")
                            .font(.caption2)
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.red))
                    }

                    Spacer()

                    Image(systemName: isCollapsed ? "chevron.right" : "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.secondary)
                        .animation(.easeInOut(duration: 0.2), value: isCollapsed)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 4)
        .opacity(isBeingDragged ? 0.5 : 1.0)
    }
}

// MARK: - SplitView Placeholder (iPad only)

/// Placeholder shown in the detail pane when no conversation is selected
/// Only used in NavigationSplitView (iPad) mode
struct SplitViewPlaceholder: View {
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "message.fill")
                .font(.system(size: 64))
                .foregroundColor(.meeshyPrimary.opacity(0.6))

            Text("Bienvenue sur Meeshy")
                .font(.title2)
                .fontWeight(.bold)

            Text("Sélectionnez une conversation dans la liste pour commencer")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
    }
}

// MARK: - Preview

#Preview("Conversation List") {
    ConversationListView()
}
