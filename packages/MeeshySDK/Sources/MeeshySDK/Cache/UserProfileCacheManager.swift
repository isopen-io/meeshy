import Foundation

// MARK: - Cached Entry

private struct CachedProfile: Sendable {
    let user: MeeshyUser
    let timestamp: Date

    var isFresh: Bool {
        Date().timeIntervalSince(timestamp) < 300  // 5 minutes
    }

    var isStale: Bool {
        Date().timeIntervalSince(timestamp) >= 3600  // 1 hour
    }
}

private struct CachedStats: Sendable {
    let stats: UserStats
    let timestamp: Date

    var isFresh: Bool {
        Date().timeIntervalSince(timestamp) < 300  // 5 minutes
    }

    var isStale: Bool {
        Date().timeIntervalSince(timestamp) >= 3600  // 1 hour
    }
}

private struct CachedConversations: Sendable {
    let conversations: [APIConversation]
    let timestamp: Date

    var isFresh: Bool {
        Date().timeIntervalSince(timestamp) < 300  // 5 minutes
    }

    var isStale: Bool {
        Date().timeIntervalSince(timestamp) >= 3600  // 1 hour
    }
}

// MARK: - User Profile Cache Manager

/// Thread-safe actor for caching user profiles and stats.
/// Implements two-tier TTL: fresh (5min) and stale (1h) with background refresh.
public actor UserProfileCacheManager {
    public static let shared = UserProfileCacheManager()

    // MARK: - Cache Storage

    private var profileCache: [String: CachedProfile] = [:]
    private var statsCache: [String: CachedStats] = [:]
    private var conversationsCache: [String: CachedConversations] = [:]

    // MARK: - In-flight Request Deduplication

    private var profileTasks: [String: Task<MeeshyUser, Error>] = [:]
    private var statsTasks: [String: Task<UserStats, Error>] = [:]
    private var conversationsTasks: [String: Task<[APIConversation], Error>] = [:]

    // MARK: - Configuration

    private let maxCacheSize = 100

    private init() {}

    // MARK: - Public API

    /// Fetch user profile with intelligent caching strategy.
    /// - Fresh cache (< 5min): return immediately
    /// - Stale cache (5min-1h): return stale data + silent background refresh
    /// - Cache miss (> 1h or empty): fetch from network
    public func profile(for userId: String) async throws -> MeeshyUser {
        // Check cache
        if let cached = profileCache[userId] {
            if cached.isFresh {
                return cached.user
            }
            if !cached.isStale {
                // Return stale data + trigger background refresh
                Task.detached(priority: .background) { [weak self] in
                    _ = try? await self?.fetchProfile(userId: userId)
                }
                return cached.user
            }
        }

        // Deduplicate in-flight requests
        if let existing = profileTasks[userId] {
            do {
                return try await existing.value
            } catch is CancellationError {
                profileTasks[userId] = nil
            } catch {
                throw error
            }
        }

        // Fetch from network
        let task = Task.detached {
            try await UserService.shared.getProfile(idOrUsername: userId)
        }
        profileTasks[userId] = task

        do {
            let user = try await task.value
            profileTasks[userId] = nil
            storeProfile(user)
            return user
        } catch {
            profileTasks[userId] = nil
            throw error
        }
    }

    /// Fetch user stats with intelligent caching strategy.
    public func stats(for userId: String) async throws -> UserStats {
        // Check cache
        if let cached = statsCache[userId] {
            if cached.isFresh {
                return cached.stats
            }
            if !cached.isStale {
                // Return stale data + trigger background refresh
                Task.detached(priority: .background) { [weak self] in
                    _ = try? await self?.fetchStats(userId: userId)
                }
                return cached.stats
            }
        }

        // Deduplicate in-flight requests
        if let existing = statsTasks[userId] {
            do {
                return try await existing.value
            } catch is CancellationError {
                statsTasks[userId] = nil
            } catch {
                throw error
            }
        }

        // Fetch from network
        return try await fetchStats(userId: userId)
    }

    /// Fetch shared conversations with a specific user with intelligent caching strategy.
    public func sharedConversations(with userId: String) async throws -> [APIConversation] {
        // Check cache
        if let cached = conversationsCache[userId] {
            if cached.isFresh {
                return cached.conversations
            }
            if !cached.isStale {
                // Return stale data + trigger background refresh
                Task.detached(priority: .background) { [weak self] in
                    _ = try? await self?.fetchSharedConversations(with: userId)
                }
                return cached.conversations
            }
        }

        // Deduplicate in-flight requests
        if let existing = conversationsTasks[userId] {
            do {
                return try await existing.value
            } catch is CancellationError {
                conversationsTasks[userId] = nil
            } catch {
                throw error
            }
        }

        // Fetch from network
        return try await fetchSharedConversations(with: userId)
    }

    /// Invalidate cache for a specific user.
    public func invalidate(userId: String) {
        profileCache[userId] = nil
        statsCache[userId] = nil
        conversationsCache[userId] = nil
        profileTasks[userId]?.cancel()
        statsTasks[userId]?.cancel()
        conversationsTasks[userId]?.cancel()
        profileTasks[userId] = nil
        statsTasks[userId] = nil
        conversationsTasks[userId] = nil
    }

    /// Clear all caches.
    public func clearAll() {
        profileCache.removeAll()
        statsCache.removeAll()
        conversationsCache.removeAll()
        profileTasks.values.forEach { $0.cancel() }
        statsTasks.values.forEach { $0.cancel() }
        conversationsTasks.values.forEach { $0.cancel() }
        profileTasks.removeAll()
        statsTasks.removeAll()
        conversationsTasks.removeAll()
    }

    // MARK: - Private Helpers

    private func fetchProfile(userId: String) async throws -> MeeshyUser {
        let user = try await UserService.shared.getProfile(idOrUsername: userId)
        storeProfile(user)
        return user
    }

    private func fetchStats(userId: String) async throws -> UserStats {
        let task = Task.detached {
            try await UserService.shared.getUserStats(userId: userId)
        }
        statsTasks[userId] = task

        do {
            let stats = try await task.value
            statsTasks[userId] = nil
            storeStats(stats, for: userId)
            return stats
        } catch {
            statsTasks[userId] = nil
            throw error
        }
    }

    private func storeProfile(_ user: MeeshyUser) {
        profileCache[user.id] = CachedProfile(user: user, timestamp: Date())
        evictIfNeeded()
    }

    private func storeStats(_ stats: UserStats, for userId: String) {
        statsCache[userId] = CachedStats(stats: stats, timestamp: Date())
        evictIfNeeded()
    }

    private func fetchSharedConversations(with userId: String) async throws -> [APIConversation] {
        let task = Task.detached {
            try await ConversationService.shared.listSharedWith(userId: userId)
        }
        conversationsTasks[userId] = task

        do {
            let conversations = try await task.value
            conversationsTasks[userId] = nil
            storeConversations(conversations, for: userId)
            return conversations
        } catch {
            conversationsTasks[userId] = nil
            throw error
        }
    }

    private func storeConversations(_ conversations: [APIConversation], for userId: String) {
        conversationsCache[userId] = CachedConversations(conversations: conversations, timestamp: Date())
        evictIfNeeded()
    }

    private func evictIfNeeded() {
        // Simple LRU: remove oldest entries if over limit
        if profileCache.count > maxCacheSize {
            let sorted = profileCache.sorted { $0.value.timestamp < $1.value.timestamp }
            let toRemove = sorted.prefix(profileCache.count - maxCacheSize)
            for (key, _) in toRemove {
                profileCache[key] = nil
            }
        }

        if statsCache.count > maxCacheSize {
            let sorted = statsCache.sorted { $0.value.timestamp < $1.value.timestamp }
            let toRemove = sorted.prefix(statsCache.count - maxCacheSize)
            for (key, _) in toRemove {
                statsCache[key] = nil
            }
        }

        if conversationsCache.count > maxCacheSize {
            let sorted = conversationsCache.sorted { $0.value.timestamp < $1.value.timestamp }
            let toRemove = sorted.prefix(conversationsCache.count - maxCacheSize)
            for (key, _) in toRemove {
                conversationsCache[key] = nil
            }
        }
    }
}
