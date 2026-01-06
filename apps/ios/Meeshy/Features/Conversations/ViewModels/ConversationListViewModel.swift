//
//  ConversationListViewModel.swift
//  Meeshy
//
//  Manages conversation list state with category grouping
//  UPDATED: Uses GlobalConversationManager for real-time sync
//  iOS 16+
//
//  FEATURES:
//  - Category-based grouping with drag-to-reorder
//  - Sorting: Categories by order, conversations by lastMessageAt
//  - Real-time WebSocket updates via GlobalConversationManager
//  - Search and filtering
//  - In-memory caching
//

import Foundation
import SwiftUI
import Combine

// MARK: - Built-in Filter Category

enum ConversationListFilter: String, CaseIterable, Identifiable {
    case all = "All"
    case unread = "Unread"
    case pinned = "Pinned"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .all: return "bubble.left.and.bubble.right"
        case .unread: return "envelope.badge"
        case .pinned: return "pin.fill"
        }
    }

    var displayName: String {
        switch self {
        case .all: return "Toutes"
        case .unread: return "Non lues"
        case .pinned: return "Épinglées"
        }
    }
}

// MARK: - Community Info (extracted from conversations)

struct CommunityInfo: Identifiable, Hashable {
    let id: String
    let name: String
    let avatar: String?
    var conversationCount: Int
    var memberCount: Int
    var color: Color

    static func == (lhs: CommunityInfo, rhs: CommunityInfo) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - Conversation List ViewModel

@MainActor
final class ConversationListViewModel: ObservableObject {

    // MARK: - Published Properties

    /// Tracks if initial load has been attempted (to avoid duplicate loads)
    @Published private(set) var hasAttemptedInitialLoad: Bool = false

    /// OPTIMISATION: Flag pour indiquer que les données sont prêtes à être affichées
    /// Évite le double rendu où tout apparaît dans "non catégorisé" puis se déplace
    @Published private(set) var isDataReady: Bool = false

    /// All conversations (sorted by lastMessageAt)
    @Published private(set) var conversations: [Conversation] = []

    /// Filtered conversations based on search and filter
    @Published private(set) var filteredConversations: [Conversation] = []

    /// Pinned conversations (always at top)
    @Published private(set) var pinnedConversations: [Conversation] = []

    /// Unpinned conversations
    @Published private(set) var unpinnedConversations: [Conversation] = []

    /// User categories (sorted by order)
    /// PERFORMANCE FIX: Uses custom setter to invalidate sortedCategories cache
    @Published private(set) var categories: [UserConversationCategory] = [] {
        didSet {
            // Invalidate cache when categories change
            _sortedCategoriesCache = nil
        }
    }

    /// Conversations grouped by category ID (nil = uncategorized)
    @Published private(set) var conversationsByCategory: [String?: [Conversation]] = [:]

    /// Communities extracted from conversations
    @Published private(set) var communities: [CommunityInfo] = []
    
    /// Communities fetched from API
    @Published private(set) var communitiesList: [Community] = []


    /// Conversations grouped by community ID (nil = no community)
    @Published private(set) var conversationsByCommunity: [String?: [Conversation]] = [:]

    /// Current pagination state
    @Published private(set) var paginationState: PaginationState = .idle

    /// Whether there are more pages to load
    @Published private(set) var hasMorePages: Bool = true

    /// Total unread count across all conversations
    @Published private(set) var unreadCount: Int = 0

    /// Search query
    @Published var searchQuery: String = ""

    /// Selected filter
    @Published var selectedFilter: ConversationListFilter = .all

    /// Selected Community Filter (Carousel)
    @Published var selectedCommunityFilter: CommunityFilterType = .all

    /// Community Cards for Carousel
    @Published private(set) var communityCards: [CommunityCardData] = []


    /// Selected category (nil = show all)
    @Published var selectedCategory: UserConversationCategory?

    /// Error message if any
    @Published private(set) var errorMessage: String?

    /// UI State flags
    @Published var showingNewConversation: Bool = false
    @Published var showingSearch: Bool = false
    @Published var showingCommunityCarousel: Bool = false
    
    /// Drafts for conversations (conversationId -> draft text)
    @Published var drafts: [String: String] = [:]

    // MARK: - Convenience Computed Properties

    var isLoading: Bool { paginationState == .loading }
    var isLoadingMore: Bool { paginationState == .loadingMore }
    var isRefreshing: Bool { paginationState == .refreshing }
    var hasError: Bool { errorMessage != nil }

    /// Check if the current filter has more conversations to load
    /// For community filters: compare community's expected count with displayed count
    /// For "all": use standard hasMorePages
    var hasMoreForCurrentFilter: Bool {
        switch selectedCommunityFilter {
        case .all:
            return hasMorePages
        case .archived:
            // Archived uses local filtering, no more to load from API
            return false
        case .reacted:
            // Reacted (favorites) uses local filtering, no more to load from API
            return false
        case .community(let communityId):
            // Check if community has more conversations than currently displayed
            guard let communityCard = communityCards.first(where: {
                if case .community(let id) = $0.type { return id == communityId }
                return false
            }) else {
                return false
            }
            let expectedCount = communityCard.conversationCount
            let displayedCount = filteredConversations.count
            return displayedCount < expectedCount
        }
    }

    /// Track loading state for community-specific fetches
    @Published private(set) var isLoadingCommunity: Bool = false
    
    // MARK: - Drafts
    
    func saveDraft(for conversationId: String, text: String) {
        if text.isEmpty {
            drafts.removeValue(forKey: conversationId)
        } else {
            drafts[conversationId] = text
        }
    }
    
    func getDraft(for conversationId: String) -> String {
        return drafts[conversationId] ?? ""
    }

    /// PERFORMANCE FIX: Cached sorted categories to avoid O(n log n) on every access
    /// Invalidated when categories change
    private var _sortedCategoriesCache: [UserConversationCategory]?

    /// Categories sorted by order, then alphabetically
    /// Logic: Categories with order > 0 come first (sorted by order)
    ///        Categories with order == 0 come last (sorted alphabetically)
    /// PERFORMANCE FIX: Result is cached to avoid repeated sorting
    var sortedCategories: [UserConversationCategory] {
        if let cached = _sortedCategoriesCache {
            return cached
        }
        let sorted = categories.sorted { cat1, cat2 in
            let order1 = cat1.order
            let order2 = cat2.order

            // Both have order > 0
            if order1 > 0 && order2 > 0 {
                if order1 != order2 {
                    return order1 < order2
                }
                return cat1.name.localizedCaseInsensitiveCompare(cat2.name) == .orderedAscending
            }

            // One has order, one doesn't (0)
            if order1 > 0 && order2 == 0 {
                return true // cat1 comes first
            }
            if order1 == 0 && order2 > 0 {
                return false // cat2 comes first
            }

            // Both are unordered (0) -> Sort alphabetically
            return cat1.name.localizedCaseInsensitiveCompare(cat2.name) == .orderedAscending
        }
        _sortedCategoriesCache = sorted
        return sorted
    }

    // MARK: - Private Properties

    private let conversationService: ConversationService
    private let communityService: CommunityService
    private let categoryService: CategoryService
    private let webSocketService: WebSocketService
    private var cancellables = Set<AnyCancellable>()
    private var currentUserId: String?

    // Pagination state - REMOVED LIMIT: Load all conversations without artificial limit
    private var currentPage: Int = 1
    private var pageSize: Int { PaginationConfig.conversationsPerPage }  // Use centralized config

    // MARK: - Initialization

    init(
        conversationService: ConversationService = ConversationService.shared,
        communityService: CommunityService = CommunityService.shared,
        categoryService: CategoryService = CategoryService.shared,
        webSocketService: WebSocketService = WebSocketService.shared
    ) {
        self.conversationService = conversationService
        self.communityService = communityService
        self.categoryService = categoryService
        self.webSocketService = webSocketService

        // Get current user ID
        if let user = AuthenticationManager.shared.currentUser {
            self.currentUserId = user.id
        }

        // CRITICAL FIX: Check if DataManager already has structured data (from splash screen)
        // If so, use it IMMEDIATELY to avoid the flash where everything shows as "uncategorized"
        // This is SYNCHRONOUS - no await needed because we're on MainActor
        if DataManager.shared.isFullyStructured && !DataManager.shared.conversations.isEmpty {
            let cachedConversations = DataManager.shared.conversations
            let cachedCategories = DataManager.shared.categories
            let cachedGrouping = DataManager.shared.conversationsByCategory

            chatLogger.info("ConversationListVM: INIT with pre-structured data - \(cachedConversations.count) conversations, \(cachedCategories.count) categories")

            // Set data IMMEDIATELY (synchronously)
            self.conversations = cachedConversations.sorted { $0.lastMessageAt > $1.lastMessageAt }
            self.categories = cachedCategories
            self.conversationsByCategory = cachedGrouping
            // CRITICAL: Load communities from cache for carousel tiles
            self.communitiesList = DataManager.shared.communities
            // CRITICAL FIX: Toujours considérer qu'il y a plus de pages depuis le cache
            // Le vrai hasMorePages sera déterminé par le refresh backend en arrière-plan
            // Cela évite le problème où l'app pense avoir tout chargé alors qu'il y a plus
            self.hasMorePages = true  // Sera mis à false après le refresh backend
            self.currentPage = 1
            self.hasAttemptedInitialLoad = false  // Permettre le refresh en arrière-plan

            // Compute derived state
            self.pinnedConversations = cachedConversations
                .filter { $0.isPinned }
                .sorted { $0.lastMessageAt > $1.lastMessageAt }
            self.unpinnedConversations = cachedConversations
                .filter { !$0.isPinned }
                .sorted { $0.lastMessageAt > $1.lastMessageAt }
            self.filteredConversations = cachedConversations.sorted { $0.lastMessageAt > $1.lastMessageAt }
            self.unreadCount = cachedConversations.reduce(0) { $0 + $1.unreadCount }

            // CRITICAL: Generate community cards for carousel tiles
            self.computeAllDerivedState()

            // CRITICAL: Set isDataReady = true IMMEDIATELY so UI doesn't flash loading state
            self.isDataReady = true
        }

        setupSearchListener()
        setupFilterListener()
        setupNotificationListeners()
        setupRealtimeListeners()
    }

    // MARK: - Public API: Data Loading

    /// Load ALL conversations and categories
    /// Call this when the view appears
    func loadInitialConversations() async {
        // Skip if already loading
        guard paginationState != .loading else {
            chatLogger.debug("ConversationListVM: Already loading, skipping")
            return
        }

        // CRITICAL FIX: Si on a des données en cache, les afficher IMMÉDIATEMENT
        // mais TOUJOURS lancer un refresh backend en arrière-plan pour avoir les données fraîches
        let hasCachedData = !conversations.isEmpty

        if hasCachedData && !hasAttemptedInitialLoad {
            chatLogger.info("ConversationListVM: Using cached data (\(conversations.count)) while refreshing from backend")
            hasAttemptedInitialLoad = true
            isDataReady = true

            // Lancer le refresh backend en arrière-plan
            Task {
                await refreshFromBackendInBackground()
            }
            return
        }

        // Si on a déjà tenté un chargement ET on a des données, ne pas recharger
        // (le refresh background a déjà été lancé)
        guard !hasAttemptedInitialLoad || conversations.isEmpty else {
            chatLogger.debug("ConversationListVM: Already loaded, skipping")
            return
        }

        chatLogger.info("ConversationListVM: Loading conversations (not pre-loaded by coordinator)")
        errorMessage = nil
        hasAttemptedInitialLoad = true

        // FAST PATH: Use DataManager cached data (already loaded by AppLaunchCoordinator)
        if DataManager.shared.isFullyStructured && !DataManager.shared.conversations.isEmpty {
            let cachedConversations = DataManager.shared.conversations
            chatLogger.info("ConversationListVM: Using \(cachedConversations.count) pre-loaded conversations from DataManager")

            // Use pre-computed data directly - NO RECALCULATION needed
            self.conversations = cachedConversations
            self.categories = DataManager.shared.categories
            self.conversationsByCategory = DataManager.shared.conversationsByCategory
            self.communitiesList = DataManager.shared.communities
            // CRITICAL FIX: Toujours supposer qu'il y a plus de pages depuis le cache
            self.hasMorePages = true
            self.currentPage = 1

            // Use optimized computation only for derived state not in DataManager
            computeAllDerivedState()

            // OPTIMISATION: Maintenant que tout est structuré, on peut afficher
            isDataReady = true

            // Join WebSocket rooms
            let conversationIds = cachedConversations.map { $0.id }
            webSocketService.joinConversations(conversationIds)

            // Fetch categories from API to get isExpanded state (for fold/unfold)
            Task { [weak self] in
                await self?.fetchCategoriesWithExpandedState()
            }

            // Background refresh
            Task.detached { [weak self] in
                await self?.refreshConversationsInBackground()
            }

            return
        }

        // OPTIMIZATION 2: Check AppCache memory cache (preloaded by SplashScreen)
        let memoryCached = await AppCache.conversations.getItems(forKey: "all")
        if !memoryCached.isEmpty {
            chatLogger.info("ConversationListVM: Using \(memoryCached.count) preloaded conversations from memory cache")

            // OPTIMISATION: Only set isDataReady = false if not already ready
            // This prevents flashing if init already set isDataReady = true
            let wasDataReadyAppCache = isDataReady
            if !wasDataReadyAppCache {
                isDataReady = false
            }

            // PERFORMANCE FIX: Sort once
            self.conversations = memoryCached.sorted { $0.lastMessageAt > $1.lastMessageAt }
            // CRITICAL FIX: Toujours supposer qu'il y a plus de pages depuis le cache
            // Le vrai hasMorePages sera determiné par le refresh backend
            self.hasMorePages = true
            self.currentPage = 1

            // Use categories from DataManager if available
            if DataManager.shared.isFullyStructured && !DataManager.shared.conversationsByCategory.isEmpty {
                self.categories = DataManager.shared.categories
                self.conversationsByCategory = DataManager.shared.conversationsByCategory
                chatLogger.info("ConversationListVM: Using pre-structured categories from DataManager (AppCache path)")
            } else if !DataManager.shared.categories.isEmpty {
                self.categories = DataManager.shared.categories
                chatLogger.info("ConversationListVM: Using cached categories from DataManager (AppCache path)")
            } else {
                self.categories = extractCategoriesFromConversations()
                chatLogger.info("ConversationListVM: Extracted categories from conversations (AppCache fallback)")
            }

            // PERFORMANCE FIX: Use optimized single-pass computation
            computeAllDerivedState()

            // OPTIMISATION: Maintenant que tout est structuré, on peut afficher
            isDataReady = true

            // Join WebSocket rooms for all cached conversations
            let conversationIds = memoryCached.map { $0.id }
            webSocketService.joinConversations(conversationIds)

            // Fetch categories from API to get isExpanded state (for fold/unfold)
            Task { [weak self] in
                await self?.fetchCategoriesWithExpandedState()
            }

            // Refresh in background (don't block UI)
            Task.detached { [weak self] in
                await self?.refreshConversationsInBackground()
            }

            return
        }

        // No cache available - show loading state and fetch from network
        paginationState = .loading
        isDataReady = false

        do {
            // Check if task was cancelled before starting
            try Task.checkCancellation()

            // PERFORMANCE FIX: Parallel API calls instead of sequential
            // This saves ~600-900ms by fetching all data concurrently
            async let conversationsTask = conversationService.fetchAllConversations()
            async let communitiesTask = communityService.fetchCommunities()
            async let categoriesTask = categoryService.fetchCategories()

            // Wait for all tasks to complete in parallel
            let (allConversations, communities, apiCategories) = try await (
                conversationsTask,
                communitiesTask,
                categoriesTask
            )

            // Check cancellation again after network calls
            try Task.checkCancellation()

            // PERFORMANCE FIX: Sort once at the beginning
            let sortedConversations = allConversations.sorted { $0.lastMessageAt > $1.lastMessageAt }
            self.conversations = sortedConversations
            // Use centralized pagination config
            let fetchedCount = allConversations.count
            self.hasMorePages = PaginationConfig.hasMorePages(receivedCount: fetchedCount)
            self.currentPage = PaginationConfig.currentPage(forTotalItems: fetchedCount)

            // Use API categories if available, otherwise extract from conversations
            if !apiCategories.isEmpty {
                self.categories = apiCategories
                chatLogger.info("📂 [CATEGORIES] Using \(apiCategories.count) categories from API")
            } else {
                let embeddedCategories = extractCategoriesFromConversations()
                self.categories = embeddedCategories
                chatLogger.info("📂 [CATEGORIES] Extracted \(embeddedCategories.count) embedded categories")
            }

            // Set communities
            self.communitiesList = communities

            // PERFORMANCE FIX: Single pass for all derived state
            computeAllDerivedState()

            chatLogger.info("ConversationListVM: Loaded \(allConversations.count) conversations, \(communities.count) communities (parallel fetch)")
            paginationState = .idle

            // OPTIMISATION: Maintenant que tout est structuré, on peut afficher
            isDataReady = true

            // Join WebSocket rooms for all conversations to receive real-time updates
            let conversationIds = allConversations.map { $0.id }

            // PERSIST: Save to fast JSON cache for instant startup next time
            Task.detached {
                await DataManager.shared.updateConversations(allConversations)
            }

        } catch is CancellationError {
            // Task was cancelled (view dismissed, navigation, etc.) - this is normal, not an error
            chatLogger.info("ConversationListVM: Loading cancelled (view lifecycle)")
            paginationState = .idle
            // Don't set errorMessage for cancellation
        } catch {
            // Check if this is a network cancellation error
            if let meeshyError = error as? MeeshyError,
               case .network(.cancelled) = meeshyError {
                chatLogger.info("ConversationListVM: Network request cancelled (view lifecycle)")
                paginationState = .idle
                // Don't set errorMessage for cancellation
            } else {
                chatLogger.error("ConversationListVM: Failed to load: \(error.localizedDescription)")
                errorMessage = error.localizedDescription
                paginationState = .error(error.localizedDescription)
            }
        }
    }

    /// Clear all local data (called when backend changes)
    func clearAllData() {
        chatLogger.info("ConversationListVM: Clearing all local data")
        conversations = []
        filteredConversations = []
        pinnedConversations = []
        unpinnedConversations = []
        categories = []
        conversationsByCategory = [:]
        communities = []
        communitiesList = []
        conversationsByCommunity = [:]
        communityCards = []
        paginationState = .idle
        hasMorePages = true
        hasAttemptedInitialLoad = false
        unreadCount = 0
        errorMessage = nil
        drafts = [:]
    }

    /// Refresh ALL conversations (pull-to-refresh)
    func refreshConversations() async {
        guard paginationState != .refreshing else {
            chatLogger.debug("ConversationListVM: Already refreshing, skipping")
            return
        }

        chatLogger.info("ConversationListVM: Refreshing ALL conversations")
        paginationState = .refreshing
        errorMessage = nil

        do {
            // Check if task was cancelled before starting
            try Task.checkCancellation()

            // PERFORMANCE FIX: Parallel fetch for refresh
            async let conversationsTask = conversationService.forceRefreshAllConversations()
            async let communitiesTask = communityService.fetchCommunities()

            let (allConversations, communities) = try await (conversationsTask, communitiesTask)

            // Check cancellation again after network call
            try Task.checkCancellation()

            // Sort once
            self.conversations = allConversations.sorted { $0.lastMessageAt > $1.lastMessageAt }
            // CORRECTION: Garder la possibilité de charger plus si l'API a plus de données
            // hasMorePages sera mis à jour lors du prochain loadMoreConversations()
            self.communitiesList = communities

            // Extract and merge categories
            let embeddedCategories = extractCategoriesFromConversations()
            if self.categories.isEmpty {
                self.categories = embeddedCategories
            } else {
                let existingIds = Set(self.categories.map { $0.id })
                let newCategories = embeddedCategories.filter { !existingIds.contains($0.id) }
                self.categories.append(contentsOf: newCategories)
            }

            // PERFORMANCE FIX: Use optimized single-pass computation
            computeAllDerivedState()

            chatLogger.info("ConversationListVM: Refreshed \(allConversations.count) conversations, \(communities.count) communities")
            paginationState = .idle

        } catch is CancellationError {
            // Task was cancelled - this is normal, not an error
            chatLogger.info("ConversationListVM: Refresh cancelled (view lifecycle)")
            paginationState = .idle
        } catch {
            // Check if this is a network cancellation error
            if let meeshyError = error as? MeeshyError,
               case .network(.cancelled) = meeshyError {
                chatLogger.info("ConversationListVM: Refresh request cancelled (view lifecycle)")
                paginationState = .idle
            } else {
                chatLogger.error("ConversationListVM: Refresh failed: \(error.localizedDescription)")
                errorMessage = error.localizedDescription
                paginationState = .idle
            }
        }
    }

    /// Refresh conversations from backend in background
    /// Cette méthode est appelée après avoir affiché les données du cache
    /// pour s'assurer qu'on a TOUTES les conversations fraîches du serveur
    private func refreshFromBackendInBackground() async {
        chatLogger.info("ConversationListVM: Starting background refresh from backend")

        do {
            // Appeler le service pour charger TOUTES les conversations
            let freshConversations = try await conversationService.forceRefreshAllConversations()

            chatLogger.info("ConversationListVM: Background refresh completed - \(freshConversations.count) conversations from backend")

            // Mettre à jour les données
            await MainActor.run {
                let previousCount = self.conversations.count
                self.mergeConversations(freshConversations)

                // CRITICAL: Mettre à jour hasMorePages basé sur le résultat
                // Si on a chargé toutes les conversations, hasMorePages = false
                self.hasMorePages = false  // Le service charge TOUT

                chatLogger.info("ConversationListVM: Background refresh merged - was \(previousCount), now \(self.conversations.count)")
            }

            // Sauvegarder dans le cache pour le prochain démarrage
            await DataManager.shared.updateConversations(freshConversations)
            await DataManager.shared.structureConversations()

        } catch {
            chatLogger.error("ConversationListVM: Background refresh failed: \(error.localizedDescription)")
            // Ne pas afficher d'erreur à l'utilisateur - c'est un refresh en arrière-plan
        }
    }

    /// Load more conversations (pagination)
    /// Charge 100 conversations supplementaires a partir de la page suivante
    func loadMoreConversations() async {
        guard paginationState != .loadingMore else {
            chatLogger.debug("ConversationListVM: Already loading more, skipping")
            return
        }

        guard hasMorePages else {
            chatLogger.debug("ConversationListVM: No more pages to load (hasMorePages=false)")
            return
        }

        let nextPage = currentPage + 1
        chatLogger.info("ConversationListVM: Loading page \(nextPage) (100 conversations)")
        paginationState = .loadingMore

        do {
            // Fetch les 100 prochaines conversations
            // BUGFIX: Utiliser ConversationEndpoints directement pour avoir acces a PaginatedAPIResponse
            let endpoint = ConversationEndpoints.fetchConversations(page: nextPage, limit: 100)
            let response: PaginatedAPIResponse<[Conversation]> = try await APIClient.shared.requestPaginated(endpoint)

            // Extraire les donnees de pagination
            let receivedConversations = response.data
            let receivedCount = receivedConversations.count

            // Use centralized pagination config for hasMore detection
            let backendHasMore = response.pagination?.hasMore ?? PaginationConfig.hasMorePages(receivedCount: receivedCount)

            chatLogger.info("ConversationListVM: API page \(nextPage): received \(receivedCount), backend hasMore: \(backendHasMore)")

            // Filtrer les doublons
            let existingIds = Set(conversations.map { $0.id })
            let uniqueNewConversations = receivedConversations.filter { !existingIds.contains($0.id) }

            // Mettre a jour currentPage SEULEMENT si on a reussi
            currentPage = nextPage

            // CRITICAL: Utiliser la valeur du backend
            hasMorePages = backendHasMore

            if uniqueNewConversations.isEmpty {
                chatLogger.info("ConversationListVM: No new unique conversations on page \(nextPage) (all \(receivedCount) were duplicates)")
                // Si on recoit des doublons mais le backend dit hasMore, continuer
                // Sinon, arreter
                if !backendHasMore {
                    hasMorePages = false
                }
            } else {
                // Ajouter les nouvelles conversations et re-trier
                conversations.append(contentsOf: uniqueNewConversations)
                conversations.sort { $0.lastMessageAt > $1.lastMessageAt }

                // Re-extraire les categories et recalculer l'etat derive
                let embeddedCategories = extractCategoriesFromConversations()
                self.categories = embeddedCategories
                computeAllDerivedState()

                // Rejoindre les rooms WebSocket pour les nouvelles conversations
                let newIds = uniqueNewConversations.map { $0.id }
                webSocketService.joinConversations(newIds)

                // Sauvegarder dans le cache
                Task.detached {
                    await DataManager.shared.updateConversations(self.conversations)
                }

                chatLogger.info("ConversationListVM: Added \(uniqueNewConversations.count) new conversations (total: \(conversations.count)), hasMorePages: \(hasMorePages)")
            }

            paginationState = .idle

        } catch {
            chatLogger.error("ConversationListVM: Failed to load page \(nextPage): \(error.localizedDescription)")
            // Ne PAS rollback currentPage car on n'a pas encore incremente
            paginationState = .idle
            // Ne pas afficher d'erreur a l'utilisateur pour le chargement additionnel
        }
    }

    /// Load more conversations for the currently selected community
    /// Fetches conversations from API that are not yet in cache
    func loadMoreCommunityConversations() async {
        // Only works for community filter
        guard case .community(let communityId) = selectedCommunityFilter else {
            chatLogger.debug("ConversationListVM: loadMoreCommunityConversations called but not in community filter")
            return
        }

        guard !isLoadingCommunity else {
            chatLogger.debug("ConversationListVM: Already loading community conversations")
            return
        }

        // Check if we need to load more
        guard hasMoreForCurrentFilter else {
            chatLogger.debug("ConversationListVM: All community conversations already loaded")
            return
        }

        chatLogger.info("ConversationListVM: Loading more conversations for community \(communityId)")
        isLoadingCommunity = true

        do {
            // Calculate how many we already have for this community
            let existingForCommunity = conversations.filter { $0.communityId == communityId }
            let page = (existingForCommunity.count / 100) + 1

            let response = try await communityService.fetchCommunityConversations(
                communityId: communityId,
                page: page,
                limit: 100
            )

            let newConversations = response.items

            // Filter out duplicates
            let existingIds = Set(conversations.map { $0.id })
            let uniqueNew = newConversations.filter { !existingIds.contains($0.id) }

            if !uniqueNew.isEmpty {
                // Append new conversations and resort
                conversations.append(contentsOf: uniqueNew)
                conversations.sort { $0.lastMessageAt > $1.lastMessageAt }

                // Update cache
                await DataManager.shared.updateConversations(conversations)

                // Recompute derived state
                computeAllDerivedState()

                chatLogger.info("ConversationListVM: Loaded \(uniqueNew.count) more community conversations (total: \(conversations.count))")
            } else {
                chatLogger.info("ConversationListVM: No new community conversations to load")
            }

            isLoadingCommunity = false

        } catch {
            chatLogger.error("ConversationListVM: Failed to load community conversations: \(error.localizedDescription)")
            isLoadingCommunity = false
        }
    }

    /// Refresh conversations in background without blocking UI
    /// Used after loading from cache to get fresh data
    private func refreshConversationsInBackground() async {
        chatLogger.info("ConversationListVM: Background refresh starting...")

        do {
            // PERFORMANCE FIX: Parallel fetch in background
            async let conversationsTask = conversationService.forceRefreshAllConversations()
            async let communitiesTask = communityService.fetchCommunities()

            let (freshConversations, communities) = try await (conversationsTask, communitiesTask)

            // Update on main thread with optimized computation
            await MainActor.run {
                self.conversations = freshConversations.sorted { $0.lastMessageAt > $1.lastMessageAt }
                // CORRECTION: Ne pas forcer hasMorePages = false, laisser la pagination continuer
                // Le backend déterminera s'il y a plus de pages lors du prochain loadMore
                self.communitiesList = communities

                // Re-extract categories (may have new ones)
                let embeddedCategories = extractCategoriesFromConversations()
                self.categories = embeddedCategories

                // PERFORMANCE FIX: Use optimized single-pass computation
                computeAllDerivedState()
            }

            chatLogger.info("ConversationListVM: Background refresh completed with \(freshConversations.count) conversations")

            // OPTIMISATION: Pré-charger les messages des conversations récentes en arrière-plan
            Task.detached(priority: .background) { [weak self] in
                await self?.prefetchRecentConversationMessages(conversations: freshConversations)
            }

        } catch {
            chatLogger.error("ConversationListVM: Background refresh failed: \(error.localizedDescription)")
            // Don't show error to user - they have cached data
        }
    }

    /// Pré-charge les messages des N conversations les plus récentes pour améliorer les temps de chargement
    /// Cette méthode s'exécute en arrière-plan sans bloquer l'UI
    private func prefetchRecentConversationMessages(conversations: [Conversation], count: Int = 5) async {
        let recentConversations = conversations.prefix(count)
        chatLogger.info("📦 [PREFETCH] Pré-chargement des messages pour \(recentConversations.count) conversations récentes...")

        for conversation in recentConversations {
            do {
                // Vérifier si les messages sont déjà en cache (async car MessageStore est un actor)
                let cachedMessages = await MessageStore.shared.loadMessages(conversationId: conversation.id, limit: 30)
                if cachedMessages.isEmpty {
                    // Pas de cache, charger depuis le réseau
                    let response = try await APIService.shared.fetchMessages(
                        conversationId: conversation.id,
                        page: 1,
                        limit: 30
                    )
                    // Sauvegarder en cache pour un accès rapide
                    await MessageStore.shared.saveMessages(response.messages)
                    chatLogger.debug("📦 [PREFETCH] Mis en cache \(response.messages.count) messages pour '\(conversation.displayName)'")
                } else {
                    chatLogger.debug("📦 [PREFETCH] Messages déjà en cache pour '\(conversation.displayName)' (\(cachedMessages.count))")
                }
            } catch {
                chatLogger.debug("📦 [PREFETCH] Échec du pré-chargement pour '\(conversation.displayName)': \(error.localizedDescription)")
                // Continue avec les autres conversations
            }

            // Petit délai pour ne pas surcharger le réseau
            try? await Task.sleep(nanoseconds: 100_000_000) // 0.1s
        }

        chatLogger.info("📦 [PREFETCH] Pré-chargement terminé pour \(recentConversations.count) conversations")
    }

    /// Check if should prefetch when item appears (API compatibility)
    func onConversationAppear(_ conversation: Conversation) async {}

    /// Retry after error
    func retry() async {
        errorMessage = nil
        await loadInitialConversations()
    }

    /// Load a specific conversation if not already in list
    /// Used when navigating directly to a conversation that might not be loaded yet
    func loadConversationIfNeeded(_ conversationId: String) async {
        // Check if already in list
        if conversations.contains(where: { $0.id == conversationId }) {
            chatLogger.debug("ConversationListVM: Conversation \(conversationId) already loaded")
            return
        }

        chatLogger.info("ConversationListVM: Loading conversation \(conversationId) on demand")

        do {
            let conversation = try await conversationService.getConversation(conversationId: conversationId)

            // Add to list and sort
            conversations.append(conversation)
            conversations.sort { $0.lastMessageAt > $1.lastMessageAt }

            updateDerivedState()
            groupConversationsByCategory()

            chatLogger.info("ConversationListVM: Loaded conversation \(conversationId) on demand")
        } catch {
            chatLogger.error("ConversationListVM: Failed to load conversation \(conversationId): \(error.localizedDescription)")
            // Don't set errorMessage here - the navigation destination will handle showing an error
        }
    }

    /// Refresh communities and recalculate carousel tiles (pull-down on carousel)
    func refreshCommunities() async {
        chatLogger.info("ConversationListVM: Refreshing communities...")
        do {
            // Re-fetch communities from API
            let communities = try await communityService.fetchCommunities()
            self.communitiesList = communities

            // Re-extract community info from conversations
            extractCommunities()

            // Regenerate carousel cards
            generateCommunityCards()

            chatLogger.info("ConversationListVM: Refreshed \(communities.count) communities, \(communityCards.count) cards")
        } catch {
            chatLogger.error("ConversationListVM: Failed to refresh communities: \(error.localizedDescription)")
            // Regenerate cards with existing data as fallback
            generateCommunityCards()
        }
    }

    // MARK: - Category Management

    /// Fetch categories from API to get the correct isExpanded state (for fold/unfold)
    /// This is called after loading cached conversations to update category states
    private func fetchCategoriesWithExpandedState() async {
        do {
            // Force refresh to ensure we get the latest isExpanded state from backend
            // CategoryService now handles disk caching automatically
            let apiCategories = try await categoryService.fetchCategories(forceRefresh: true)
            chatLogger.info("📂 [CATEGORIES] Fetched \(apiCategories.count) categories with isExpanded state (force refresh)")

            // Log each category's isExpanded state for debugging
            for cat in apiCategories {
                chatLogger.debug("📂 Category '\(cat.name)' isExpanded: \(cat.isExpanded)")
            }

            // Replace embedded categories with API categories (which have correct isExpanded)
            if !apiCategories.isEmpty {
                // Update DataManager's categories (this also updates disk cache)
                await DataManager.shared.updateCategories(apiCategories)

                await MainActor.run {
                    self.categories = apiCategories
                    self.groupConversationsByCategory()
                }
                chatLogger.info("📂 [CATEGORIES] Updated categories with isExpanded states from API and disk cache")
            }
        } catch {
            chatLogger.warn("📂 [CATEGORIES] Failed to fetch categories: \(error.localizedDescription)")
            // Continue with cached categories (from disk or embedded) - isExpanded will be preserved
        }
    }

    /// Reorder categories (called after drag-and-drop)
    func reorderCategories(_ newOrder: [UserConversationCategory]) async {
        // Optimistic update
        categories = newOrder

        // TODO: Call API to persist order
        chatLogger.info("ConversationListVM: Reordered \(newOrder.count) categories (local only)")
    }
    
    /// Handle drag-and-drop reordering from the UI
    func moveCategory(from source: IndexSet, to destination: Int, displayedCategories: [UserConversationCategory]) {
        var updatedDisplayed = displayedCategories
        updatedDisplayed.move(fromOffsets: source, toOffset: destination)
        
        // Identify hidden categories (those not in displayedCategories)
        let displayedIds = Set(updatedDisplayed.map { $0.id })
        let hiddenCategories = categories.filter { !displayedIds.contains($0.id) }
        
        // Create final list: Displayed (in new order) + Hidden (in existing order)
        // We re-index everything starting from 1 to ensure consistency
        var finalCategories: [UserConversationCategory] = []
        var updates: [(id: String, order: Int)] = []
        
        // Process displayed categories
        for (index, category) in updatedDisplayed.enumerated() {
            let newOrder = index + 1
            let updatedCategory = category.withOrder(newOrder)
            finalCategories.append(updatedCategory)
            updates.append((id: category.id, order: newOrder))
        }
        
        // Process hidden categories (continue numbering)
        for (index, category) in hiddenCategories.enumerated() {
            let newOrder = updatedDisplayed.count + index + 1
            let updatedCategory = category.withOrder(newOrder)
            finalCategories.append(updatedCategory)
            updates.append((id: category.id, order: newOrder))
        }
        
        // Optimistic update
        self.categories = finalCategories
        
        // Persist changes
        Task {
            do {
                try await categoryService.reorderCategories(updates)
            } catch {
                chatLogger.error("Failed to reorder categories: \(error.localizedDescription)")
                // Revert on error? For now, just log.
            }
        }
    }

    /// Get conversations for a specific category
    func conversationsForCategory(_ category: UserConversationCategory) -> [Conversation] {
        conversationsByCategory[category.id] ?? []
    }

    /// Get uncategorized conversations
    var uncategorizedConversations: [Conversation] {
        conversationsByCategory[nil] ?? []
    }

    // MARK: - Public API: Conversation Operations

    func createConversation(memberIds: [String], type: ConversationType, title: String? = nil) async {
        do {
            let request = ConversationCreateRequest(
                identifier: nil,
                type: type,
                title: title,
                description: nil,
                avatar: nil,
                communityId: nil,
                memberIds: memberIds,
                isPrivate: nil
            )

            let newConversation = try await conversationService.createConversation(request: request)

            // Insert at beginning
            conversations.insert(newConversation, at: 0)
            updateDerivedState()

            chatLogger.info("Created new conversation: \(newConversation.id)")

        } catch {
            chatLogger.error("Error creating conversation: \(error)")
            errorMessage = error.localizedDescription
        }
    }

    func deleteConversation(_ conversationId: String) async {
        do {
            try await conversationService.deleteConversation(conversationId: conversationId)

            conversations.removeAll { $0.id == conversationId }
            updateDerivedState()

            chatLogger.info("Deleted conversation: \(conversationId)")

        } catch {
            chatLogger.error("Error deleting conversation: \(error)")
            errorMessage = error.localizedDescription
        }
    }

    func pinConversation(_ conversationId: String) async {
        do {
            try await conversationService.pinConversation(conversationId: conversationId)

            // Optimistic update
            if let index = conversations.firstIndex(where: { $0.id == conversationId }) {
                var updated = conversations[index]
                updated.isPinned = true
                conversations[index] = updated
                updateDerivedState()
            }

            chatLogger.info("Pinned conversation: \(conversationId)")

        } catch {
            chatLogger.error("Error pinning conversation: \(error)")
            errorMessage = error.localizedDescription
        }
    }

    func unpinConversation(_ conversationId: String) async {
        do {
            try await conversationService.unpinConversation(conversationId: conversationId)

            // Optimistic update
            if let index = conversations.firstIndex(where: { $0.id == conversationId }) {
                var updated = conversations[index]
                updated.isPinned = false
                conversations[index] = updated
                updateDerivedState()
            }

            chatLogger.info("Unpinned conversation: \(conversationId)")

        } catch {
            chatLogger.error("Error unpinning conversation: \(error)")
            errorMessage = error.localizedDescription
        }
    }

    func muteConversation(_ conversationId: String) async {
        do {
            try await conversationService.muteConversation(conversationId: conversationId)

            if let index = conversations.firstIndex(where: { $0.id == conversationId }) {
                var updated = conversations[index]
                updated.isMuted = true
                conversations[index] = updated
                updateDerivedState()
            }

            chatLogger.info("Muted conversation: \(conversationId)")

        } catch {
            chatLogger.error("Error muting conversation: \(error)")
            errorMessage = error.localizedDescription
        }
    }

    func unmuteConversation(_ conversationId: String) async {
        do {
            try await conversationService.unmuteConversation(conversationId: conversationId)

            if let index = conversations.firstIndex(where: { $0.id == conversationId }) {
                var updated = conversations[index]
                updated.isMuted = false
                conversations[index] = updated
                updateDerivedState()
            }

            chatLogger.info("Unmuted conversation: \(conversationId)")

        } catch {
            chatLogger.error("Error unmuting conversation: \(error)")
            errorMessage = error.localizedDescription
        }
    }

    func archiveConversation(_ conversationId: String) async {
        do {
            var request = ConversationUpdateRequest(conversationId: conversationId)
            request.isArchived = true

            _ = try await conversationService.updateConversation(request: request)

            // Remove from active list
            conversations.removeAll { $0.id == conversationId }
            updateDerivedState()

            chatLogger.info("Archived conversation: \(conversationId)")

        } catch {
            chatLogger.error("Error archiving conversation: \(error)")
            errorMessage = error.localizedDescription
        }
    }

    func markConversationAsRead(_ conversationId: String) async {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }) else {
            return
        }

        // Optimistic update
        var conversation = conversations[index]
        conversation.markAsRead()
        conversations[index] = conversation

        updateDerivedState()

        // Send to server
        Task {
            try? await conversationService.markAsRead(conversationId: conversationId)
        }
    }

    /// Set or toggle a reaction emoji on a conversation
    /// - Parameters:
    ///   - conversationId: The conversation ID
    ///   - emoji: The emoji to set (or nil to remove)
    func setConversationReaction(_ conversationId: String, emoji: String?) async {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }) else {
            return
        }

        // Save original conversation for rollback on failure
        let originalConversation = conversations[index]

        // Get current reaction
        var conversation = conversations[index]
        let currentReaction = conversation.userPreferences?.reaction ?? conversation.preferences?.reaction

        // Toggle logic: if same emoji, remove it; otherwise set new emoji
        let newReaction: String?
        if let current = currentReaction, current == emoji {
            newReaction = nil  // Remove reaction
        } else {
            newReaction = emoji
        }

        // Optimistic update using withReaction helper method
        if let userPrefs = conversation.userPreferences {
            // Use withReaction to create updated copy
            conversation.userPreferences = userPrefs.withReaction(newReaction)
        } else if let prefs = conversation.preferences {
            // Use withReaction to create updated copy
            conversation.preferences = prefs.withReaction(newReaction)
        } else {
            // Create new preferences if none exist
            let newPrefs = ConversationUserPreferences(
                reaction: newReaction
            )
            conversation.preferences = newPrefs
        }

        conversations[index] = conversation
        updateDerivedState()

        chatLogger.info("Set reaction '\(newReaction ?? "none")' on conversation: \(conversationId)")

        // Persist to server
        do {
            try await conversationService.setConversationReaction(conversationId: conversationId, emoji: newReaction)
            chatLogger.info("Successfully persisted reaction to server")
        } catch {
            chatLogger.error("Failed to persist reaction to server: \(error.localizedDescription)")
            // Revert optimistic update on failure - restore original conversation
            if let currentIndex = conversations.firstIndex(where: { $0.id == conversationId }) {
                conversations[currentIndex] = originalConversation
                updateDerivedState()
            }
        }
    }

    // MARK: - Private: State Management

    /// PERFORMANCE FIX: Compute all derived state in a single pass
    /// This replaces multiple calls to updateDerivedState(), groupConversationsByCategory(),
    /// extractCommunities(), and generateCommunityCards() with a single efficient pass
    private func computeAllDerivedState() {
        // SINGLE PASS: Compute all state in one iteration
        var pinned: [Conversation] = []
        var unpinned: [Conversation] = []
        var grouped: [String?: [Conversation]] = [:]
        var communityMap: [String: CommunityInfo] = [:]
        var communityGrouped: [String?: [Conversation]] = [:]
        var totalUnread = 0

        // Stats for community cards (computed in same pass)
        var allNonArchivedCount = 0
        var reactedNonArchivedCount = 0
        var archivedCount = 0
        var communityConversationCounts: [String: Int] = [:]

        let communityColors: [Color] = [
            .blue, .purple, .pink, .orange, .green, .teal, .indigo, .red, .cyan, .mint
        ]

        // Helper functions
        func isArchived(_ conv: Conversation) -> Bool {
            conv.isArchived ||
            (conv.userPreferences?.isArchived ?? false) ||
            (conv.preferences?.isArchived ?? false)
        }

        func hasReaction(_ conv: Conversation) -> Bool {
            (conv.userPreferences?.reaction != nil) || (conv.preferences?.reaction != nil)
        }

        // SINGLE ITERATION over all conversations
        for conversation in conversations {
            // 1. Pinned/Unpinned classification
            if conversation.isPinned {
                pinned.append(conversation)
            } else {
                unpinned.append(conversation)
            }

            // 2. Category grouping
            let categoryId = conversation.userPreferences?.categoryId ?? conversation.preferences?.category?.id
            if grouped[categoryId] == nil {
                grouped[categoryId] = []
            }
            grouped[categoryId]?.append(conversation)

            // 3. Community grouping and info extraction
            let communityId = conversation.communityId
            if communityGrouped[communityId] == nil {
                communityGrouped[communityId] = []
            }
            communityGrouped[communityId]?.append(conversation)

            if let id = communityId {
                if var info = communityMap[id] {
                    info.conversationCount += 1
                    info.memberCount += conversation.totalParticipantCount
                    communityMap[id] = info
                } else {
                    let name = conversation.title ?? "Communauté"
                    let colorIndex = communityMap.count % communityColors.count
                    communityMap[id] = CommunityInfo(
                        id: id,
                        name: name,
                        avatar: conversation.avatar,
                        conversationCount: 1,
                        memberCount: conversation.totalParticipantCount,
                        color: communityColors[colorIndex]
                    )
                }
            }

            // 4. Unread count
            totalUnread += conversation.unreadCount

            // 5. Stats for community cards
            let archived = isArchived(conversation)
            if archived {
                archivedCount += 1
            } else {
                allNonArchivedCount += 1
                if hasReaction(conversation) {
                    reactedNonArchivedCount += 1
                }
                if let cId = communityId {
                    communityConversationCounts[cId, default: 0] += 1
                }
            }
        }

        // NOTE: conversations is already sorted by lastMessageAt in caller
        // pinned/unpinned inherit that order, no re-sort needed

        // Assign computed state
        self.pinnedConversations = pinned
        self.unpinnedConversations = unpinned
        self.conversationsByCategory = grouped
        self.conversationsByCommunity = communityGrouped
        self.communities = Array(communityMap.values).sorted { $0.name < $1.name }
        self.unreadCount = totalUnread

        // Generate community cards (no additional iteration needed)
        var cards: [CommunityCardData] = []

        // All Card
        cards.append(CommunityCardData(
            id: "all",
            type: .all,
            title: "Toutes",
            image: nil,
            memberCount: nil,
            conversationCount: allNonArchivedCount,
            communityId: nil
        ))

        // Community Cards from API list
        for community in communitiesList {
            let count = community.conversationCount ?? communityConversationCounts[community.id] ?? 0
            cards.append(CommunityCardData(
                id: community.id,
                type: .community(community.id),
                title: community.name,
                image: community.avatar,
                memberCount: community.memberCount,
                conversationCount: count,
                communityId: community.id
            ))
        }

        // Reacted Card (only if > 0)
        if reactedNonArchivedCount > 0 {
            cards.append(CommunityCardData(
                id: "reacted",
                type: .reacted,
                title: "Favorites",
                image: nil,
                memberCount: nil,
                conversationCount: reactedNonArchivedCount,
                communityId: nil
            ))
        }

        // Archived Card
        cards.append(CommunityCardData(
            id: "archived",
            type: .archived,
            title: "Archivées",
            image: nil,
            memberCount: nil,
            conversationCount: archivedCount,
            communityId: nil
        ))

        self.communityCards = cards

        // Apply filters (uses optimized single-pass filtering)
        filterConversationsOptimized()
    }

    private func updateDerivedState() {
        // Update pinned/unpinned (sorted by last message date)
        pinnedConversations = conversations
            .filter { $0.isPinned }
            .sorted { $0.lastMessageAt > $1.lastMessageAt }

        unpinnedConversations = conversations
            .filter { !$0.isPinned }
            .sorted { $0.lastMessageAt > $1.lastMessageAt }

        // Apply filters
        filterConversations()

        // Update unread count
        unreadCount = conversations.reduce(0) { $0 + $1.unreadCount }
    }

    /// Extract categories from conversation preferences (like frontend does)
    /// This is a fallback when API doesn't return categories
    private func extractCategoriesFromConversations() -> [UserConversationCategory] {
        var categoryMap: [String: UserConversationCategory] = [:]

        for conversation in conversations {
            // Check userPreferences.category first
            if let category = conversation.userPreferences?.category, !categoryMap.keys.contains(category.id) {
                categoryMap[category.id] = category
            }

            // Also check preferences.category (ConversationCategory -> convert to UserConversationCategory)
            if let prefCategory = conversation.preferences?.category, !categoryMap.keys.contains(prefCategory.id) {
                // Convert ConversationCategory to UserConversationCategory
                let userCategory = UserConversationCategory(
                    id: prefCategory.id,
                    name: prefCategory.name,
                    color: prefCategory.color,
                    icon: prefCategory.icon,
                    order: prefCategory.order
                )
                categoryMap[prefCategory.id] = userCategory
            }
        }

        return Array(categoryMap.values).sorted { $0.order < $1.order }
    }

    /// Group conversations by their category ID
    /// Check both userPreferences.categoryId and preferences.category.id (API may return in either)
    private func groupConversationsByCategory() {
        var grouped: [String?: [Conversation]] = [:]

        for conversation in conversations {
            // Try userPreferences.categoryId first, then preferences.category.id
            let categoryId = conversation.userPreferences?.categoryId ?? conversation.preferences?.category?.id
            if grouped[categoryId] == nil {
                grouped[categoryId] = []
            }
            grouped[categoryId]?.append(conversation)
        }

        // Sort each category group by lastMessageAt (newest first)
        for (key, convs) in grouped {
            grouped[key] = convs.sorted { $0.lastMessageAt > $1.lastMessageAt }
        }

        conversationsByCategory = grouped
    }

    /// Extract communities from conversations and group by community
    private func extractCommunities() {
        var communityMap: [String: CommunityInfo] = [:]
        var grouped: [String?: [Conversation]] = [:]

        // Predefined colors for communities
        let communityColors: [Color] = [
            .blue, .purple, .pink, .orange, .green, .teal, .indigo, .red, .cyan, .mint
        ]

        for conversation in conversations {
            // Group by community
            let communityId = conversation.communityId
            if grouped[communityId] == nil {
                grouped[communityId] = []
            }
            grouped[communityId]?.append(conversation)

            // Extract community info
            if let id = communityId {
                if var info = communityMap[id] {
                    info.conversationCount += 1
                    // Accumulate member count
                    info.memberCount += conversation.totalParticipantCount
                    communityMap[id] = info
                } else {
                    // Create new community info
                    // Use conversation title as community name if direct community info not available
                    let name = conversation.title ?? "Communauté"
                    let colorIndex = communityMap.count % communityColors.count
                    communityMap[id] = CommunityInfo(
                        id: id,
                        name: name,
                        avatar: conversation.avatar,
                        conversationCount: 1,
                        memberCount: conversation.totalParticipantCount,
                        color: communityColors[colorIndex]
                    )
                }
            }
        }

        // Sort each community group by lastMessageAt
        for (key, convs) in grouped {
            grouped[key] = convs.sorted { $0.lastMessageAt > $1.lastMessageAt }
        }

        conversationsByCommunity = grouped
        communities = Array(communityMap.values).sorted { $0.name < $1.name }
    }

    private func filterConversations() {
        var result = conversations

        chatLogger.info("🎯 [FILTER] Filtering \(conversations.count) conversations with filter: \(selectedCommunityFilter)")

        // Helper to check if archived (check all sources)
        func isArchived(_ conv: Conversation) -> Bool {
            conv.isArchived ||
            (conv.userPreferences?.isArchived ?? false) ||
            (conv.preferences?.isArchived ?? false)
        }

        // Helper to check if has reaction (check both preference sources)
        func hasReaction(_ conv: Conversation) -> Bool {
            (conv.userPreferences?.reaction != nil) || (conv.preferences?.reaction != nil)
        }

        // Apply built-in filter
        switch selectedFilter {
        case .all:
            break
        case .unread:
            result = result.filter { $0.unreadCount > 0 }
        case .pinned:
            result = result.filter { $0.isPinned }
        }

        // Apply Community Filter
        switch selectedCommunityFilter {
        case .all:
            // Show all non-archived
            result = result.filter { !isArchived($0) }
        case .archived:
            // Show only archived
            result = result.filter { isArchived($0) }
        case .reacted:
            // Show reacted and non-archived
            result = result.filter { hasReaction($0) && !isArchived($0) }
        case .community(let communityId):
            // Show community conversations and non-archived
            result = result.filter { $0.communityId == communityId && !isArchived($0) }
        }

        chatLogger.info("🎯 [FILTER] After community filter: \(result.count) conversations")


        // Apply category filter (if a category is selected)
        // Check both userPreferences.categoryId and preferences.category.id
        if let category = selectedCategory {
            result = result.filter {
                ($0.userPreferences?.categoryId ?? $0.preferences?.category?.id) == category.id
            }
        }

        // Apply search filter
        if !searchQuery.isEmpty {
            let query = searchQuery.lowercased()
            result = result.filter { conversation in
                // Search by title
                if let title = conversation.title, title.lowercased().contains(query) {
                    return true
                }

                // Search by last message
                if let lastMessage = conversation.lastMessage,
                   lastMessage.content.lowercased().contains(query) {
                    return true
                }

                // Search by identifier
                if conversation.identifier.lowercased().contains(query) {
                    return true
                }

                return false
            }
        }

        // Sort by last message date (newest first)
        filteredConversations = result.sorted { $0.lastMessageAt > $1.lastMessageAt }

        // DEBUG: Log final filtered order
        chatLogger.info("📊 [FILTER DEBUG] === FILTERED CONVERSATIONS (displayed order) ===")
        for (index, conv) in filteredConversations.prefix(10).enumerated() {
            let dateFormatter = ISO8601DateFormatter()
            dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let dateStr = dateFormatter.string(from: conv.lastMessageAt)
            chatLogger.info("📊 [FILTER DEBUG] [\(index)] \(conv.displayName) | lastMessageAt: \(dateStr)")
        }
    }

    /// PERFORMANCE FIX: Optimized single-pass filtering
    /// Combines all filter checks into one iteration instead of chained filters
    private func filterConversationsOptimized() {
        // conversations is already sorted by lastMessageAt, so we preserve that order
        var result: [Conversation] = []
        result.reserveCapacity(conversations.count) // Pre-allocate for performance

        let query = searchQuery.lowercased()
        let hasSearchQuery = !query.isEmpty

        for conversation in conversations {
            // Helper checks
            let isArchivedConv = conversation.isArchived ||
                (conversation.userPreferences?.isArchived ?? false) ||
                (conversation.preferences?.isArchived ?? false)

            let hasReactionConv = (conversation.userPreferences?.reaction != nil) ||
                (conversation.preferences?.reaction != nil)

            // 1. Apply built-in filter (all/unread/pinned)
            switch selectedFilter {
            case .all:
                break // Pass all
            case .unread:
                guard conversation.unreadCount > 0 else { continue }
            case .pinned:
                guard conversation.isPinned else { continue }
            }

            // 2. Apply community filter
            switch selectedCommunityFilter {
            case .all:
                guard !isArchivedConv else { continue }
            case .archived:
                guard isArchivedConv else { continue }
            case .reacted:
                guard hasReactionConv && !isArchivedConv else { continue }
            case .community(let communityId):
                guard conversation.communityId == communityId && !isArchivedConv else { continue }
            }

            // 3. Apply category filter
            if let category = selectedCategory {
                let convCategoryId = conversation.userPreferences?.categoryId ?? conversation.preferences?.category?.id
                guard convCategoryId == category.id else { continue }
            }

            // 4. Apply search filter
            if hasSearchQuery {
                var matches = false

                // Search by title
                if let title = conversation.title, title.lowercased().contains(query) {
                    matches = true
                }

                // Search by last message
                if !matches, let lastMessage = conversation.lastMessage,
                   lastMessage.content.lowercased().contains(query) {
                    matches = true
                }

                // Search by identifier
                if !matches, conversation.identifier.lowercased().contains(query) {
                    matches = true
                }

                guard matches else { continue }
            }

            // Passed all filters
            result.append(conversation)
        }

        // Result is already in correct order (conversations was sorted)
        filteredConversations = result
    }

    // MARK: - Community Cards Generation

    private func generateCommunityCards() {
        var cards: [CommunityCardData] = []

        // Helper function to check if conversation is archived from all sources
        func isArchived(_ conv: Conversation) -> Bool {
            // Check all possible sources for archived status
            let fromDirect = conv.isArchived
            let fromUserPrefs = conv.userPreferences?.isArchived ?? false
            let fromPrefs = conv.preferences?.isArchived ?? false
            return fromDirect || fromUserPrefs || fromPrefs
        }

        // DEBUG: Log archived status for all conversations
        chatLogger.info("📦 [ARCHIVE DEBUG] Checking \(conversations.count) conversations for archive status:")
        for conv in conversations {
            let fromDirect = conv.isArchived
            let fromUserPrefs = conv.userPreferences?.isArchived ?? false
            let fromPrefs = conv.preferences?.isArchived ?? false
            let isArchivedResult = fromDirect || fromUserPrefs || fromPrefs
            if isArchivedResult {
                chatLogger.info("📦 [ARCHIVE DEBUG] ✅ ARCHIVED: \(conv.displayName) - direct:\(fromDirect), userPrefs:\(fromUserPrefs), prefs:\(fromPrefs)")
            }
        }

        // All Card - count non-archived conversations
        let allCount = conversations.filter { !isArchived($0) }.count
        cards.append(CommunityCardData(
            id: "all",
            type: .all,
            title: "Toutes",
            image: nil,
            memberCount: nil,
            conversationCount: allCount,
            communityId: nil
        ))

        func hasReaction(_ conv: Conversation) -> Bool {
            (conv.userPreferences?.reaction != nil) || (conv.preferences?.reaction != nil)
        }

        // Community Cards
        for community in communitiesList {
            // Use backend counts if available, otherwise calculate locally
            let conversationCount = community.conversationCount ?? conversations.filter {
                $0.communityId == community.id && !isArchived($0)
            }.count

            cards.append(CommunityCardData(
                id: community.id,
                type: .community(community.id),
                title: community.name,
                image: community.avatar,
                memberCount: community.memberCount,
                conversationCount: conversationCount,
                communityId: community.id
            ))
        }

        // Reacted/Favorites Card - only show if count > 0
        let reactedCount = conversations.filter { hasReaction($0) && !isArchived($0) }.count
        if reactedCount > 0 {
            cards.append(CommunityCardData(
                id: "reacted",
                type: .reacted,
                title: "Favorites",
                image: nil,
                memberCount: nil,
                conversationCount: reactedCount,
                communityId: nil
            ))
        }

        // Archived Card - ALWAYS shown (even with 0 conversations)
        let archivedCount = conversations.filter { isArchived($0) }.count
        chatLogger.info("📦 [ARCHIVE DEBUG] Final archived count: \(archivedCount) out of \(conversations.count) conversations")
        cards.append(CommunityCardData(
            id: "archived",
            type: .archived,
            title: "Archivées",
            image: nil,
            memberCount: nil,
            conversationCount: archivedCount,
            communityId: nil
        ))

        self.communityCards = cards
        chatLogger.info("📦 [CARDS] Generated \(cards.count) community cards")
    }


    // MARK: - Private: Listeners

    private func setupSearchListener() {
        $searchQuery
            .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
            .sink { [weak self] _ in
                self?.filterConversations()
            }
            .store(in: &cancellables)
    }

    private func setupFilterListener() {
        // Listen for filter changes
        $selectedFilter
            .sink { [weak self] _ in
                self?.filterConversations()
            }
            .store(in: &cancellables)

        // Listen for category selection changes
        $selectedCategory
            .sink { [weak self] _ in
                self?.filterConversations()
            }
            .store(in: &cancellables)

        // Listen for community filter changes (carousel tile selection)
        $selectedCommunityFilter
            .sink { [weak self] filter in
                chatLogger.info("🎯 [FILTER] Community filter changed to: \(filter)")
                self?.filterConversations()
            }
            .store(in: &cancellables)
    }

    private func setupRealtimeListeners() {
        chatLogger.info("📡 [REALTIME] Setting up WebSocket listeners for conversation updates")

        // Listen for new messages via WebSocket
        webSocketService.on(EnvironmentConfig.SocketEvent.messageReceived) { [weak self] data in
            chatLogger.info("📡 [REALTIME] Received message:new event from WebSocket")

            guard let jsonData = data as? [String: Any] else {
                chatLogger.error("📡 [REALTIME] Failed to parse message data as [String: Any]")
                return
            }

            // Configure decoder for ISO8601 dates
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .custom { decoder in
                let container = try decoder.singleValueContainer()
                let dateString = try container.decode(String.self)

                // Try ISO8601 with fractional seconds first
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                if let date = formatter.date(from: dateString) {
                    return date
                }

                // Fallback to standard ISO8601
                formatter.formatOptions = [.withInternetDateTime]
                if let date = formatter.date(from: dateString) {
                    return date
                }

                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date format")
            }

            guard let messageData = try? JSONSerialization.data(withJSONObject: jsonData),
                  let message = try? decoder.decode(Message.self, from: messageData) else {
                chatLogger.error("📡 [REALTIME] Failed to decode Message from JSON")
                if let jsonData = try? JSONSerialization.data(withJSONObject: jsonData),
                   let jsonString = String(data: jsonData, encoding: .utf8) {
                    chatLogger.error("📡 [REALTIME] Raw JSON: \(jsonString.prefix(500))")
                }
                return
            }

            Task { @MainActor [weak self] in
                guard let self = self else { return }
                self.handleNewMessage(message)
            }
        }

        // Listen for conversation updates via WebSocket
        webSocketService.on(EnvironmentConfig.SocketEvent.conversationUpdated) { [weak self] data in
            chatLogger.info("📡 [REALTIME] Received conversation:updated event from WebSocket")

            guard let jsonData = data as? [String: Any] else {
                chatLogger.error("📡 [REALTIME] Failed to parse conversation data as [String: Any]")
                return
            }

            // Configure decoder for ISO8601 dates
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .custom { decoder in
                let container = try decoder.singleValueContainer()
                let dateString = try container.decode(String.self)

                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                if let date = formatter.date(from: dateString) {
                    return date
                }

                formatter.formatOptions = [.withInternetDateTime]
                if let date = formatter.date(from: dateString) {
                    return date
                }

                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date format")
            }

            guard let conversationData = try? JSONSerialization.data(withJSONObject: jsonData),
                  let conversation = try? decoder.decode(Conversation.self, from: conversationData) else {
                chatLogger.error("📡 [REALTIME] Failed to decode Conversation from JSON")
                return
            }

            Task { @MainActor [weak self] in
                guard let self = self else { return }
                self.updateConversationInList(conversation)
            }
        }

        chatLogger.info("📡 [REALTIME] WebSocket listeners registered")
    }

    private func setupNotificationListeners() {
        // Listen for backend change - clear local data and reload
        NotificationCenter.default.publisher(for: .backendDidChange)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self = self else { return }
                chatLogger.info("ConversationListVM: Backend changed, clearing data and reloading")
                self.clearAllData()
            }
            .store(in: &cancellables)

        // Listen for conversation marked as read - update local unread count
        NotificationCenter.default.publisher(for: .conversationMarkedAsRead)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                guard let self = self,
                      let conversationId = notification.userInfo?["conversationId"] as? String else {
                    return
                }
                chatLogger.info("ConversationListVM: Marking conversation \(conversationId) as read locally")
                if let index = self.conversations.firstIndex(where: { $0.id == conversationId }) {
                    self.conversations[index].unreadCount = 0
                    self.updateDerivedState()
                }
            }
            .store(in: &cancellables)

        // Listen for background refresh updates
        NotificationCenter.default.publisher(for: .conversationsDidUpdate)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                guard let self = self,
                      let updatedConversations = notification.userInfo?["conversations"] as? [Conversation] else {
                    return
                }
                self.mergeConversations(updatedConversations)
            }
            .store(in: &cancellables)

        // Legacy: Preference updates
        NotificationCenter.default.publisher(for: .conversationPreferencesDidUpdate)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                guard let self = self,
                      let conversationId = notification.userInfo?["conversationId"] as? String else {
                    return
                }

                if let index = self.conversations.firstIndex(where: { $0.id == conversationId }) {
                    var updated = self.conversations[index]

                    if let isPinned = notification.userInfo?["isPinned"] as? Bool {
                        updated.isPinned = isPinned
                    }
                    if let isMuted = notification.userInfo?["isMuted"] as? Bool {
                        updated.isMuted = isMuted
                    }
                    if let unreadCount = notification.userInfo?["unreadCount"] as? Int {
                        updated.unreadCount = unreadCount
                    }

                    self.conversations[index] = updated
                    self.updateDerivedState()
                }
            }
            .store(in: &cancellables)

        // Listen for messages sent from chat - update lastMessage and move to top
        NotificationCenter.default.publisher(for: .messageSentFromChat)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                guard let self = self,
                      let conversationId = notification.userInfo?["conversationId"] as? String,
                      let message = notification.userInfo?["message"] as? Message else {
                    return
                }

                chatLogger.info("ConversationListVM: Message sent in \(conversationId), updating list")

                if let index = self.conversations.firstIndex(where: { $0.id == conversationId }) {
                    var conversation = self.conversations[index]
                    conversation.lastMessage = message
                    conversation.lastMessageAt = message.createdAt

                    // Remove from current position and insert at top
                    self.conversations.remove(at: index)
                    self.conversations.insert(conversation, at: 0)

                    self.updateDerivedState()
                    self.groupConversationsByCategory()

                    chatLogger.info("ConversationListVM: Moved \(conversation.displayName) to top after sending message")
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Private: Update Handlers

    private func handleNewMessage(_ message: Message) {
        chatLogger.info("📩 [REALTIME] Received new message event:")
        chatLogger.info("📩 [REALTIME]   conversationId: \(message.conversationId)")
        chatLogger.info("📩 [REALTIME]   senderId: \(message.senderId)")
        chatLogger.info("📩 [REALTIME]   content: \(message.content.prefix(50))...")

        if let index = conversations.firstIndex(where: { $0.id == message.conversationId }) {
            var conversation = conversations[index]
            conversation.lastMessage = message
            conversation.lastMessageAt = message.createdAt

            // Increment unread if not from current user
            if message.senderId != currentUserId {
                conversation.incrementUnreadCount()
                chatLogger.info("📩 [REALTIME] Incremented unread count for conversation")

                // Send received status to backend
                // This updates the MessageStatus with the receivedAt timestamp
                // so the sender knows the message was delivered to this device
                webSocketService.sendReceivedStatus(
                    conversationId: message.conversationId,
                    messageId: message.id
                )
                chatLogger.info("📩 [REALTIME] Sent received status for message \(message.id)")
            }

            // Move to top
            conversations.remove(at: index)
            conversations.insert(conversation, at: 0)

            updateDerivedState()
            groupConversationsByCategory()

            chatLogger.info("📩 [REALTIME] Updated conversation list - moved \(conversation.displayName) to top")
        } else {
            chatLogger.warn("📩 [REALTIME] Message received for unknown conversation: \(message.conversationId)")
            // Could fetch the conversation from API here
        }
    }

    private func updateConversationInList(_ updatedConversation: Conversation) {
        if let index = conversations.firstIndex(where: { $0.id == updatedConversation.id }) {
            conversations[index] = updatedConversation
        } else {
            conversations.insert(updatedConversation, at: 0)
        }

        conversations.sort { $0.lastMessageAt > $1.lastMessageAt }
        updateDerivedState()
        groupConversationsByCategory()
    }

    private func mergeConversations(_ newConversations: [Conversation]) {
        let previousCount = conversations.count
        var conversationMap = Dictionary(uniqueKeysWithValues: conversations.map { ($0.id, $0) })

        for conversation in newConversations {
            conversationMap[conversation.id] = conversation
        }

        conversations = Array(conversationMap.values).sorted { $0.lastMessageAt > $1.lastMessageAt }

        chatLogger.info("ConversationListVM: Merged \(newConversations.count) conversations (was \(previousCount), now \(conversations.count))")

        // CRITICAL: Call computeAllDerivedState to update community cards counts
        computeAllDerivedState()
        groupConversationsByCategory()
    }
}

// MARK: - Search Extension

extension ConversationListViewModel {
    func searchConversations(_ query: String) {
        self.searchQuery = query
    }

    func clearSearch() {
        self.searchQuery = ""
    }
}
