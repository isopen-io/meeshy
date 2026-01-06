//
//  MemberCacheManager.swift
//  Meeshy
//
//  Intelligent caching system for conversation members
//  - TTL-based expiration (48h default)
//  - O(1) lookup by userId
//  - Disk persistence for offline access
//  - Smart refresh triggers
//  iOS 16+
//
//  ARCHITECTURE:
//  - Actor-based for thread safety
//  - Memory cache + UserDefaults persistence
//  - Lazy loading on demand
//  - Auto-refresh when unknown member detected
//

import Foundation

// MARK: - Cached Members Container

/// Container for cached member data with metadata
struct CachedMembersData: Codable {
    let members: [ConversationMember]
    let cachedAt: Date
    let conversationId: String

    /// Check if cache is expired
    func isExpired(ttl: TimeInterval) -> Bool {
        Date().timeIntervalSince(cachedAt) > ttl
    }

    /// Quick lookup dictionary (built on demand)
    /// Uses reduce to handle duplicate userIds gracefully (keeps last occurrence)
    var membersByUserId: [String: ConversationMember] {
        members.reduce(into: [String: ConversationMember]()) { dict, member in
            dict[member.userId] = member
        }
    }
}

// MARK: - Member Cache Manager

/// Thread-safe cache manager for conversation members
/// Uses actor isolation for safe concurrent access
@globalActor
actor MemberCacheActor {
    static let shared = MemberCacheActor()
}

@MemberCacheActor
final class MemberCacheManager {

    // MARK: - Singleton

    static let shared = MemberCacheManager()

    // MARK: - Configuration

    /// Cache TTL in seconds (default: 48 hours)
    var cacheTTL: TimeInterval = 48 * 60 * 60

    // MEMORY FIX: Use FileManager with Caches directory instead of UserDefaults
    // UserDefaults is not designed for large data and slows app launch
    private let cacheDirectory: URL = {
        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        let memberCacheDir = cacheDir.appendingPathComponent("MemberCache", isDirectory: true)
        try? FileManager.default.createDirectory(at: memberCacheDir, withIntermediateDirectories: true)
        return memberCacheDir
    }()

    // MARK: - In-Memory Cache

    /// In-memory cache for fast access
    private var memoryCache: [String: CachedMembersData] = [:]

    /// Lookup cache: conversationId -> (userId -> ConversationMember)
    private var lookupCache: [String: [String: ConversationMember]] = [:]

    /// Track pending fetch operations to avoid duplicate requests
    private var pendingFetches: Set<String> = []

    /// Last refresh timestamps for rate limiting
    private var lastRefreshTimes: [String: Date] = [:]

    /// Minimum interval between refreshes (5 minutes)
    private let minRefreshInterval: TimeInterval = 5 * 60

    // MARK: - Initialization

    private init() {
        // MEMORY FIX: Migrate from old UserDefaults storage first
        Task {
            await migrateFromUserDefaults()
            await loadPersistedCache()
        }
    }

    // MARK: - Public API

    /// Get all cached members for a conversation
    /// - Parameter conversationId: The conversation ID
    /// - Returns: Array of cached members, or nil if not cached/expired
    func getMembers(for conversationId: String) -> [ConversationMember]? {
        // Check memory cache first
        if let cached = memoryCache[conversationId], !cached.isExpired(ttl: cacheTTL) {
            return cached.members
        }

        // Try to load from disk
        if let diskCached = loadFromDisk(conversationId: conversationId), !diskCached.isExpired(ttl: cacheTTL) {
            // Populate memory cache
            memoryCache[conversationId] = diskCached
            lookupCache[conversationId] = diskCached.membersByUserId
            return diskCached.members
        }

        return nil
    }

    /// Get a specific member by userId (O(1) lookup)
    /// - Parameters:
    ///   - conversationId: The conversation ID
    ///   - userId: The user ID to lookup
    /// - Returns: The member if found, nil otherwise
    func getMember(conversationId: String, userId: String) -> ConversationMember? {
        // Build lookup cache if needed
        if lookupCache[conversationId] == nil {
            if let members = getMembers(for: conversationId) {
                // Use reduce to handle duplicate userIds gracefully
                lookupCache[conversationId] = members.reduce(into: [String: ConversationMember]()) { dict, member in
                    dict[member.userId] = member
                }
            }
        }

        return lookupCache[conversationId]?[userId]
    }

    /// Get user info for a userId (convenience method)
    /// - Parameters:
    ///   - conversationId: The conversation ID
    ///   - userId: The user ID
    /// - Returns: Tuple of (displayName, avatar) or nil
    func getUserInfo(conversationId: String, userId: String) -> (name: String, avatar: String?)? {
        guard let member = getMember(conversationId: conversationId, userId: userId) else {
            return nil
        }
        let name = member.preferredName
        let avatar = member.avatar
        return (name, avatar)
    }

    /// Cache members for a conversation
    /// - Parameters:
    ///   - members: Array of members to cache
    ///   - conversationId: The conversation ID
    func cacheMembers(_ members: [ConversationMember], for conversationId: String) {
        // Deduplicate members by userId (keep last occurrence)
        var seenUserIds = Set<String>()
        let uniqueMembers = members.reversed().filter { member in
            if seenUserIds.contains(member.userId) {
                return false
            }
            seenUserIds.insert(member.userId)
            return true
        }.reversed()

        let deduplicatedMembers = Array(uniqueMembers)

        let cachedData = CachedMembersData(
            members: deduplicatedMembers,
            cachedAt: Date(),
            conversationId: conversationId
        )

        // Update memory cache
        memoryCache[conversationId] = cachedData
        lookupCache[conversationId] = cachedData.membersByUserId

        // Persist to disk
        saveToDisk(cachedData)

        if deduplicatedMembers.count != members.count {
            print("MemberCacheManager: Cached \(deduplicatedMembers.count) members (removed \(members.count - deduplicatedMembers.count) duplicates) for conversation \(conversationId)")
        } else {
            print("MemberCacheManager: Cached \(deduplicatedMembers.count) members for conversation \(conversationId)")
        }
    }

    /// Add or update a single member in the cache
    /// - Parameters:
    ///   - member: The member to add/update
    ///   - conversationId: The conversation ID
    func updateMember(_ member: ConversationMember, for conversationId: String) {
        guard var cached = memoryCache[conversationId] else {
            // No existing cache, create new one with just this member
            cacheMembers([member], for: conversationId)
            return
        }

        // Update or add the member
        var members = cached.members
        if let index = members.firstIndex(where: { $0.userId == member.userId }) {
            members[index] = member
        } else {
            members.append(member)
        }

        // Re-cache with updated members
        cacheMembers(members, for: conversationId)
    }

    /// Check if a user exists in the cache
    /// - Parameters:
    ///   - userId: The user ID to check
    ///   - conversationId: The conversation ID
    /// - Returns: True if user is in cache
    func hasMember(userId: String, in conversationId: String) -> Bool {
        return getMember(conversationId: conversationId, userId: userId) != nil
    }

    /// Check if cache is expired for a conversation
    /// - Parameter conversationId: The conversation ID
    /// - Returns: True if expired or not cached
    func isExpired(for conversationId: String) -> Bool {
        guard let cached = memoryCache[conversationId] else {
            return true
        }
        return cached.isExpired(ttl: cacheTTL)
    }

    /// Check if we should refresh (rate limited)
    /// - Parameter conversationId: The conversation ID
    /// - Returns: True if enough time has passed since last refresh
    func shouldRefresh(for conversationId: String) -> Bool {
        guard let lastRefresh = lastRefreshTimes[conversationId] else {
            return true
        }
        return Date().timeIntervalSince(lastRefresh) > minRefreshInterval
    }

    /// Mark that a refresh was performed
    /// - Parameter conversationId: The conversation ID
    func markRefreshed(for conversationId: String) {
        lastRefreshTimes[conversationId] = Date()
    }

    /// Check if a fetch is already pending
    /// - Parameter conversationId: The conversation ID
    /// - Returns: True if fetch is in progress
    func isFetchPending(for conversationId: String) -> Bool {
        return pendingFetches.contains(conversationId)
    }

    /// Mark fetch as started
    /// - Parameter conversationId: The conversation ID
    func startFetch(for conversationId: String) {
        pendingFetches.insert(conversationId)
    }

    /// Mark fetch as completed
    /// - Parameter conversationId: The conversation ID
    func endFetch(for conversationId: String) {
        pendingFetches.remove(conversationId)
    }

    /// Invalidate cache for a conversation
    /// - Parameter conversationId: The conversation ID
    func invalidate(for conversationId: String) {
        memoryCache.removeValue(forKey: conversationId)
        lookupCache.removeValue(forKey: conversationId)
        removeFromDisk(conversationId: conversationId)
        print("MemberCacheManager: Invalidated cache for conversation \(conversationId)")
    }

    /// Clear all caches
    func clearAll() {
        memoryCache.removeAll()
        lookupCache.removeAll()
        pendingFetches.removeAll()
        lastRefreshTimes.removeAll()
        clearAllFromDisk()
        print("MemberCacheManager: Cleared all caches")
    }

    /// Get cache statistics
    func getStats() -> (cachedConversations: Int, totalMembers: Int, oldestCache: Date?) {
        let totalMembers = memoryCache.values.reduce(0) { $0 + $1.members.count }
        let oldestCache = memoryCache.values.map { $0.cachedAt }.min()
        return (memoryCache.count, totalMembers, oldestCache)
    }

    // MARK: - Paginated Access (MEMORY OPTIMIZATION)

    /// Get paginated members for display (prevents loading hundreds at once)
    /// - Parameters:
    ///   - conversationId: The conversation ID
    ///   - page: Page number (1-indexed)
    ///   - pageSize: Number of members per page
    /// - Returns: Tuple of (members for page, total count, has more pages)
    func getMembersPaginated(
        for conversationId: String,
        page: Int,
        pageSize: Int = 20
    ) -> (members: [ConversationMember], totalCount: Int, hasMore: Bool)? {
        guard let allMembers = getMembers(for: conversationId) else {
            return nil
        }

        let totalCount = allMembers.count
        let startIndex = (page - 1) * pageSize
        guard startIndex < totalCount else {
            return ([], totalCount, false)
        }

        let endIndex = min(startIndex + pageSize, totalCount)
        let pageMembers = Array(allMembers[startIndex..<endIndex])
        let hasMore = endIndex < totalCount

        return (pageMembers, totalCount, hasMore)
    }

    /// Get total member count without loading all members into memory
    /// - Parameter conversationId: The conversation ID
    /// - Returns: Total member count or nil if not cached
    func getMemberCount(for conversationId: String) -> Int? {
        return memoryCache[conversationId]?.members.count
    }

    /// Get online members (paginated)
    /// - Parameters:
    ///   - conversationId: The conversation ID
    ///   - page: Page number (1-indexed)
    ///   - pageSize: Number of members per page
    /// - Returns: Tuple of (online members for page, total online count, has more)
    func getOnlineMembersPaginated(
        for conversationId: String,
        page: Int,
        pageSize: Int = 20
    ) -> (members: [ConversationMember], totalCount: Int, hasMore: Bool)? {
        guard let allMembers = getMembers(for: conversationId) else {
            return nil
        }

        // Filter online members
        let onlineMembers = allMembers.filter { member in
            member.isOnline
        }
        let totalCount = onlineMembers.count
        let startIndex = (page - 1) * pageSize
        guard startIndex < totalCount else {
            return ([], totalCount, false)
        }

        let endIndex = min(startIndex + pageSize, totalCount)
        let pageMembers = Array(onlineMembers[startIndex..<endIndex])
        let hasMore = endIndex < totalCount

        return (pageMembers, totalCount, hasMore)
    }

    /// Search members by name (paginated)
    /// - Parameters:
    ///   - conversationId: The conversation ID
    ///   - query: Search query
    ///   - page: Page number (1-indexed)
    ///   - pageSize: Number of members per page
    /// - Returns: Tuple of (matching members for page, total matches, has more)
    func searchMembersPaginated(
        for conversationId: String,
        query: String,
        page: Int,
        pageSize: Int = 20
    ) -> (members: [ConversationMember], totalCount: Int, hasMore: Bool)? {
        guard let allMembers = getMembers(for: conversationId) else {
            return nil
        }

        let lowercaseQuery = query.lowercased()
        let matchingMembers = allMembers.filter { member in
            let name = member.preferredName
            let username = member.user?.username ?? ""
            return name.lowercased().contains(lowercaseQuery) ||
                   username.lowercased().contains(lowercaseQuery)
        }

        let totalCount = matchingMembers.count
        let startIndex = (page - 1) * pageSize
        guard startIndex < totalCount else {
            return ([], totalCount, false)
        }

        let endIndex = min(startIndex + pageSize, totalCount)
        let pageMembers = Array(matchingMembers[startIndex..<endIndex])
        let hasMore = endIndex < totalCount

        return (pageMembers, totalCount, hasMore)
    }

    // MARK: - Disk Persistence (MEMORY FIX: Using FileManager instead of UserDefaults)

    private func saveToDisk(_ data: CachedMembersData) {
        // MEMORY FIX: Use FileManager instead of UserDefaults for large data
        let fileURL = cacheDirectory.appendingPathComponent("\(data.conversationId).json")
        do {
            let encoded = try JSONEncoder().encode(data)
            try encoded.write(to: fileURL, options: .atomic)
        } catch {
            print("MemberCacheManager: Failed to persist cache: \(error)")
        }
    }

    private func loadFromDisk(conversationId: String) -> CachedMembersData? {
        // MEMORY FIX: Load from FileManager instead of UserDefaults
        let fileURL = cacheDirectory.appendingPathComponent("\(conversationId).json")

        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return nil
        }

        do {
            let data = try Data(contentsOf: fileURL)
            return try JSONDecoder().decode(CachedMembersData.self, from: data)
        } catch {
            print("MemberCacheManager: Failed to load cache from disk: \(error)")
            // Remove corrupted file
            try? FileManager.default.removeItem(at: fileURL)
            return nil
        }
    }

    private func removeFromDisk(conversationId: String) {
        let fileURL = cacheDirectory.appendingPathComponent("\(conversationId).json")
        try? FileManager.default.removeItem(at: fileURL)
    }

    private func clearAllFromDisk() {
        // MEMORY FIX: Clear from FileManager instead of UserDefaults
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: cacheDirectory,
            includingPropertiesForKeys: nil
        ) else {
            return
        }

        for file in files where file.pathExtension == "json" {
            try? FileManager.default.removeItem(at: file)
        }
    }

    private func loadPersistedCache() {
        // MEMORY FIX: Load from FileManager instead of UserDefaults
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: cacheDirectory,
            includingPropertiesForKeys: nil
        ) else {
            return
        }

        for file in files where file.pathExtension == "json" {
            let conversationId = file.deletingPathExtension().lastPathComponent
            if let cached = loadFromDisk(conversationId: conversationId) {
                // Only load if not expired
                if !cached.isExpired(ttl: cacheTTL) {
                    memoryCache[conversationId] = cached
                    lookupCache[conversationId] = cached.membersByUserId
                } else {
                    // Clean up expired cache
                    removeFromDisk(conversationId: conversationId)
                }
            }
        }

        print("MemberCacheManager: Loaded \(memoryCache.count) conversations from disk")
    }

    // MEMORY FIX: Add migration from old UserDefaults storage
    private func migrateFromUserDefaults() {
        let defaults = UserDefaults.standard
        let oldPrefix = "meeshy.member.cache."
        let allKeys = defaults.dictionaryRepresentation().keys

        var migrated = 0
        for key in allKeys where key.hasPrefix(oldPrefix) {
            if let data = defaults.data(forKey: key),
               let cached = try? JSONDecoder().decode(CachedMembersData.self, from: data) {
                // Save to new FileManager location
                saveToDisk(cached)
                // Remove from UserDefaults
                defaults.removeObject(forKey: key)
                migrated += 1
            } else {
                // Remove corrupted data
                defaults.removeObject(forKey: key)
            }
        }

        if migrated > 0 {
            print("MemberCacheManager: Migrated \(migrated) caches from UserDefaults to FileManager")
        }
    }
}

// MARK: - Non-isolated Convenience Methods

extension MemberCacheManager {

    /// Get member synchronously (for use in non-async contexts)
    /// Note: This is a convenience wrapper, prefer async methods when possible
    @MemberCacheActor
    static func getMemberSync(conversationId: String, userId: String) -> ConversationMember? {
        return shared.getMember(conversationId: conversationId, userId: userId)
    }

    /// Get user info synchronously
    @MemberCacheActor
    static func getUserInfoSync(conversationId: String, userId: String) -> (name: String, avatar: String?)? {
        return shared.getUserInfo(conversationId: conversationId, userId: userId)
    }
}

// MARK: - Member Fetch Helper

/// Helper for fetching members with caching
struct MemberFetchHelper {

    /// Fetch and cache members for a conversation
    /// - Parameters:
    ///   - conversationId: The conversation ID
    ///   - forceRefresh: Force refresh even if cache is valid
    ///   - fetchFunction: Async function to fetch members from API
    /// - Returns: Array of members
    @MemberCacheActor
    static func fetchMembers(
        for conversationId: String,
        forceRefresh: Bool = false,
        using fetchFunction: () async throws -> [ConversationMember]
    ) async throws -> [ConversationMember] {
        let cache = MemberCacheManager.shared

        // Check cache first (unless force refresh)
        if !forceRefresh {
            if let cached = cache.getMembers(for: conversationId) {
                return cached
            }
        }

        // Check if fetch is already pending
        guard !cache.isFetchPending(for: conversationId) else {
            // Wait a bit and try cache again
            try await Task.sleep(nanoseconds: 500_000_000) // 0.5s
            if let cached = cache.getMembers(for: conversationId) {
                return cached
            }
            throw MemberCacheError.fetchInProgress
        }

        // Check rate limiting
        guard cache.shouldRefresh(for: conversationId) || forceRefresh else {
            if let cached = cache.getMembers(for: conversationId) {
                return cached
            }
            throw MemberCacheError.rateLimited
        }

        // Mark fetch as started
        cache.startFetch(for: conversationId)
        defer { cache.endFetch(for: conversationId) }

        // Fetch from API
        let members = try await fetchFunction()

        // Cache results
        cache.cacheMembers(members, for: conversationId)
        cache.markRefreshed(for: conversationId)

        return members
    }

    /// Check and refresh cache if needed (non-blocking)
    /// - Parameters:
    ///   - conversationId: The conversation ID
    ///   - fetchFunction: Async function to fetch members from API
    @MemberCacheActor
    static func refreshIfNeeded(
        for conversationId: String,
        using fetchFunction: @escaping () async throws -> [ConversationMember]
    ) {
        let cache = MemberCacheManager.shared

        // Only refresh if expired and not rate limited
        guard cache.isExpired(for: conversationId),
              cache.shouldRefresh(for: conversationId),
              !cache.isFetchPending(for: conversationId) else {
            return
        }

        // Fire and forget refresh
        Task {
            do {
                _ = try await fetchMembers(for: conversationId, forceRefresh: true, using: fetchFunction)
            } catch {
                print("MemberCacheManager: Background refresh failed: \(error)")
            }
        }
    }

    /// Handle unknown member detection - triggers refresh
    /// - Parameters:
    ///   - userId: The unknown user ID
    ///   - conversationId: The conversation ID
    ///   - fetchFunction: Async function to fetch members from API
    @MemberCacheActor
    static func handleUnknownMember(
        userId: String,
        in conversationId: String,
        using fetchFunction: @escaping () async throws -> [ConversationMember]
    ) {
        let cache = MemberCacheManager.shared

        // Only trigger refresh if not rate limited
        guard cache.shouldRefresh(for: conversationId),
              !cache.isFetchPending(for: conversationId) else {
            return
        }

        print("MemberCacheManager: Unknown member \(userId) detected, triggering refresh")

        // Fire and forget refresh
        Task {
            do {
                _ = try await fetchMembers(for: conversationId, forceRefresh: true, using: fetchFunction)
            } catch {
                print("MemberCacheManager: Refresh for unknown member failed: \(error)")
            }
        }
    }
}

// MARK: - Errors

enum MemberCacheError: Error, LocalizedError {
    case fetchInProgress
    case rateLimited
    case notFound

    var errorDescription: String? {
        switch self {
        case .fetchInProgress:
            return "Member fetch already in progress"
        case .rateLimited:
            return "Too many refresh requests"
        case .notFound:
            return "Member not found in cache"
        }
    }
}
