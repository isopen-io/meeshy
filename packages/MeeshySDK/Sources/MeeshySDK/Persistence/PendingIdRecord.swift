import Foundation
import GRDB

public struct PendingIdRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "pending_ids"

    public var localId: String
    public var serverId: String
    public var conversationId: String
    public var reconciledAt: Date?
}
