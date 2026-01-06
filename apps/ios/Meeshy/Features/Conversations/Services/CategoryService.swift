//
//  CategoryService.swift
//  Meeshy
//
//  Service for managing user conversation categories
//  Handles CRUD operations, ordering, and caching
//
//  Architecture:
//  ┌─────────────────────────────────────────────────┐
//  │              CategoryService                     │
//  ├─────────────────────────────────────────────────┤
//  │  Layer 1: In-Memory Cache (instant, TTL-based)  │
//  │  Layer 2: Disk Cache (fast, ~5ms)               │
//  │  Layer 3: API (slow, ~300ms+)                   │
//  └─────────────────────────────────────────────────┘
//

import Foundation

// MARK: - Category Service

actor CategoryService {
    // MARK: - Singleton

    static let shared = CategoryService()

    // MARK: - Properties

    private var cachedCategories: [UserConversationCategory] = []
    private var lastFetchTime: Date?
    private let cacheTTL: TimeInterval = 300 // 5 minutes
    private let apiClient: APIClient
    private let diskCache = CategoryCache.shared

    // MARK: - Initialization

    private init(apiClient: APIClient = APIClient.shared) {
        self.apiClient = apiClient
    }

    // MARK: - Initialization (Startup)

    /// Load categories from disk cache at app startup
    /// Call this during app initialization for instant category display
    func loadFromDiskCache() async -> [UserConversationCategory] {
        let categories = await diskCache.loadCategories()
        if !categories.isEmpty {
            cachedCategories = categories
            lastFetchTime = await diskCache.getMetadata()?.lastUpdated
            chatLogger.info("📂 Loaded \(categories.count) categories from disk cache")
        }
        return categories
    }

    // MARK: - Fetch Categories

    /// Fetch all user categories, sorted by order
    /// Uses three-layer caching: memory -> disk -> API
    func fetchCategories(forceRefresh: Bool = false) async throws -> [UserConversationCategory] {
        // Layer 1: Check in-memory cache first (instant)
        if !forceRefresh, let lastFetch = lastFetchTime,
           Date().timeIntervalSince(lastFetch) < cacheTTL,
           !cachedCategories.isEmpty {
            chatLogger.debug("📂 Returning \(cachedCategories.count) categories from memory cache")
            return sortedCategories(cachedCategories)
        }

        // Layer 2: Check disk cache if memory is stale (fast, ~5ms)
        if !forceRefresh {
            let diskCategories = await diskCache.loadCategories()
            let isStale = await diskCache.isCacheStale(maxAge: cacheTTL)
            if !diskCategories.isEmpty, !isStale {
                cachedCategories = diskCategories
                lastFetchTime = await diskCache.getMetadata()?.lastUpdated
                chatLogger.debug("📂 Returning \(diskCategories.count) categories from disk cache")

                // Trigger background refresh
                Task.detached { [weak self] in
                    try? await self?.refreshFromAPIInBackground()
                }

                return sortedCategories(diskCategories)
            }
        }

        // Layer 3: Fetch from API (slow, ~300ms+)
        return try await fetchFromAPI()
    }

    /// Fetch categories directly from API and update all caches
    private func fetchFromAPI() async throws -> [UserConversationCategory] {
        let response: APIResponse<[UserConversationCategory]> = try await apiClient.request(
            CategoryEndpoints.fetchCategories
        )

        guard let categories = response.data else {
            throw MeeshyError.unknown
        }

        // Update in-memory cache
        cachedCategories = categories
        lastFetchTime = Date()

        // Update disk cache
        await diskCache.saveCategories(categories)

        let sorted = sortedCategories(categories)

        // Log isExpanded state for each category (debugging fold/unfold)
        for cat in sorted {
            chatLogger.info("📂 [API] Category '\(cat.name)' - isExpanded: \(cat.isExpanded), order: \(cat.order)")
        }

        // Post notification
        await MainActor.run {
            NotificationCenter.default.post(
                name: .categoriesDidUpdate,
                object: nil,
                userInfo: ["categories": sorted]
            )
        }

        chatLogger.info("📂 Fetched \(sorted.count) categories from API")
        return sorted
    }

    /// Refresh categories from API in background (doesn't throw)
    private func refreshFromAPIInBackground() async throws {
        chatLogger.debug("📂 Background refresh of categories starting...")
        let _ = try await fetchFromAPI()
        chatLogger.debug("📂 Background refresh of categories completed")
    }

    /// Sort categories by order, then alphabetically for same order
    private func sortedCategories(_ categories: [UserConversationCategory]) -> [UserConversationCategory] {
        categories.sorted { cat1, cat2 in
            if cat1.order != cat2.order {
                return cat1.order < cat2.order
            }
            return cat1.name.localizedCaseInsensitiveCompare(cat2.name) == .orderedAscending
        }
    }

    // MARK: - Create Category

    func createCategory(request: UserConversationCategoryCreateRequest) async throws -> UserConversationCategory {
        let response: APIResponse<UserConversationCategory> = try await apiClient.request(
            CategoryEndpoints.createCategory(request)
        )

        guard let category = response.data else {
            throw MeeshyError.unknown
        }

        // Update in-memory cache
        cachedCategories.append(category)

        // Update disk cache
        await diskCache.updateCategory(category)

        // Post notification
        await MainActor.run {
            NotificationCenter.default.post(
                name: .categoryDidCreate,
                object: nil,
                userInfo: ["category": category]
            )
        }

        chatLogger.info("📂 Created category: \(category.name)")
        return category
    }

    // MARK: - Update Category

    func updateCategory(id: String, request: UserConversationCategoryUpdateRequest) async throws -> UserConversationCategory {
        let response: APIResponse<UserConversationCategory> = try await apiClient.request(
            CategoryEndpoints.updateCategory(id: id, request)
        )

        guard let category = response.data else {
            throw MeeshyError.unknown
        }

        // Update in-memory cache
        if let index = cachedCategories.firstIndex(where: { $0.id == id }) {
            cachedCategories[index] = category
        }

        // Update disk cache
        await diskCache.updateCategory(category)

        // Post notification
        await MainActor.run {
            NotificationCenter.default.post(
                name: .categoryDidUpdate,
                object: nil,
                userInfo: ["category": category]
            )
        }

        chatLogger.info("📂 Updated category: \(category.name)")
        return category
    }

    // MARK: - Update Expanded State (Local + API)

    /// Update the expanded state of a category
    /// Updates disk cache immediately for instant persistence, then syncs with API
    func updateExpandedState(categoryId: String, isExpanded: Bool) async throws {
        // Update disk cache immediately (optimistic update)
        await diskCache.updateExpandedState(categoryId: categoryId, isExpanded: isExpanded)

        // Update in-memory cache
        if let index = cachedCategories.firstIndex(where: { $0.id == categoryId }) {
            let category = cachedCategories[index]
            cachedCategories[index] = UserConversationCategory(
                id: category.id,
                userId: category.userId,
                name: category.name,
                color: category.color,
                icon: category.icon,
                order: category.order,
                isExpanded: isExpanded,
                createdAt: category.createdAt,
                updatedAt: Date(),
                conversations: category.conversations,
                conversationCount: category.conversationCount
            )
        }

        // Sync with API in background
        let request = UserConversationCategoryUpdateRequest(
            name: nil,
            color: nil,
            icon: nil,
            order: nil,
            isExpanded: isExpanded
        )

        do {
            let _: APIResponse<UserConversationCategory> = try await apiClient.request(
                CategoryEndpoints.updateCategory(id: categoryId, request)
            )
            chatLogger.debug("📂 Synced expanded state for category \(categoryId): \(isExpanded)")
        } catch {
            // Revert on error? For now, keep the local state
            chatLogger.warn("📂 Failed to sync expanded state: \(error.localizedDescription)")
        }
    }

    // MARK: - Delete Category

    func deleteCategory(id: String) async throws {
        let _: APIResponse<EmptyResponse> = try await apiClient.request(
            CategoryEndpoints.deleteCategory(id: id)
        )

        // Update in-memory cache
        cachedCategories.removeAll { $0.id == id }

        // Update disk cache
        await diskCache.removeCategory(id: id)

        // Post notification
        await MainActor.run {
            NotificationCenter.default.post(
                name: .categoryDidDelete,
                object: nil,
                userInfo: ["categoryId": id]
            )
        }

        chatLogger.info("📂 Deleted category: \(id)")
    }

    // MARK: - Reorder Categories

    /// Reorder categories by providing new order values
    /// - Parameter categoryOrders: Array of (categoryId, newOrder) tuples
    func reorderCategories(_ categoryOrders: [(id: String, order: Int)]) async throws {
        let orders = categoryOrders.map {
            UserConversationCategoryReorderRequest.CategoryOrder(id: $0.id, order: $0.order)
        }

        let request = UserConversationCategoryReorderRequest(categoryOrders: orders)

        let _: APIResponse<EmptyResponse> = try await apiClient.request(
            CategoryEndpoints.reorderCategories(request)
        )

        // Update in-memory cache with new order
        for (id, order) in categoryOrders {
            if let index = cachedCategories.firstIndex(where: { $0.id == id }) {
                cachedCategories[index] = cachedCategories[index].withOrder(order)
            }
        }

        // Update disk cache
        await diskCache.saveCategories(cachedCategories)

        let sorted = sortedCategories(cachedCategories)

        // Post notification
        await MainActor.run {
            NotificationCenter.default.post(
                name: .categoriesDidReorder,
                object: nil,
                userInfo: ["categories": sorted]
            )
        }

        chatLogger.info("📂 Reordered \(categoryOrders.count) categories")
    }

    // MARK: - Assign/Remove Conversation from Category
    // Note: Category assignment is now done via UserPreferences endpoints
    // Use UserPreferencesService.updatePreferences() to set categoryId

    func assignConversation(categoryId: String, conversationId: String) async throws {
        // Update user preferences with the new category
        let request = UserPreferencesUpdateRequest(categoryId: categoryId)
        let _: APIResponse<ConversationPreferencesResponse> = try await apiClient.request(
            UserPreferencesEndpoints.updatePreferences(conversationId: conversationId, request)
        )

        // Post notification
        await MainActor.run {
            NotificationCenter.default.post(
                name: .conversationCategoryDidChange,
                object: nil,
                userInfo: ["conversationId": conversationId, "categoryId": categoryId]
            )
        }

        chatLogger.info("📂 Assigned conversation \(conversationId) to category \(categoryId)")
    }

    func removeConversation(categoryId: String, conversationId: String) async throws {
        // Update user preferences to clear the category (set to nil/empty)
        // We pass an empty categoryId to remove the category assignment
        let request = UserPreferencesUpdateRequest(categoryId: "")
        let _: APIResponse<ConversationPreferencesResponse> = try await apiClient.request(
            UserPreferencesEndpoints.updatePreferences(conversationId: conversationId, request)
        )

        // Post notification
        await MainActor.run {
            NotificationCenter.default.post(
                name: .conversationCategoryDidChange,
                object: nil,
                userInfo: ["conversationId": conversationId, "categoryId": NSNull()]
            )
        }

        chatLogger.info("📂 Removed conversation \(conversationId) from category \(categoryId)")
    }

    // MARK: - Cache Management

    func clearCache() async {
        cachedCategories = []
        lastFetchTime = nil
        await diskCache.clearCache()
        chatLogger.info("📂 All category caches cleared")
    }

    func getCachedCategories() -> [UserConversationCategory] {
        sortedCategories(cachedCategories)
    }

    /// Flush disk cache if needed
    func flushDiskCache() async {
        await diskCache.flushIfNeeded()
    }

    /// Check if we have any cached categories (memory or disk)
    func hasCachedCategories() async -> Bool {
        if !cachedCategories.isEmpty {
            return true
        }
        return await diskCache.hasValidCache
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let categoriesDidUpdate = Notification.Name("categoriesDidUpdate")
    static let categoryDidCreate = Notification.Name("categoryDidCreate")
    static let categoryDidUpdate = Notification.Name("categoryDidUpdate")
    static let categoryDidDelete = Notification.Name("categoryDidDelete")
    static let categoriesDidReorder = Notification.Name("categoriesDidReorder")
    static let conversationCategoryDidChange = Notification.Name("conversationCategoryDidChange")
}

// MARK: - UserConversationCategory Extension

extension UserConversationCategory {
    func withOrder(_ newOrder: Int) -> UserConversationCategory {
        UserConversationCategory(
            id: id,
            userId: userId,
            name: name,
            color: color,
            icon: icon,
            order: newOrder,
            isExpanded: isExpanded,
            createdAt: createdAt,
            updatedAt: Date(),
            conversations: conversations,
            conversationCount: conversationCount
        )
    }
}
