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
        Date().timeIntervalSince(lastFetchedAt) > ttl
    }
}
