import MeeshySDK
import os

actor ParticipantService {
    static let shared = ParticipantService()

    private let apiClient: any APIClientProviding
    private let logger = Logger(subsystem: "me.meeshy.app", category: "participant-service")
    private let pageSize = 30

    private var paginationState: [String: PaginationState] = [:]

    private struct PaginationState {
        var nextCursor: String?
        var hasMore: Bool = true
        var totalCount: Int?
    }

    init(apiClient: any APIClientProviding = APIClient.shared) {
        self.apiClient = apiClient
    }

    // MARK: - Read

    func hasMore(for conversationId: String) -> Bool {
        paginationState[conversationId]?.hasMore ?? true
    }

    func totalCount(for conversationId: String) -> Int? {
        paginationState[conversationId]?.totalCount
    }

    // MARK: - Load

    func loadFirstPage(for conversationId: String, forceRefresh: Bool = false) async throws -> [PaginatedParticipant] {
        if !forceRefresh {
            let result = await CacheCoordinator.shared.participants.load(for: conversationId)
            if let items = result.value, !items.isEmpty {
                return items
            }
        }

        paginationState[conversationId] = PaginationState()
        await CacheCoordinator.shared.participants.invalidate(for: conversationId)
        return try await fetchNextPage(for: conversationId)
    }

    func loadNextPage(for conversationId: String) async throws -> [PaginatedParticipant] {
        let state = paginationState[conversationId]
        guard state?.hasMore ?? true else {
            let result = await CacheCoordinator.shared.participants.load(for: conversationId)
            return result.value ?? []
        }

        return try await fetchNextPage(for: conversationId)
    }

    // MARK: - Mutations

    func updateRole(conversationId: String, userId: String, newRole: String) async {
        await CacheCoordinator.shared.participants.update(for: conversationId) { existing in
            existing.map { participant in
                guard participant.id == userId || participant.userId == userId else { return participant }
                var updated = participant
                updated.conversationRole = newRole.lowercased()
                return updated
            }
        }
    }

    func removeParticipant(conversationId: String, userId: String) async {
        await CacheCoordinator.shared.participants.update(for: conversationId) { existing in
            existing.filter { $0.id != userId && $0.userId != userId }
        }
        if let total = paginationState[conversationId]?.totalCount {
            paginationState[conversationId]?.totalCount = total - 1
        }
    }

    // MARK: - Invalidation

    func invalidate(conversationId: String) async {
        paginationState[conversationId] = nil
        await CacheCoordinator.shared.participants.invalidate(for: conversationId)
    }

    // MARK: - Private

    private func fetchNextPage(for conversationId: String) async throws -> [PaginatedParticipant] {
        let cursor = paginationState[conversationId]?.nextCursor
        var endpoint = "/conversations/\(conversationId)/participants?limit=\(pageSize)"
        if let cursor { endpoint += "&cursor=\(cursor)" }

        let response: PaginatedParticipantsResponse = try await apiClient.request(
            endpoint: endpoint, method: "GET", body: nil, queryItems: nil
        )
        guard response.success else {
            let result = await CacheCoordinator.shared.participants.load(for: conversationId)
            return result.value ?? []
        }

        let existingResult = await CacheCoordinator.shared.participants.load(for: conversationId)
        let existingItems = existingResult.value ?? []
        let merged = existingItems + response.data

        await CacheCoordinator.shared.participants.save(merged, for: conversationId)

        paginationState[conversationId] = PaginationState(
            nextCursor: response.pagination?.nextCursor,
            hasMore: response.pagination?.hasMore ?? false,
            totalCount: response.pagination?.totalCount ?? paginationState[conversationId]?.totalCount
        )

        return merged
    }
}
