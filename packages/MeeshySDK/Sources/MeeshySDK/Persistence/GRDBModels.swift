import Foundation
import GRDB

public struct DBConversation: Codable, FetchableRecord, PersistableRecord {
    public static let databaseTableName = "conversations"
    
    public var id: String
    public var name: String
    public var encodedData: Data
    public var updatedAt: Date
}

public struct DBMessage: Codable, FetchableRecord, PersistableRecord {
    public static let databaseTableName = "messages"
    
    public var id: String
    public var conversationId: String
    public var createdAt: Date
    public var encodedData: Data
}
