import Foundation

// MARK: - Participant Page State

public struct ParticipantPageState: Sendable {
    public var participants: [APIParticipant]
    public var nextCursor: String?
    public var hasMore: Bool
    public var totalCount: Int?
    public var lastFetchedAt: Date

    public init(
        participants: [APIParticipant] = [],
        nextCursor: String? = nil,
        hasMore: Bool = true,
        totalCount: Int? = nil,
        lastFetchedAt: Date = Date()
    ) {
        self.participants = participants
        self.nextCursor = nextCursor
        self.hasMore = hasMore
        self.totalCount = totalCount
        self.lastFetchedAt = lastFetchedAt
    }
}

// MARK: - Pagination Response

public struct ParticipantPageResponse: Decodable, Sendable {
    public let success: Bool
    public let data: [APIParticipant]
    public let pagination: ParticipantPagination?

    public struct ParticipantPagination: Decodable, Sendable {
        public let nextCursor: String?
        public let hasMore: Bool
        public let totalCount: Int?
    }
}

// MARK: - ParticipantCacheManager

public actor ParticipantCacheManager {
    public static let shared = ParticipantCacheManager()

    private var cache: [String: ParticipantPageState] = [:]
    private let pageSize = 30
    private let staleTTL: TimeInterval = 300

    // MARK: - Read

    public func cachedState(for conversationId: String) -> ParticipantPageState? {
        cache[conversationId]
    }

    public func cachedParticipants(for conversationId: String) -> [APIParticipant] {
        cache[conversationId]?.participants ?? []
    }

    public func hasMore(for conversationId: String) -> Bool {
        cache[conversationId]?.hasMore ?? true
    }

    public func isStale(for conversationId: String) -> Bool {
        guard let state = cache[conversationId] else { return true }
        return Date().timeIntervalSince(state.lastFetchedAt) > staleTTL
    }

    // MARK: - Load

    public func loadNextPage(for conversationId: String) async throws -> [APIParticipant] {
        let state = cache[conversationId]
        if let state, !state.hasMore { return state.participants }

        let cursor = state?.nextCursor
        var endpoint = "/conversations/\(conversationId)/participants?limit=\(pageSize)"
        if let cursor {
            endpoint += "&cursor=\(cursor)"
        }

        let response: ParticipantPageResponse = try await APIClient.shared.request(endpoint: endpoint)
        guard response.success else { return state?.participants ?? [] }

        var updated = state ?? ParticipantPageState()
        updated.participants.append(contentsOf: response.data)
        updated.nextCursor = response.pagination?.nextCursor
        updated.hasMore = response.pagination?.hasMore ?? false
        updated.totalCount = response.pagination?.totalCount ?? updated.totalCount
        updated.lastFetchedAt = Date()

        cache[conversationId] = updated
        return updated.participants
    }

    public func loadFirstPage(for conversationId: String, forceRefresh: Bool = false) async throws -> [APIParticipant] {
        if !forceRefresh, let state = cache[conversationId], !isStale(for: conversationId) {
            return state.participants
        }
        cache[conversationId] = nil
        return try await loadNextPage(for: conversationId)
    }

    // MARK: - Mutations

    public func updateRole(conversationId: String, participantId: String, newRole: String) {
        guard var state = cache[conversationId] else { return }
        if let idx = state.participants.firstIndex(where: { $0.id == participantId }) {
            let old = state.participants[idx]
            state.participants[idx] = APIParticipant(
                id: old.id, conversationId: old.conversationId,
                type: old.type, userId: old.userId,
                displayName: old.displayName, avatar: old.avatar,
                role: newRole.lowercased(), language: old.language,
                permissions: old.permissions, isActive: old.isActive,
                isOnline: old.isOnline, joinedAt: old.joinedAt,
                leftAt: old.leftAt, bannedAt: old.bannedAt,
                nickname: old.nickname, lastActiveAt: old.lastActiveAt,
                user: old.user
            )
            cache[conversationId] = state
        }
    }

    public func removeParticipant(conversationId: String, participantId: String) {
        guard var state = cache[conversationId] else { return }
        state.participants.removeAll { $0.id == participantId }
        if let total = state.totalCount { state.totalCount = total - 1 }
        cache[conversationId] = state
    }

    public func addParticipant(conversationId: String, participant: APIParticipant) {
        guard var state = cache[conversationId] else { return }
        guard !state.participants.contains(where: { $0.id == participant.id }) else { return }
        state.participants.insert(participant, at: 0)
        if let total = state.totalCount { state.totalCount = total + 1 }
        cache[conversationId] = state
    }

    // MARK: - Invalidation

    public func invalidate(conversationId: String) {
        cache.removeValue(forKey: conversationId)
    }

    public func invalidateAll() {
        cache.removeAll()
    }
}
