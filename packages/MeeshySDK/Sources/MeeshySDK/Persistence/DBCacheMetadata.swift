import Foundation
import GRDB

struct DBCacheMetadata: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "cache_metadata"

    var key: String
    var nextCursor: String?
    var hasMore: Bool
    var totalCount: Int?
    var lastFetchedAt: Date

    func isExpired(ttl: TimeInterval) -> Bool {
        // Use `>=` to match CachePolicy.freshness: a record is expired the
        // moment it reaches the TTL boundary, not strictly past it.
        Date().timeIntervalSince(lastFetchedAt) >= ttl
    }
}
