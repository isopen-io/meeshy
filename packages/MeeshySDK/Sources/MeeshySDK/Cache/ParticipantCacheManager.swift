import Foundation
import GRDB
import os

// MARK: - ParticipantCacheManager

public actor ParticipantCacheManager {
    public static let shared = ParticipantCacheManager()

    private let db: any DatabaseWriter
    private let apiClient: any APIClientProviding
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "participant-cache")
    private let pageSize = 30
    private let ttl: TimeInterval = 86400

    private var memoryCache: [String: [PaginatedParticipant]] = [:]

    public init(
        databaseWriter: (any DatabaseWriter)? = nil,
        apiClient: (any APIClientProviding)? = nil
    ) {
        self.db = databaseWriter ?? AppDatabase.shared.databaseWriter
        self.apiClient = apiClient ?? APIClient.shared
    }

    private func metadataKey(for conversationId: String) -> String {
        "participants:\(conversationId)"
    }

    // MARK: - Read

    public func cached(for conversationId: String) async -> [PaginatedParticipant] {
        if let memory = memoryCache[conversationId] { return memory }
        do {
            let participants = try await db.read { db in
                try DBCachedParticipant
                    .filter(Column("conversationId") == conversationId)
                    .fetchAll(db)
                    .map { $0.toPaginatedParticipant() }
            }
            if !participants.isEmpty { memoryCache[conversationId] = participants }
            return participants
        } catch {
            logger.error("Failed to read cached participants: \(error.localizedDescription)")
            return []
        }
    }

    public func hasMore(for conversationId: String) async -> Bool {
        do {
            let key = metadataKey(for: conversationId)
            let meta = try await db.read { try DBCacheMetadata.fetchOne($0, key: key) }
            return meta?.hasMore ?? true
        } catch { return true }
    }

    public func totalCount(for conversationId: String) async -> Int? {
        do {
            let key = metadataKey(for: conversationId)
            let meta = try await db.read { try DBCacheMetadata.fetchOne($0, key: key) }
            return meta?.totalCount
        } catch { return nil }
    }

    public func isExpired(for conversationId: String) async -> Bool {
        do {
            let key = metadataKey(for: conversationId)
            let meta = try await db.read { try DBCacheMetadata.fetchOne($0, key: key) }
            guard let meta else { return true }
            return meta.isExpired(ttl: ttl)
        } catch { return true }
    }

    // MARK: - Load

    public func loadFirstPage(for conversationId: String, forceRefresh: Bool = false) async throws -> [PaginatedParticipant] {
        if !forceRefresh, !(await isExpired(for: conversationId)) {
            let existing = await cached(for: conversationId)
            if !existing.isEmpty { return existing }
        }
        await clearLocal(conversationId: conversationId)
        return try await loadNextPage(for: conversationId)
    }

    public func loadNextPage(for conversationId: String) async throws -> [PaginatedParticipant] {
        let key = metadataKey(for: conversationId)
        let existingMeta: DBCacheMetadata? = try? await db.read { try DBCacheMetadata.fetchOne($0, key: key) }
        if let existingMeta, !existingMeta.hasMore {
            return await cached(for: conversationId)
        }

        let cursor = existingMeta?.nextCursor
        var endpoint = "/conversations/\(conversationId)/participants?limit=\(pageSize)"
        if let cursor { endpoint += "&cursor=\(cursor)" }

        let response: PaginatedParticipantsResponse = try await apiClient.request(
            endpoint: endpoint, method: "GET", body: nil, queryItems: nil
        )
        guard response.success else { return await cached(for: conversationId) }

        let responseData = response.data
        let paginationNextCursor = response.pagination?.nextCursor
        let paginationHasMore = response.pagination?.hasMore ?? false
        let paginationTotalCount = response.pagination?.totalCount ?? existingMeta?.totalCount

        try await db.write { dbConn in
            for participant in responseData {
                var record = DBCachedParticipant.from(participant, conversationId: conversationId)
                try record.save(dbConn)
            }
            var newMeta = DBCacheMetadata(
                key: key,
                nextCursor: paginationNextCursor,
                hasMore: paginationHasMore,
                totalCount: paginationTotalCount,
                lastFetchedAt: Date()
            )
            try newMeta.save(dbConn)
        }

        memoryCache[conversationId] = nil
        return await cached(for: conversationId)
    }

    // MARK: - Mutations

    public func updateRole(conversationId: String, userId: String, newRole: String) async {
        do {
            try await db.write { dbConn in
                let records = try DBCachedParticipant
                    .filter(Column("conversationId") == conversationId)
                    .filter(Column("id") == userId || Column("userId") == userId)
                    .fetchAll(dbConn)
                for var record in records {
                    record.conversationRole = newRole.lowercased()
                    try record.update(dbConn)
                }
            }
            if var memory = memoryCache[conversationId],
               let idx = memory.firstIndex(where: { $0.id == userId || $0.userId == userId }) {
                memory[idx].conversationRole = newRole.lowercased()
                memoryCache[conversationId] = memory
            }
        } catch {
            logger.error("Failed to update role: \(error.localizedDescription)")
        }
    }

    public func removeParticipant(conversationId: String, userId: String) async {
        do {
            let key = metadataKey(for: conversationId)
            try await db.write { dbConn in
                _ = try DBCachedParticipant
                    .filter(Column("conversationId") == conversationId)
                    .filter(Column("id") == userId || Column("userId") == userId)
                    .deleteAll(dbConn)
                if var meta = try DBCacheMetadata.fetchOne(dbConn, key: key), let total = meta.totalCount {
                    meta.totalCount = total - 1
                    try meta.update(dbConn)
                }
            }
            memoryCache[conversationId]?.removeAll { $0.id == userId || $0.userId == userId }
        } catch {
            logger.error("Failed to remove participant: \(error.localizedDescription)")
        }
    }

    // MARK: - Invalidation

    public func invalidate(conversationId: String) async {
        await clearLocal(conversationId: conversationId)
    }

    public func invalidateAll() async {
        memoryCache.removeAll()
        do {
            try await db.write { dbConn in
                try DBCachedParticipant.deleteAll(dbConn)
                _ = try DBCacheMetadata.filter(Column("key").like("participants:%")).deleteAll(dbConn)
            }
        } catch {
            logger.error("Failed to invalidate all: \(error.localizedDescription)")
        }
    }

    private func clearLocal(conversationId: String) async {
        memoryCache[conversationId] = nil
        do {
            let key = metadataKey(for: conversationId)
            try await db.write { dbConn in
                _ = try DBCachedParticipant.filter(Column("conversationId") == conversationId).deleteAll(dbConn)
                _ = try DBCacheMetadata.deleteOne(dbConn, key: key)
            }
        } catch {
            logger.error("Failed to clear cache for \(conversationId): \(error.localizedDescription)")
        }
    }
}
