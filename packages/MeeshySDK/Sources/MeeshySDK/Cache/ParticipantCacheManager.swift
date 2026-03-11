import Foundation

// MARK: - ParticipantCacheManager

public actor ParticipantCacheManager {
    public static let shared = ParticipantCacheManager()

    struct CacheEntry {
        var participants: [PaginatedParticipant]
        var nextCursor: String?
        var hasMore: Bool
        var totalCount: Int?
        var lastFetchedAt: Date
    }

    private var cache: [String: CacheEntry] = [:]
    private let pageSize = 30
    private let staleTTL: TimeInterval = 300

    // MARK: - Read

    public func cached(for conversationId: String) -> [PaginatedParticipant] {
        cache[conversationId]?.participants ?? []
    }

    public func hasMore(for conversationId: String) -> Bool {
        cache[conversationId]?.hasMore ?? true
    }

    public func totalCount(for conversationId: String) -> Int? {
        cache[conversationId]?.totalCount
    }

    public func isStale(for conversationId: String) -> Bool {
        guard let entry = cache[conversationId] else { return true }
        return Date().timeIntervalSince(entry.lastFetchedAt) > staleTTL
    }

    // MARK: - Load

    public func loadFirstPage(for conversationId: String, forceRefresh: Bool = false) async throws -> [PaginatedParticipant] {
        if !forceRefresh, let entry = cache[conversationId], !isStale(for: conversationId) {
            return entry.participants
        }
        cache[conversationId] = nil
        return try await loadNextPage(for: conversationId)
    }

    public func loadNextPage(for conversationId: String) async throws -> [PaginatedParticipant] {
        let entry = cache[conversationId]
        if let entry, !entry.hasMore { return entry.participants }

        let cursor = entry?.nextCursor
        var endpoint = "/conversations/\(conversationId)/participants?limit=\(pageSize)"
        if let cursor { endpoint += "&cursor=\(cursor)" }

        let response: PaginatedParticipantsResponse = try await APIClient.shared.request(endpoint: endpoint)
        guard response.success else { return entry?.participants ?? [] }

        var updated = entry ?? CacheEntry(participants: [], nextCursor: nil, hasMore: true, totalCount: nil, lastFetchedAt: Date())
        updated.participants.append(contentsOf: response.data)
        updated.nextCursor = response.pagination?.nextCursor
        updated.hasMore = response.pagination?.hasMore ?? false
        updated.totalCount = response.pagination?.totalCount ?? updated.totalCount
        updated.lastFetchedAt = Date()

        cache[conversationId] = updated
        return updated.participants
    }

    // MARK: - Mutations

    public func updateRole(conversationId: String, userId: String, newRole: String) {
        guard var entry = cache[conversationId] else { return }
        if let idx = entry.participants.firstIndex(where: { $0.id == userId || $0.userId == userId }) {
            entry.participants[idx].conversationRole = newRole.lowercased()
            cache[conversationId] = entry
        }
    }

    public func removeParticipant(conversationId: String, userId: String) {
        guard var entry = cache[conversationId] else { return }
        entry.participants.removeAll { $0.id == userId || $0.userId == userId }
        if let total = entry.totalCount { entry.totalCount = total - 1 }
        cache[conversationId] = entry
    }

    // MARK: - Invalidation

    public func invalidate(conversationId: String) {
        cache.removeValue(forKey: conversationId)
    }

    public func invalidateAll() {
        cache.removeAll()
    }
}
