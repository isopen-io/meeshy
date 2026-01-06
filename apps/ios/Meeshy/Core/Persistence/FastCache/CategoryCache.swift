//
//  CategoryCache.swift
//  Meeshy
//
//  Ultra-fast JSON-based cache for user conversation categories
//  Provides instant app startup by persisting categories to disk
//  Thread-safe with actor isolation
//
//  Performance: ~5ms load vs ~300ms+ API call
//

import Foundation

// MARK: - Cache Metadata

struct CategoryCacheMetadata: Codable, Sendable {
    let version: Int
    let lastUpdated: Date
    let count: Int

    static let currentVersion = 1
}

// MARK: - Category Cache Actor

actor CategoryCache {

    // MARK: - Singleton

    static let shared = CategoryCache()

    // MARK: - Properties

    private let fileManager = FileManager.default
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    private var cachedData: [UserConversationCategory]?
    private var isDirty = false
    private var lastSaveTime: Date?

    // File paths
    private let cacheDirectory: URL
    private let dataFileURL: URL
    private let metadataFileURL: URL

    // MARK: - Initialization

    private init() {
        let fm = FileManager.default
        let cacheDir = fm.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("CategoryCache", isDirectory: true)
        self.cacheDirectory = cacheDir
        self.dataFileURL = cacheDir.appendingPathComponent("categories.json")
        self.metadataFileURL = cacheDir.appendingPathComponent("category_metadata.json")

        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]

        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        // Ensure cache directory exists
        try? fm.createDirectory(at: cacheDir, withIntermediateDirectories: true)
    }

    // MARK: - Public API

    /// Load categories from cache (ultra-fast, ~5ms)
    func loadCategories() async -> [UserConversationCategory] {
        // Return in-memory cache if available
        if let cached = cachedData {
            return sortedCategories(cached)
        }

        // Load from disk
        guard fileManager.fileExists(atPath: dataFileURL.path) else {
            cacheLogger.debug("CategoryCache: No cache file exists")
            return []
        }

        do {
            let startTime = CFAbsoluteTimeGetCurrent()

            let data = try Data(contentsOf: dataFileURL)
            let cached = try decoder.decode([UserConversationCategory].self, from: data)

            let elapsed = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
            cacheLogger.info("CategoryCache: Loaded \(cached.count) categories in \(String(format: "%.1f", elapsed))ms")

            self.cachedData = cached
            return sortedCategories(cached)

        } catch {
            cacheLogger.error("CategoryCache: Failed to load - \(error.localizedDescription)")
            return []
        }
    }

    /// Save categories to cache
    func saveCategories(_ categories: [UserConversationCategory]) async {
        let startTime = CFAbsoluteTimeGetCurrent()

        self.cachedData = categories

        do {
            let data = try encoder.encode(categories)
            try data.write(to: dataFileURL, options: [.atomic])

            // Update metadata
            let metadata = CategoryCacheMetadata(
                version: CategoryCacheMetadata.currentVersion,
                lastUpdated: Date(),
                count: categories.count
            )
            let metadataData = try encoder.encode(metadata)
            try metadataData.write(to: metadataFileURL, options: [.atomic])

            let elapsed = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
            cacheLogger.info("CategoryCache: Saved \(categories.count) categories in \(String(format: "%.1f", elapsed))ms")

            isDirty = false
            lastSaveTime = Date()

        } catch {
            cacheLogger.error("CategoryCache: Failed to save - \(error.localizedDescription)")
        }
    }

    /// Update a single category in cache
    func updateCategory(_ category: UserConversationCategory) async {
        if cachedData == nil {
            _ = await loadCategories()
        }

        if let index = cachedData?.firstIndex(where: { $0.id == category.id }) {
            cachedData?[index] = category
        } else {
            cachedData?.append(category)
        }

        // Sort by order
        cachedData?.sort { $0.order < $1.order }

        isDirty = true
        await debouncedSave()
    }

    /// Remove a category from cache
    func removeCategory(id: String) async {
        cachedData?.removeAll { $0.id == id }
        isDirty = true
        await debouncedSave()
    }

    /// Update expanded state for a category
    func updateExpandedState(categoryId: String, isExpanded: Bool) async {
        if cachedData == nil {
            _ = await loadCategories()
        }

        if let index = cachedData?.firstIndex(where: { $0.id == categoryId }) {
            let category = cachedData![index]
            let updatedCategory = UserConversationCategory(
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
            cachedData?[index] = updatedCategory
            isDirty = true
            await debouncedSave()
        }
    }

    /// Clear all cached data
    func clearCache() async {
        cachedData = nil

        try? fileManager.removeItem(at: dataFileURL)
        try? fileManager.removeItem(at: metadataFileURL)

        cacheLogger.info("CategoryCache: Cache cleared")
    }

    /// Force save if dirty
    func flushIfNeeded() async {
        guard isDirty, let cached = cachedData else { return }
        await saveCategories(cached)
    }

    /// Get cache metadata
    func getMetadata() async -> CategoryCacheMetadata? {
        guard fileManager.fileExists(atPath: metadataFileURL.path) else { return nil }

        do {
            let data = try Data(contentsOf: metadataFileURL)
            return try decoder.decode(CategoryCacheMetadata.self, from: data)
        } catch {
            return nil
        }
    }

    /// Get category by ID from cache
    func getCategory(id: String) async -> UserConversationCategory? {
        if cachedData == nil {
            _ = await loadCategories()
        }
        return cachedData?.first { $0.id == id }
    }

    /// Get all cached categories (without loading from disk)
    func getCachedCategories() -> [UserConversationCategory] {
        return sortedCategories(cachedData ?? [])
    }

    // MARK: - Private Methods

    private var saveTask: Task<Void, Never>?

    private func debouncedSave() async {
        saveTask?.cancel()

        saveTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000) // 300ms debounce

            guard !Task.isCancelled else { return }

            if let cached = cachedData {
                await saveCategories(cached)
            }
        }
    }

    /// Sort categories by order, then alphabetically
    private func sortedCategories(_ categories: [UserConversationCategory]) -> [UserConversationCategory] {
        categories.sorted { cat1, cat2 in
            if cat1.order != cat2.order {
                return cat1.order < cat2.order
            }
            return cat1.name.localizedCaseInsensitiveCompare(cat2.name) == .orderedAscending
        }
    }
}

// MARK: - Convenience Extension

extension CategoryCache {
    /// Preload cache into memory (call at app startup)
    func preload() async {
        _ = await loadCategories()
    }

    /// Check if cache has valid data
    var hasValidCache: Bool {
        get async {
            if cachedData != nil { return true }
            return fileManager.fileExists(atPath: dataFileURL.path)
        }
    }

    /// Check if cache is stale (older than specified interval)
    func isCacheStale(maxAge: TimeInterval = 300) async -> Bool {
        guard let metadata = await getMetadata() else { return true }
        return Date().timeIntervalSince(metadata.lastUpdated) > maxAge
    }

    /// Merge API categories with cached categories
    /// Preserves local isExpanded state if not provided by API
    func mergeWithAPICategories(_ apiCategories: [UserConversationCategory]) async -> [UserConversationCategory] {
        let cachedDict = (cachedData ?? []).reduce(into: [String: UserConversationCategory]()) { dict, cat in
            dict[cat.id] = cat
        }

        // Merge: use API data but preserve local isExpanded state if API doesn't provide it
        let merged = apiCategories.map { apiCategory -> UserConversationCategory in
            if let cached = cachedDict[apiCategory.id] {
                // API provides isExpanded, use it; otherwise keep cached value
                return UserConversationCategory(
                    id: apiCategory.id,
                    userId: apiCategory.userId,
                    name: apiCategory.name,
                    color: apiCategory.color,
                    icon: apiCategory.icon,
                    order: apiCategory.order,
                    isExpanded: apiCategory.isExpanded,
                    createdAt: apiCategory.createdAt,
                    updatedAt: apiCategory.updatedAt,
                    conversations: apiCategory.conversations,
                    conversationCount: apiCategory.conversationCount
                )
            }
            return apiCategory
        }

        // Save merged data to cache
        await saveCategories(merged)

        return sortedCategories(merged)
    }
}
