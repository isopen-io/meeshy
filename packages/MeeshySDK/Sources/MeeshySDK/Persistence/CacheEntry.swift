import Foundation
import GRDB

struct CacheEntry: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "cache_entries"
    var key: String
    var itemId: String
    var encodedData: Data
    var updatedAt: Date
    /// SHA-256 hex du JSON plaintext — v8. Sert d'empreinte de changement au
    /// flush dirty ; `nil` sur les rangées écrites avant v8.
    var contentHash: String?
}
