//
//  DataManager.swift
//  Meeshy
//
//  Unified data manager orchestrating all persistence layers
//  Provides a single interface for fast data access
//
//  Architecture (SIMPLIFIED):
//  ┌─────────────────────────────────────────────────┐
//  │                  DataManager                     │
//  ├─────────────────────────────────────────────────┤
//  │  ConversationCache (JSON)  → Instant load ~10ms │
//  │  CategoryCache (JSON)      → Instant load ~5ms  │
//  │  CommunityCache (JSON)     → Instant load ~5ms  │
//  │  MessageStore (SQLite)     → Fast queries ~1ms  │
//  └─────────────────────────────────────────────────┘
//

import Foundation

// MARK: - Data Manager

@MainActor
final class DataManager: ObservableObject {

    // MARK: - Singleton

    static let shared = DataManager()

    // MARK: - Published State

    @Published private(set) var isReady = false
    @Published private(set) var conversations: [Conversation] = []

    /// Categories loaded from disk cache (full data with isExpanded state)
    @Published private(set) var categories: [UserConversationCategory] = []

    /// Communities loaded from disk cache
    @Published private(set) var communities: [Community] = []

    /// Conversations grouped by category ID (nil = uncategorized)
    @Published private(set) var conversationsByCategory: [String?: [Conversation]] = [:]

    /// Conversations grouped by community ID
    @Published private(set) var conversationsByCommunity: [String?: [Conversation]] = [:]

    /// Flag indicating data is fully structured and ready to display
    @Published private(set) var isFullyStructured = false

    /// Flag indicating categories are loaded from disk cache
    @Published private(set) var categoriesLoaded = false

    /// Flag indicating communities are loaded from disk cache
    @Published private(set) var communitiesLoaded = false

    // MARK: - Persistence Layers

    private let conversationCache = ConversationCache.shared
    private let categoryCache = CategoryCache.shared
    private let communityCache = CommunityCache.shared
    private let messageStore = MessageStore.shared

    // MARK: - Initialization

    private init() {}

    // MARK: - Startup

    /// Initialize all caches - call at app startup
    /// Returns in ~10-50ms vs ~500ms+ with CoreData only
    /// PERFORMANCE FIX: I/O operations run in parallel on background threads
    func initialize() async {
        let startTime = CFAbsoluteTimeGetCurrent()

        // PERFORMANCE FIX: Force I/O operations off the main thread using Task.detached
        // This ensures JSON file reads don't block the UI
        let (cachedConversations, cachedCategories, cachedCommunities) = await Task.detached(priority: .userInitiated) { [conversationCache, categoryCache, communityCache] in
            // Load all caches in parallel from fast JSON files
            async let c1 = conversationCache.loadConversations()
            async let c2 = categoryCache.loadCategories()
            async let c3 = communityCache.loadCommunities()
            return await (c1, c2, c3)
        }.value

        // Update @Published properties (we're already on @MainActor)
        self.conversations = cachedConversations
        self.categories = cachedCategories
        self.communities = cachedCommunities
        self.categoriesLoaded = !cachedCategories.isEmpty
        self.communitiesLoaded = !cachedCommunities.isEmpty
        self.isReady = true

        let elapsed = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
        cacheLogger.info("DataManager: Initialized in \(String(format: "%.1f", elapsed))ms with \(cachedConversations.count) conversations, \(cachedCategories.count) categories, \(cachedCommunities.count) communities")
    }

    /// Structure conversations by categories - call after initialize()
    /// This pre-computes the category grouping so the UI can display instantly
    /// Uses disk-cached categories if available (with full isExpanded state),
    /// otherwise falls back to extracting categories from conversations
    /// PERFORMANCE FIX: Grouping computation moved to background thread
    func structureConversations() async {
        let startTime = CFAbsoluteTimeGetCurrent()

        // Capture current state for background computation
        let currentConversations = conversations
        let currentCategories = categories

        // PERFORMANCE FIX: Do heavy computation on background thread
        let (categoriesToUse, grouped) = await Task.detached(priority: .userInitiated) {
            // Use disk-cached categories if available (they have full data including isExpanded)
            // Otherwise fall back to extracting from conversations (partial data)
            let cats: [UserConversationCategory]
            if !currentCategories.isEmpty {
                cats = currentCategories
            } else {
                // Extract categories from conversations
                var categoryDict: [String: UserConversationCategory] = [:]
                for conversation in currentConversations {
                    if let category = conversation.userPreferences?.category {
                        if categoryDict[category.id] == nil || category.order > (categoryDict[category.id]?.order ?? 0) {
                            categoryDict[category.id] = category
                        }
                    } else if let category = conversation.preferences?.category {
                        let userCategory = UserConversationCategory(
                            id: category.id,
                            name: category.name,
                            color: category.color,
                            icon: category.icon,
                            order: category.order
                        )
                        if categoryDict[category.id] == nil || category.order > (categoryDict[category.id]?.order ?? 0) {
                            categoryDict[category.id] = userCategory
                        }
                    }
                }
                cats = categoryDict.values.sorted { cat1, cat2 in
                    if cat1.order > 0 && cat2.order > 0 {
                        return cat1.order < cat2.order
                    } else if cat1.order > 0 {
                        return true
                    } else if cat2.order > 0 {
                        return false
                    } else {
                        return cat1.name.localizedCaseInsensitiveCompare(cat2.name) == .orderedAscending
                    }
                }
            }

            // Group conversations by category
            var grp: [String?: [Conversation]] = [nil: []]
            for category in cats {
                grp[category.id] = []
            }
            for conversation in currentConversations {
                let categoryId = conversation.userPreferences?.categoryId
                    ?? conversation.userPreferences?.category?.id
                    ?? conversation.preferences?.category?.id
                if grp[categoryId] != nil {
                    grp[categoryId]?.append(conversation)
                } else {
                    grp[nil]?.append(conversation)
                }
            }
            for key in grp.keys {
                grp[key]?.sort { $0.lastMessageAt > $1.lastMessageAt }
            }

            return (cats, grp)
        }.value

        // Update @Published properties (we're already on @MainActor)
        if self.categories.isEmpty {
            self.categories = categoriesToUse
        }
        self.conversationsByCategory = grouped
        self.isFullyStructured = true

        let elapsed = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
        cacheLogger.info("DataManager: Structured \(conversations.count) conversations into \(categoriesToUse.count) categories in \(String(format: "%.1f", elapsed))ms")
    }

    /// Extract unique categories from all conversations
    /// Checks both userPreferences.category (full object) and preferences.category (fallback)
    private func extractCategoriesFromConversations() -> [UserConversationCategory] {
        var categoryDict: [String: UserConversationCategory] = [:]

        for conversation in conversations {
            // Priority 1: userPreferences.category (full UserConversationCategory object)
            if let category = conversation.userPreferences?.category {
                if categoryDict[category.id] == nil || category.order > (categoryDict[category.id]?.order ?? 0) {
                    categoryDict[category.id] = category
                }
                continue
            }

            // Priority 2: preferences.category (ConversationCategory - needs conversion)
            if let category = conversation.preferences?.category {
                let userCategory = UserConversationCategory(
                    id: category.id,
                    name: category.name,
                    color: category.color,
                    icon: category.icon,
                    order: category.order
                )
                if categoryDict[category.id] == nil || category.order > (categoryDict[category.id]?.order ?? 0) {
                    categoryDict[category.id] = userCategory
                }
            }
        }

        // Sort: categories with order > 0 first (by order), then order == 0 (alphabetically)
        return categoryDict.values.sorted { cat1, cat2 in
            if cat1.order > 0 && cat2.order > 0 {
                return cat1.order < cat2.order
            } else if cat1.order > 0 {
                return true
            } else if cat2.order > 0 {
                return false
            } else {
                return cat1.name.localizedCaseInsensitiveCompare(cat2.name) == .orderedAscending
            }
        }
    }

    /// Group conversations by their category ID
    /// Checks both userPreferences.categoryId (primary) and preferences.category.id (fallback)
    private func groupConversationsByCategory(categories: [UserConversationCategory]) -> [String?: [Conversation]] {
        var grouped: [String?: [Conversation]] = [:]

        // Initialize with nil key for uncategorized
        grouped[nil] = []

        // Initialize all category keys
        for category in categories {
            grouped[category.id] = []
        }

        // Sort conversations into groups
        // Priority: userPreferences.categoryId > userPreferences.category.id > preferences.category.id
        for conversation in conversations {
            let categoryId = conversation.userPreferences?.categoryId
                ?? conversation.userPreferences?.category?.id
                ?? conversation.preferences?.category?.id

            if grouped[categoryId] != nil {
                grouped[categoryId]?.append(conversation)
            } else {
                // Unknown category, put in uncategorized
                grouped[nil]?.append(conversation)
            }
        }

        // Sort each group by lastMessageAt (newest first)
        for key in grouped.keys {
            grouped[key]?.sort { $0.lastMessageAt > $1.lastMessageAt }
        }

        return grouped
    }

    // MARK: - Conversation Operations

    /// Get all conversations (from memory)
    func getConversations() -> [Conversation] {
        return conversations
    }

    /// Refresh conversations from cache
    func refreshConversations() async -> [Conversation] {
        let cached = await conversationCache.loadConversations()
        await MainActor.run {
            self.conversations = cached
        }
        return cached
    }

    /// Update conversations (e.g., after API fetch)
    func updateConversations(_ newConversations: [Conversation]) async {
        await conversationCache.saveConversations(newConversations)
        await MainActor.run {
            self.conversations = newConversations
        }
    }

    /// Update a single conversation
    func updateConversation(_ conversation: Conversation) async {
        await conversationCache.updateConversation(conversation)

        await MainActor.run {
            if let index = self.conversations.firstIndex(where: { $0.id == conversation.id }) {
                self.conversations[index] = conversation
            } else {
                self.conversations.insert(conversation, at: 0)
            }
            self.conversations.sort { $0.lastMessageAt > $1.lastMessageAt }
        }
    }

    /// Remove a conversation
    func removeConversation(id: String) async {
        await conversationCache.removeConversation(id: id)
        await messageStore.deleteMessages(conversationId: id)

        await MainActor.run {
            self.conversations.removeAll { $0.id == id }
        }
    }

    // MARK: - Message Operations

    /// Load messages for a conversation
    func loadMessages(conversationId: String, limit: Int = 50, offset: Int = 0) async -> [Message] {
        return await messageStore.loadMessages(conversationId: conversationId, limit: limit, offset: offset)
    }

    /// Save a message
    func saveMessage(_ message: Message) async {
        await messageStore.saveMessage(message)

        // Update conversation's last message
        if var conversation = conversations.first(where: { $0.id == message.conversationId }) {
            conversation = Conversation(
                id: conversation.id,
                identifier: conversation.identifier,
                type: conversation.type,
                title: conversation.title,
                description: conversation.description,
                image: conversation.image,
                avatar: conversation.avatar,
                communityId: conversation.communityId,
                isActive: conversation.isActive,
                isArchived: conversation.isArchived,
                lastMessageAt: message.createdAt,
                createdAt: conversation.createdAt,
                updatedAt: Date(),
                members: conversation.members,
                lastMessage: message,
                shareLinks: conversation.shareLinks,
                anonymousParticipants: conversation.anonymousParticipants,
                userPreferences: conversation.userPreferences,
                unreadCount: conversation.unreadCount,
                isMuted: conversation.isMuted,
                isPinned: conversation.isPinned
            )
            await updateConversation(conversation)
        }
    }

    /// Save multiple messages (batch)
    func saveMessages(_ messages: [Message]) async {
        await messageStore.saveMessages(messages)
    }

    /// Get unsent messages for retry
    func getUnsentMessages() async -> [Message] {
        return await messageStore.getUnsentMessages()
    }

    /// Search messages
    func searchMessages(query: String, conversationId: String? = nil) async -> [Message] {
        return await messageStore.searchMessages(query: query, conversationId: conversationId)
    }

    // MARK: - Category Operations

    /// Update categories from API response
    func updateCategories(_ newCategories: [UserConversationCategory]) async {
        await categoryCache.saveCategories(newCategories)
        await MainActor.run {
            self.categories = newCategories
            self.categoriesLoaded = true
        }

        // Re-group conversations with updated categories
        let grouped = groupConversationsByCategory(categories: newCategories)
        await MainActor.run {
            self.conversationsByCategory = grouped
        }

        cacheLogger.info("DataManager: Updated \(newCategories.count) categories")
    }

    /// Get categories (from memory or disk cache)
    func getCategories() async -> [UserConversationCategory] {
        if !categories.isEmpty {
            return categories
        }
        return await categoryCache.loadCategories()
    }

    /// Refresh categories from API in background
    /// Returns cached categories immediately, then updates with API data
    func refreshCategoriesInBackground() async {
        // Trigger CategoryService to refresh in background
        Task.detached {
            do {
                let freshCategories = try await CategoryService.shared.fetchCategories(forceRefresh: true)
                await MainActor.run {
                    DataManager.shared.categories = freshCategories
                    DataManager.shared.categoriesLoaded = true
                }
            } catch {
                cacheLogger.warn("DataManager: Background category refresh failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Community Operations

    /// Update communities from API response
    func updateCommunities(_ newCommunities: [Community]) async {
        await communityCache.saveCommunities(newCommunities)
        await MainActor.run {
            self.communities = newCommunities
            self.communitiesLoaded = true
        }

        // Re-group conversations by community
        let grouped = groupConversationsByCommunity()
        await MainActor.run {
            self.conversationsByCommunity = grouped
        }

        cacheLogger.info("DataManager: Updated \(newCommunities.count) communities")
    }

    /// Get communities (from memory)
    func getCommunities() -> [Community] {
        return communities
    }

    /// Group conversations by community ID
    private func groupConversationsByCommunity() -> [String?: [Conversation]] {
        var grouped: [String?: [Conversation]] = [:]
        grouped[nil] = [] // No community

        for conversation in conversations {
            let communityId = conversation.communityId
            if grouped[communityId] == nil {
                grouped[communityId] = []
            }
            grouped[communityId]?.append(conversation)
        }

        // Sort each group by lastMessageAt (newest first)
        for key in grouped.keys {
            grouped[key]?.sort { $0.lastMessageAt > $1.lastMessageAt }
        }

        return grouped
    }

    // MARK: - Message Prefetching

    /// Prefetch messages for recent conversations (call in background after startup)
    func prefetchRecentMessages(count: Int = 5, messagesPerConversation: Int = 30) async {
        let recentConversations = Array(conversations.prefix(count))
        cacheLogger.info("DataManager: Prefetching messages for \(recentConversations.count) recent conversations")

        for conversation in recentConversations {
            // Check if we already have cached messages
            let cachedMessages = await messageStore.loadMessages(
                conversationId: conversation.id,
                limit: messagesPerConversation
            )

            if cachedMessages.isEmpty {
                // Messages will be fetched when user opens conversation
                // This is just a placeholder for future API prefetch integration
                cacheLogger.debug("DataManager: No cached messages for \(conversation.displayName)")
            } else {
                cacheLogger.debug("DataManager: Found \(cachedMessages.count) cached messages for \(conversation.displayName)")
            }
        }
    }

    /// Check if messages are cached for a conversation
    func hasMessageCache(conversationId: String) async -> Bool {
        let messages = await messageStore.loadMessages(conversationId: conversationId, limit: 1)
        return !messages.isEmpty
    }

    /// Get total message count (all conversations)
    func getTotalMessageCount() async -> Int {
        return await messageStore.getMessageCount()
    }

    // MARK: - Cache Management

    /// Flush all pending writes to disk
    func flush() async {
        await conversationCache.flushIfNeeded()
        await categoryCache.flushIfNeeded()
    }

    /// Clear all cached data (logout)
    func clearAllData() async {
        await conversationCache.clearCache()
        await categoryCache.clearCache()
        await communityCache.clearCache()
        await messageStore.clearAll()

        await MainActor.run {
            self.conversations = []
            self.categories = []
            self.communities = []
            self.conversationsByCategory = [:]
            self.conversationsByCommunity = [:]
            self.categoriesLoaded = false
            self.communitiesLoaded = false
            self.isFullyStructured = false
            self.isReady = false
        }

        cacheLogger.info("DataManager: All data cleared")
    }

    /// Get cache statistics
    func getCacheStats() async -> FastCacheStats {
        let messageCount = await messageStore.getMessageCount()
        let conversationMetadata = await conversationCache.getMetadata()
        let categoryMetadata = await categoryCache.getMetadata()

        return FastCacheStats(
            conversationCount: conversations.count,
            categoryCount: categories.count,
            communityCount: communities.count,
            messageCount: messageCount,
            lastUpdated: conversationMetadata?.lastUpdated,
            categoryLastUpdated: categoryMetadata?.lastUpdated,
            cacheVersion: conversationMetadata?.version ?? 0
        )
    }

    // MARK: - Sync with Backend

    /// Sync local data with backend (background operation)
    func syncWithBackend(conversations: [Conversation], messages: [String: [Message]]) async {
        // Save conversations
        await conversationCache.saveConversations(conversations)

        // Save messages per conversation
        for (conversationId, msgs) in messages {
            let existingMessages = await messageStore.loadMessages(conversationId: conversationId, limit: 1000)
            let existingIds = Set(existingMessages.map { $0.id })

            // Only save new messages
            let newMessages = msgs.filter { !existingIds.contains($0.id) }
            if !newMessages.isEmpty {
                await messageStore.saveMessages(newMessages)
            }
        }

        // Update in-memory state
        await MainActor.run {
            self.conversations = conversations
        }

        cacheLogger.info("DataManager: Synced \(conversations.count) conversations")
    }
}

// MARK: - Fast Cache Stats

struct FastCacheStats: Sendable {
    let conversationCount: Int
    let categoryCount: Int
    let communityCount: Int
    let messageCount: Int
    let lastUpdated: Date?
    let categoryLastUpdated: Date?
    let cacheVersion: Int
}

// MARK: - Convenience Extensions

extension DataManager {
    /// Check if we have cached data
    var hasCachedData: Bool {
        !conversations.isEmpty
    }

    /// Get conversation by ID
    func getConversation(id: String) -> Conversation? {
        conversations.first { $0.id == id }
    }

    /// Increment unread count for a conversation
    func incrementUnreadCount(conversationId: String) async {
        guard var conversation = getConversation(id: conversationId) else { return }

        conversation = Conversation(
            id: conversation.id,
            identifier: conversation.identifier,
            type: conversation.type,
            title: conversation.title,
            description: conversation.description,
            image: conversation.image,
            avatar: conversation.avatar,
            communityId: conversation.communityId,
            isActive: conversation.isActive,
            isArchived: conversation.isArchived,
            lastMessageAt: conversation.lastMessageAt,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            members: conversation.members,
            lastMessage: conversation.lastMessage,
            shareLinks: conversation.shareLinks,
            anonymousParticipants: conversation.anonymousParticipants,
            userPreferences: conversation.userPreferences,
            unreadCount: conversation.unreadCount + 1,
            isMuted: conversation.isMuted,
            isPinned: conversation.isPinned
        )

        await updateConversation(conversation)
    }

    /// Mark conversation as read
    func markAsRead(conversationId: String) async {
        guard var conversation = getConversation(id: conversationId) else { return }

        conversation = Conversation(
            id: conversation.id,
            identifier: conversation.identifier,
            type: conversation.type,
            title: conversation.title,
            description: conversation.description,
            image: conversation.image,
            avatar: conversation.avatar,
            communityId: conversation.communityId,
            isActive: conversation.isActive,
            isArchived: conversation.isArchived,
            lastMessageAt: conversation.lastMessageAt,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            members: conversation.members,
            lastMessage: conversation.lastMessage,
            shareLinks: conversation.shareLinks,
            anonymousParticipants: conversation.anonymousParticipants,
            userPreferences: conversation.userPreferences,
            unreadCount: 0,
            isMuted: conversation.isMuted,
            isPinned: conversation.isPinned
        )

        await updateConversation(conversation)
    }
}
