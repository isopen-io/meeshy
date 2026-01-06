//
//  ConversationService.swift
//  Meeshy
//
//  Service for conversation operations with intelligent in-memory caching
//  UPDATED: Bypasses CoreData to fix NSSet nil insertion crash
//  Uses new InMemoryCache for thread-safe, crash-free caching
//  iOS 16+
//
//  ARCHITECTURE:
//  - Cache-first strategy with background refresh
//  - In-memory LRU cache (replaces CoreData)
//  - Proper pagination support (cursor-based when available)
//  - Real-time update handling
//

import Foundation
import Combine

// MARK: - Conversation Service

final class ConversationService: Sendable {

    // MARK: - Singleton

    static let shared = ConversationService()

    // MARK: - Properties

    private let apiClient: APIClient

    // NOTE: CoreData cacheService is DISABLED to fix NSSet nil insertion crash
    // Using in-memory cache instead (AppCache.conversations)
    // private let cacheService: CacheService // DISABLED

    // MARK: - Initialization

    private init(apiClient: APIClient = APIClient.shared) {
        self.apiClient = apiClient
        // CoreData cache disabled: cacheService = .shared
    }

    // MARK: - Fetch ALL Conversations (No Pagination)

    /// Fetches ALL conversations for the user (no pagination limit)
    /// Uses offline-first strategy: disk cache -> memory cache -> network
    /// - Returns: Array of all user conversations
    func fetchAllConversations() async throws -> [Conversation] {
        conversationLogger.info("Fetching ALL conversations (offline-first)")

        // 1. Check in-memory cache first (fastest)
        let memoryCached = await AppCache.conversations.getItems(forKey: "all")
        if !memoryCached.isEmpty {
            conversationLogger.info("Returning \(memoryCached.count) conversations from memory cache")

            // Refresh in background
            Task.detached { [weak self] in
                await self?.refreshAllConversationsInBackground()
            }

            return memoryCached
        }

        // 2. Check JSON disk cache (via DataManager - already loaded at startup)
        let cachedConversations = await DataManager.shared.getConversations()
        if !cachedConversations.isEmpty {
            conversationLogger.info("Returning \(cachedConversations.count) conversations from JSON cache")

            // Load into memory cache
            await AppCache.conversations.setInitialPage(
                key: "all",
                items: cachedConversations,
                cursor: nil,
                hasMore: false,
                totalCount: cachedConversations.count,
                ttl: .infinity
            )

            // Refresh in background
            Task.detached { [weak self] in
                await self?.refreshAllConversationsInBackground()
            }

            return cachedConversations
        }

        // 3. Fetch from network (only on first launch or empty cache)
        return try await fetchAllConversationsFromNetwork()
    }

    /// Force refresh ALL conversations from network
    func forceRefreshAllConversations() async throws -> [Conversation] {
        return try await fetchAllConversationsFromNetwork()
    }

    // MARK: - Network Fetch (All Conversations)

    /// Thread-safe actor to manage concurrent fetch state
    private actor FetchState {
        private var isFetching = false

        func tryStartFetch() -> Bool {
            if isFetching { return false }
            isFetching = true
            return true
        }

        func endFetch() {
            isFetching = false
        }
    }

    private let fetchState = FetchState()

    private func fetchAllConversationsFromNetwork() async throws -> [Conversation] {
        // Prevent concurrent fetches - return cached data if available (thread-safe check)
        let canFetch = await fetchState.tryStartFetch()
        guard canFetch else {
            conversationLogger.warn("fetchAllConversationsFromNetwork already in progress, skipping duplicate call")
            // Return cached data if available
            let cached = await AppCache.conversations.getItems(forKey: "all")
            if !cached.isEmpty {
                return cached
            }
            // Otherwise wait a bit and try to get from DataManager
            try? await Task.sleep(nanoseconds: 500_000_000) // 500ms
            return await DataManager.shared.conversations
        }

        // Ensure we reset the fetch state when done (using Task to call actor method in defer)
        defer {
            Task { await self.fetchState.endFetch() }
        }

        // Use centralized pagination config - single source of truth
        let pageSize = PaginationConfig.conversationsPerPage
        var allConversations: [Conversation] = []
        allConversations.reserveCapacity(200)
        var seenIds = Set<String>()
        seenIds.reserveCapacity(200)
        var currentPage = 1
        var hasMore = true
        var consecutiveDuplicatePages = 0

        conversationLogger.info("Starting paginated fetch of ALL conversations (pageSize: \(pageSize))")

        while hasMore {
            let endpoint = ConversationEndpoints.fetchConversations(page: currentPage, limit: pageSize)

            // DEBUG: Log the request
            print("🔵 [API REQUEST] GET /conversations?page=\(currentPage)&limit=\(pageSize)")
            conversationLogger.info("🔵 [API REQUEST] Fetching page \(currentPage) with limit \(pageSize)")

            do {
                // Use PaginatedAPIResponse to properly detect hasMore from backend
                let response: PaginatedAPIResponse<[Conversation]> = try await apiClient.requestPaginated(endpoint)
                let conversations = response.data

                // DEBUG: Log the response
                print("🟢 [API RESPONSE] Page \(currentPage): received \(conversations.count) conversations, hasMore: \(response.hasMore)")

                // DEBUG: Check userPreferences, categories, and tags
                for (index, conv) in conversations.prefix(3).enumerated() {
                    let hasUserPrefs = conv.userPreferences != nil
                    let hasCategoryId = conv.userPreferences?.categoryId != nil
                    let hasCategory = conv.userPreferences?.category != nil
                    let hasTags = !(conv.userPreferences?.tags ?? []).isEmpty
                    let hasLegacyPrefs = conv.preferences != nil
                    let hasLegacyCat = conv.preferences?.category != nil
                    let hasLegacyTags = !(conv.preferences?.tags ?? []).isEmpty
                    print("📋 [CONV \(index)] '\(conv.title ?? conv.identifier)': userPrefs=\(hasUserPrefs), catId=\(hasCategoryId), cat=\(hasCategory), tags=\(hasTags), legacyPrefs=\(hasLegacyPrefs), legacyCat=\(hasLegacyCat), legacyTags=\(hasLegacyTags)")
                    if let prefs = conv.userPreferences {
                        print("   └── categoryId: \(prefs.categoryId ?? "nil"), tags: \(prefs.tags), category.name: \(prefs.category?.name ?? "nil")")
                    }
                }

                // Check for duplicate data (backend pagination bug detection)
                var newConversationsCount = 0
                for conversation in conversations {
                    if !seenIds.contains(conversation.id) {
                        seenIds.insert(conversation.id)
                        allConversations.append(conversation)
                        newConversationsCount += 1
                    }
                }

                print("🟢 [API RESPONSE] Page \(currentPage): \(newConversationsCount) NEW conversations (total unique: \(allConversations.count))")
                conversationLogger.info("Page \(currentPage): \(newConversationsCount) new conversations (total unique: \(allConversations.count))")

                // Detect backend pagination bug: if we got 0 new conversations, backend is returning duplicates
                if newConversationsCount == 0 {
                    consecutiveDuplicatePages += 1
                    conversationLogger.warn("Page \(currentPage) returned 0 new conversations (all duplicates). Count: \(consecutiveDuplicatePages)")

                    // If we get 3 consecutive pages of duplicates, stop - backend is broken
                    if consecutiveDuplicatePages >= 3 {
                        conversationLogger.error("Backend pagination appears broken - stopping after \(consecutiveDuplicatePages) duplicate pages")
                        print("🛑 [PAGINATION] Stopping - backend returning duplicate data")
                        break
                    }
                } else {
                    consecutiveDuplicatePages = 0 // Reset counter if we got new data
                }

                // Use backend's hasMore if available, otherwise use centralized config
                hasMore = response.pagination?.hasMore ?? PaginationConfig.hasMorePages(receivedCount: conversations.count)
                currentPage += 1

                // Safety limit to prevent infinite loops
                if currentPage > PaginationConfig.maxPages {
                    conversationLogger.warn("Reached max page limit (\(PaginationConfig.maxPages)), stopping pagination")
                    break
                }

            } catch {
                conversationLogger.error("Failed to fetch page \(currentPage): \(error.localizedDescription)")
                if let decodingError = error as? DecodingError {
                    logDecodingError(decodingError)
                }
                // If first page fails, throw error. Otherwise, return what we have
                if allConversations.isEmpty {
                    throw error
                }
                break
            }
        }

        // DEBUG: Final count
        print("🏁 [FETCH COMPLETE] Total unique conversations: \(allConversations.count) in \(currentPage - 1) page(s)")
        conversationLogger.info("Fetched \(allConversations.count) unique conversations from network (\(currentPage - 1) pages)")

        // Already deduplicated during pagination
        var uniqueConversations = allConversations

        // Sort by lastMessageAt descending
        uniqueConversations.sort { $0.lastMessageAt > $1.lastMessageAt }

        // DEBUG: After deduplication
        print("✅ [FINAL] \(uniqueConversations.count) unique conversations after deduplication")

        // Update in-memory cache (no TTL expiration)
        await AppCache.conversations.setInitialPage(
            key: "all",
            items: uniqueConversations,
            cursor: nil,
            hasMore: false,  // No more pages since we fetched all
            totalCount: uniqueConversations.count,
            ttl: .infinity
        )

        // Persist to CoreData for offline access
        AppCache.persistConversations(uniqueConversations)

        return uniqueConversations
    }

    /// Refresh all conversations in background
    private func refreshAllConversationsInBackground() async {
        do {
            let conversations = try await fetchAllConversationsFromNetwork()
            conversationLogger.info("Background refresh: updated \(conversations.count) conversations")

            // CRITICAL: Update DataManager with fresh data
            await DataManager.shared.updateConversations(conversations)

            // Re-structure conversations by category
            await DataManager.shared.structureConversations()

            // Post notification for UI update
            await MainActor.run {
                NotificationCenter.default.post(
                    name: .conversationsDidUpdate,
                    object: nil,
                    userInfo: ["conversations": conversations]
                )
            }
        } catch {
            conversationLogger.error("Background refresh failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Fetch Conversations with Pagination (Legacy)

    /// Fetches conversations with pagination support
    /// NOTE: Use fetchAllConversations() for now - pagination disabled temporarily
    /// - Parameters:
    ///   - cursor: Optional cursor for cursor-based pagination (preferred)
    ///   - page: Page number for page-based pagination (fallback)
    ///   - limit: Number of items per page
    /// - Returns: Paginated response with conversations
    func fetchConversations(
        cursor: String? = nil,
        page: Int = 1,
        limit: Int = 100
    ) async throws -> PaginatedResponse<Conversation> {
        conversationLogger.info("Fetching conversations (cursor: \(cursor ?? "nil"), page: \(page), limit: \(limit))")

        // Check in-memory cache for first page
        let isFirstPage = cursor == nil && page == 1
        if isFirstPage {
            let cached = await AppCache.conversations.getItems(forKey: "all")
            if !cached.isEmpty {
                conversationLogger.info("Returning \(cached.count) cached conversations")

                // Refresh in background
                Task.detached { [weak self] in
                    await self?.refreshConversationsInBackground(limit: limit)
                }

                // Return cached data with hasMore based on metadata
                let metadata = await AppCache.conversations.getMetadata(forKey: "all")
                return PaginatedResponse(
                    items: cached,
                    nextCursor: metadata?.cursor,
                    hasMore: metadata?.hasMore ?? true,
                    totalCount: metadata?.totalCount
                )
            }
        }

        // Fetch from network
        return try await fetchConversationsFromNetwork(cursor: cursor, page: page, limit: limit)
    }

    /// Force refresh from network (bypasses cache)
    func forceRefreshConversations(page: Int = 1, limit: Int = 100) async throws -> PaginatedResponse<Conversation> {
        return try await fetchConversationsFromNetwork(cursor: nil, page: page, limit: limit)
    }

    // MARK: - Network Fetch

    private func fetchConversationsFromNetwork(
        cursor: String?,
        page: Int,
        limit: Int
    ) async throws -> PaginatedResponse<Conversation> {

        let endpoint = ConversationEndpoints.fetchConversations(page: page, limit: limit)

        do {
            let response: APIResponse<[Conversation]> = try await apiClient.request(endpoint)

            guard let conversations = response.data else {
                conversationLogger.error("No data in conversations response")
                throw MeeshyError.network(.invalidResponse)
            }

            conversationLogger.info("Fetched \(conversations.count) conversations from network")

            // Determine hasMore from response
            // If API returns total, use it; otherwise infer from count
            let hasMore = conversations.count >= limit

            // Update in-memory cache
            let isFirstPage = cursor == nil && page == 1
            if isFirstPage {
                await AppCache.conversations.setInitialPage(
                    key: "all",
                    items: conversations,
                    cursor: nil, // API doesn't return cursor yet
                    hasMore: hasMore,
                    totalCount: nil
                )
                conversationLogger.info("Updated cache with \(conversations.count) conversations")
            } else {
                await AppCache.conversations.appendPage(
                    key: "all",
                    items: conversations,
                    cursor: nil,
                    hasMore: hasMore
                )
            }

            return PaginatedResponse(
                items: conversations,
                nextCursor: nil, // API doesn't return cursor yet
                hasMore: hasMore,
                totalCount: nil
            )

        } catch {
            conversationLogger.error("Failed to fetch conversations: \(error.localizedDescription)")

            if let decodingError = error as? DecodingError {
                logDecodingError(decodingError)
            }

            throw error
        }
    }

    /// Background refresh without blocking UI
    private func refreshConversationsInBackground(limit: Int) async {
        do {
            let response = try await fetchConversationsFromNetwork(cursor: nil, page: 1, limit: limit)
            conversationLogger.info("Background refresh: \(response.items.count) conversations")

            // Post notification for UI update
            await MainActor.run {
                NotificationCenter.default.post(
                    name: .conversationsDidUpdate,
                    object: nil,
                    userInfo: ["conversations": response.items]
                )
            }
        } catch {
            conversationLogger.error("Background refresh failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Cache Management

    /// Updates a specific conversation in cache
    func updateConversationInCache(_ conversation: Conversation) async {
        await AppCache.conversations.updateItem(conversation)
        conversationLogger.info("Updated conversation in cache: \(conversation.id)")

        // Post notification for UI update
        await MainActor.run {
            NotificationCenter.default.post(
                name: .conversationDidUpdate,
                object: nil,
                userInfo: ["conversation": conversation]
            )
        }
    }

    /// Updates conversation preferences in cache (lightweight update)
    func updateConversationPreferencesInCache(
        conversationId: String,
        isPinned: Bool? = nil,
        isMuted: Bool? = nil,
        unreadCount: Int? = nil
    ) async {
        conversationLogger.info("Updating preferences for: \(conversationId)")

        // Post notification for immediate UI update
        var updates: [String: Any] = ["conversationId": conversationId]
        if let isPinned = isPinned { updates["isPinned"] = isPinned }
        if let isMuted = isMuted { updates["isMuted"] = isMuted }
        if let unreadCount = unreadCount { updates["unreadCount"] = unreadCount }

        await MainActor.run {
            NotificationCenter.default.post(
                name: .conversationPreferencesDidUpdate,
                object: nil,
                userInfo: updates
            )
        }
    }

    // MARK: - Update User Preferences on Server

    /// Updates user preferences for a conversation on the server
    /// - Parameters:
    ///   - conversationId: The conversation ID
    ///   - request: The preferences update request
    /// - Returns: The updated preferences response
    @discardableResult
    func updateUserPreferences(
        conversationId: String,
        request: UserPreferencesUpdateRequest
    ) async throws -> ConversationPreferencesResponse {
        conversationLogger.info("Updating user preferences for: \(conversationId)")

        let endpoint = UserPreferencesEndpoints.updatePreferences(
            conversationId: conversationId,
            request
        )

        let response: APIResponse<ConversationPreferencesResponse> = try await apiClient.request(endpoint)

        guard let preferences = response.data else {
            throw MeeshyError.network(.invalidResponse)
        }

        conversationLogger.info("Successfully updated preferences for: \(conversationId)")
        return preferences
    }

    /// Sets a reaction emoji for a conversation
    /// - Parameters:
    ///   - conversationId: The conversation ID
    ///   - emoji: The emoji to set (nil to remove)
    func setConversationReaction(conversationId: String, emoji: String?) async throws {
        let request = UserPreferencesUpdateRequest(reaction: emoji)
        try await updateUserPreferences(conversationId: conversationId, request: request)
        conversationLogger.info("Set reaction '\(emoji ?? "none")' for conversation: \(conversationId)")
    }

    /// Invalidates cache for a specific conversation
    func invalidateConversationCache(conversationId: String) async {
        await AppCache.conversations.removeItem(conversationId)
        conversationLogger.info("Invalidated cache for: \(conversationId)")
    }

    /// Clear all conversation cache
    func clearConversationCache() async {
        await AppCache.conversations.clearAll()
        conversationLogger.info("Cleared all conversation cache")
    }

    // MARK: - Get Single Conversation

    func getConversation(conversationId: String) async throws -> Conversation {
        conversationLogger.info("Fetching conversation \(conversationId)")

        let endpoint = ConversationEndpoints.getConversation(id: conversationId)
        let response: APIResponse<Conversation> = try await apiClient.request(endpoint)

        guard let conversation = response.data else {
            throw MeeshyError.network(.invalidResponse)
        }

        // Update cache
        await AppCache.conversations.updateItem(conversation)

        conversationLogger.info("Successfully fetched conversation: \(conversation.id)")
        return conversation
    }

    // MARK: - Create Conversation

    func createConversation(request: ConversationCreateRequest) async throws -> Conversation {
        conversationLogger.info("Creating conversation")

        let endpoint = ConversationEndpoints.createConversation(request)
        let response: APIResponse<Conversation> = try await apiClient.request(endpoint)

        guard let conversation = response.data else {
            throw MeeshyError.network(.invalidResponse)
        }

        // Add to cache (prepend as it's new)
        await AppCache.conversations.prependItems(key: "all", items: [conversation])

        conversationLogger.info("Successfully created conversation: \(conversation.id)")
        return conversation
    }

    // MARK: - Update Conversation

    func updateConversation(request: ConversationUpdateRequest) async throws -> Conversation {
        conversationLogger.info("Updating conversation \(request.conversationId)")

        let endpoint = ConversationEndpoints.updateConversation(id: request.conversationId, request)
        let response: APIResponse<Conversation> = try await apiClient.request(endpoint)

        guard let conversation = response.data else {
            throw MeeshyError.network(.invalidResponse)
        }

        // Update cache
        await AppCache.conversations.updateItem(conversation)

        conversationLogger.info("Successfully updated conversation: \(conversation.id)")
        return conversation
    }

    // MARK: - Delete Conversation

    func deleteConversation(conversationId: String) async throws {
        conversationLogger.info("Deleting conversation \(conversationId)")

        let endpoint = ConversationEndpoints.deleteConversation(id: conversationId)
        let _: APIResponse<EmptyResponse> = try await apiClient.request(endpoint)

        // Remove from cache
        await AppCache.conversations.removeItem(conversationId)

        conversationLogger.info("Successfully deleted conversation: \(conversationId)")
    }

    // MARK: - Member Operations

    /// Fetch all members for a conversation with caching
    /// - Parameters:
    ///   - conversationId: The conversation ID
    ///   - forceRefresh: Force refresh from network
    /// - Returns: Array of conversation members
    @MemberCacheActor
    func fetchMembers(conversationId: String, forceRefresh: Bool = false) async throws -> [ConversationMember] {
        conversationLogger.info("Fetching members for conversation \(conversationId)")

        // Use MemberFetchHelper for caching
        return try await MemberFetchHelper.fetchMembers(
            for: conversationId,
            forceRefresh: forceRefresh
        ) {
            // Network fetch function
            try await self.fetchMembersFromNetwork(conversationId: conversationId)
        }
    }

    /// Fetch members from network (internal)
    private func fetchMembersFromNetwork(conversationId: String) async throws -> [ConversationMember] {
        // Fetch all members with high limit
        let endpoint = ConversationEndpoints.fetchMembers(conversationId: conversationId, page: 1, limit: 500)

        // DEBUG: Log raw response
        conversationLogger.info("=== Fetching members from: \(endpoint.path) ===")

        let response: APIResponse<[ConversationMember]> = try await apiClient.request(endpoint)

        guard let members = response.data else {
            conversationLogger.error("No data in members response")
            throw MeeshyError.network(.invalidResponse)
        }

        // DEBUG: Log each member's user data to verify decoding
        conversationLogger.info("=== DEBUG: Fetched \(members.count) members for \(conversationId) ===")
        for member in members {
            if let user = member.user {
                conversationLogger.info("  Member[\(member.userId)]: user.username=\(user.username), user.displayName=\(user.displayName ?? "nil"), user.avatar=\(user.avatar ?? "nil")")
            } else {
                conversationLogger.info("  Member[\(member.userId)]: user is NIL - preferredName will fallback to userId")
            }
            conversationLogger.info("  -> preferredName: \(member.preferredName)")
        }
        conversationLogger.info("=== END DEBUG ===")

        return members
    }

    /// Get user info for a member (from cache)
    /// - Parameters:
    ///   - conversationId: The conversation ID
    ///   - userId: The user ID
    /// - Returns: Tuple of (displayName, avatar) or nil if not cached
    @MemberCacheActor
    func getMemberInfo(conversationId: String, userId: String) -> (name: String, avatar: String?)? {
        return MemberCacheManager.shared.getUserInfo(conversationId: conversationId, userId: userId)
    }

    /// Check if a member is in cache
    @MemberCacheActor
    func hasMemberInCache(conversationId: String, userId: String) -> Bool {
        return MemberCacheManager.shared.hasMember(userId: userId, in: conversationId)
    }

    /// Handle unknown member - triggers refresh if needed
    @MemberCacheActor
    func handleUnknownMember(userId: String, in conversationId: String) {
        MemberFetchHelper.handleUnknownMember(userId: userId, in: conversationId) {
            try await self.fetchMembersFromNetwork(conversationId: conversationId)
        }
    }

    func addMember(conversationId: String, userId: String, role: ConversationMemberRole = .member) async throws -> Conversation {
        conversationLogger.info("Adding member \(userId) to conversation \(conversationId)")

        let request = ConversationMemberAddRequest(conversationId: conversationId, userId: userId, role: role)
        let endpoint = ConversationEndpoints.addMembers(conversationId: conversationId, request)
        let response: APIResponse<Conversation> = try await apiClient.request(endpoint)

        guard let conversation = response.data else {
            throw MeeshyError.network(.invalidResponse)
        }

        await AppCache.conversations.updateItem(conversation)
        conversationLogger.info("Successfully added member to conversation: \(conversation.id)")
        return conversation
    }

    func removeMember(conversationId: String, userId: String) async throws {
        conversationLogger.info("Removing member \(userId) from conversation \(conversationId)")

        let endpoint = ConversationEndpoints.removeMember(conversationId: conversationId, userId: userId)
        let _: APIResponse<EmptyResponse> = try await apiClient.request(endpoint)

        conversationLogger.info("Successfully removed member from conversation: \(conversationId)")
    }

    func leaveConversation(conversationId: String) async throws {
        conversationLogger.info("Leaving conversation \(conversationId)")

        let endpoint = ConversationEndpoints.leaveConversation(conversationId: conversationId)
        let _: APIResponse<EmptyResponse> = try await apiClient.request(endpoint)

        // Remove from cache
        await AppCache.conversations.removeItem(conversationId)

        conversationLogger.info("Successfully left conversation: \(conversationId)")
    }

    // MARK: - Read Status

    func markAsRead(conversationId: String) async throws {
        conversationLogger.info("Marking conversation \(conversationId) as read")

        let endpoint = ConversationEndpoints.markAsRead(conversationId: conversationId)
        let _: APIResponse<EmptyResponse> = try await apiClient.request(endpoint)

        conversationLogger.info("Successfully marked conversation as read: \(conversationId)")
    }

    // MARK: - Pin/Unpin

    func pinConversation(conversationId: String) async throws {
        conversationLogger.info("Pinning conversation \(conversationId)")

        let endpoint = ConversationEndpoints.pinConversation(conversationId: conversationId)
        let _: APIResponse<EmptyResponse> = try await apiClient.request(endpoint)

        conversationLogger.info("Successfully pinned conversation: \(conversationId)")
    }

    func unpinConversation(conversationId: String) async throws {
        conversationLogger.info("Unpinning conversation \(conversationId)")

        let endpoint = ConversationEndpoints.unpinConversation(conversationId: conversationId)
        let _: APIResponse<EmptyResponse> = try await apiClient.request(endpoint)

        conversationLogger.info("Successfully unpinned conversation: \(conversationId)")
    }

    // MARK: - Mute/Unmute

    func muteConversation(conversationId: String, duration: Int? = nil) async throws {
        conversationLogger.info("Muting conversation \(conversationId)")

        let endpoint = ConversationEndpoints.muteConversation(conversationId: conversationId, duration: duration)
        let _: APIResponse<EmptyResponse> = try await apiClient.request(endpoint)

        conversationLogger.info("Successfully muted conversation: \(conversationId)")
    }

    func unmuteConversation(conversationId: String) async throws {
        conversationLogger.info("Unmuting conversation \(conversationId)")

        let endpoint = ConversationEndpoints.unmuteConversation(conversationId: conversationId)
        let _: APIResponse<EmptyResponse> = try await apiClient.request(endpoint)

        conversationLogger.info("Successfully unmuted conversation: \(conversationId)")
    }

    // MARK: - Search

    func searchConversations(query: String, page: Int = 1, limit: Int = 20) async throws -> [Conversation] {
        conversationLogger.info("Searching conversations with query: \(query)")

        let endpoint = ConversationEndpoints.searchConversations(query: query, page: page, limit: limit)
        let response: APIResponse<[Conversation]> = try await apiClient.request(endpoint)

        guard let conversations = response.data else {
            throw MeeshyError.network(.invalidResponse)
        }

        conversationLogger.info("Found \(conversations.count) conversations matching '\(query)'")
        return conversations
    }

    // MARK: - Private Helpers

    private func logDecodingError(_ error: DecodingError) {
        switch error {
        case .keyNotFound(let key, let context):
            conversationLogger.error("Key '\(key.stringValue)' not found")
            conversationLogger.error("Path: \(context.codingPath.map { $0.stringValue }.joined(separator: "."))")
            conversationLogger.error("Debug: \(context.debugDescription)")
        case .typeMismatch(let type, let context):
            conversationLogger.error("Type mismatch for \(type)")
            conversationLogger.error("Path: \(context.codingPath.map { $0.stringValue }.joined(separator: "."))")
            conversationLogger.error("Debug: \(context.debugDescription)")
        case .valueNotFound(let type, let context):
            conversationLogger.error("Value not found for \(type)")
            conversationLogger.error("Path: \(context.codingPath.map { $0.stringValue }.joined(separator: "."))")
            conversationLogger.error("Debug: \(context.debugDescription)")
        case .dataCorrupted(let context):
            conversationLogger.error("Data corrupted")
            conversationLogger.error("Path: \(context.codingPath.map { $0.stringValue }.joined(separator: "."))")
            conversationLogger.error("Debug: \(context.debugDescription)")
        @unknown default:
            conversationLogger.error("Unknown decoding error")
        }
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let conversationsDidUpdate = Notification.Name("conversationsDidUpdate")
    static let conversationDidUpdate = Notification.Name("conversationDidUpdate")
    static let conversationPreferencesDidUpdate = Notification.Name("conversationPreferencesDidUpdate")
    static let conversationMarkedAsRead = Notification.Name("conversationMarkedAsRead")
    /// Posted when a message is sent from chat - used to update conversation list
    static let messageSentFromChat = Notification.Name("messageSentFromChat")
}
