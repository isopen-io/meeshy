import Foundation
import GRDB

struct TranslationCacheRecord: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "translation_cache"

    var messageId: String
    var targetLanguage: String
    var encodedData: Data
    var cachedAt: Date
}
