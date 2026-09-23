import Foundation
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
            // SWR: any in-cache page (fresh or stale) satisfies the
            // first-page request. The caller (`ConversationViewModel`) reads
            // the participants store again later for downstream operations,
            // so a separate refresh kick here would be redundant.
            let result = await CacheCoordinator.shared.participants.load(for: conversationId)
            switch result {
            case .fresh(let items, _), .stale(let items, _):
                if !items.isEmpty { return items }
            case .expired, .empty:
                break
            }
        }

        // Fetch-then-replace : le cache n'est touché QUE lorsque le réseau a
        // répondu. L'ordre inverse — `invalidate()` PUIS `fetchNextPage()` —
        // détruisait la charge encore présente sur le disque avant de savoir
        // s'il y aurait de quoi la remplacer : hors ligne, la liste des membres
        // devenait vide sur les DEUX surfaces qui la servent
        // (`ConversationInfoSheet`, `ParticipantsView`), et l'ouverture suivante
        // repartait du réseau puisque le cache n'avait plus rien à servir.
        // Même correctif que `ConversationListViewModel.forceRefresh`.
        paginationState[conversationId] = PaginationState()
        do {
            return try await fetchNextPage(for: conversationId, replacingCachedPages: true)
        } catch {
            // `load()` rend un `.expired` SANS charge — le signal veut dire
            // « ne t'y fie pas », jamais « il n'y a rien ». Le disque, lui, l'a
            // encore : la servir vaut mieux qu'une liste vide (Offline Graceful
            // Degradation, même branche que `performLoadConversations`).
            if let recovered = await CacheCoordinator.shared.participants.loadIgnoringExpiry(for: conversationId),
               !recovered.items.isEmpty {
                logger.info("Participants served from expired disk payload after a failed refresh")
                return recovered.items
            }
            throw error
        }
    }

    func loadNextPage(for conversationId: String) async throws -> [PaginatedParticipant] {
        let state = paginationState[conversationId]
        guard state?.hasMore ?? true else {
            // Pagination exhausted — return whatever the cache currently
            // holds (snapshot semantics, no SWR signal needed).
            let result = await CacheCoordinator.shared.participants.load(for: conversationId)
            return result.snapshot() ?? []
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

    /// - Parameter replacingCachedPages: une PREMIÈRE page remplace ce que le
    ///   cache portait au lieu de s'y ajouter. C'est ce que l'`invalidate()`
    ///   préalable obtenait ; le dire ici plutôt que de vider le disque donne le
    ///   même résultat sans exposer l'intervalle où l'app n'a plus rien.
    private func fetchNextPage(
        for conversationId: String,
        replacingCachedPages: Bool = false
    ) async throws -> [PaginatedParticipant] {
        let cursor = paginationState[conversationId]?.nextCursor
        // #4282 — le chemin était CONSTRUIT par concaténation, requête comprise.
        // Ni la migration ni l'audit ne le voyaient : ils cherchent un littéral,
        // et ici il n'y en avait pas un seul complet. La pagination passe en
        // `queryItems`, où elle appartient — l'adresse est une adresse.
        var queryItems = [URLQueryItem(name: "limit", value: String(pageSize))]
        if let cursor { queryItems.append(URLQueryItem(name: "cursor", value: cursor)) }

        let response: PaginatedParticipantsResponse = try await apiClient.request(
            ConversationsEndpoint.byIdParticipants(id: conversationId),
            method: "GET", body: nil, queryItems: queryItems
        )
        guard response.success else {
            // Server reported a failure: surface whatever the disk still holds.
            // `snapshot()` rendait `nil` sur un `.expired` — exactement l'état
            // dans lequel cette branche est atteinte le plus souvent — donc une
            // panne serveur servait une liste vide alors que les membres
            // étaient là.
            return await CacheCoordinator.shared.participants
                .loadIgnoringExpiry(for: conversationId)?.items ?? []
        }

        // Page-merge: we just fetched the next page, so we want to append to
        // whatever is currently cached regardless of freshness.
        let existingItems: [PaginatedParticipant]
        if replacingCachedPages {
            existingItems = []
        } else {
            let existingResult = await CacheCoordinator.shared.participants.load(for: conversationId)
            existingItems = existingResult.snapshot() ?? []
        }
        let merged = existingItems + response.data

        do {
            try await CacheCoordinator.shared.participants.save(merged, for: conversationId)
        } catch {
            Logger.participants.error("Participants not cached, next open refetches from network: \(error.localizedDescription, privacy: .public)")
        }
        UserDisplayNameCache.shared.trackFromParticipants(response.data)

        paginationState[conversationId] = PaginationState(
            nextCursor: response.pagination?.nextCursor,
            hasMore: response.pagination?.hasMore ?? false,
            totalCount: response.pagination?.totalCount ?? paginationState[conversationId]?.totalCount
        )

        return merged
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let participants = Logger(subsystem: "me.meeshy.app", category: "participants")
}
