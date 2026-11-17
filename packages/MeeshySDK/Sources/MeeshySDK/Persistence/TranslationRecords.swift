import Foundation
import GRDB

public struct TranslationRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "message_translations"

    public var id: String
    public var messageLocalId: String
    public var messageServerId: String?
    public var targetLanguage: String
    public var translatedContent: String
    public var translationModel: String
    public var confidenceScore: Double?
    public var sourceLanguage: String?
    public var receivedAt: Date

    public init(id: String, messageLocalId: String, messageServerId: String?,
                targetLanguage: String, translatedContent: String,
                translationModel: String, confidenceScore: Double?,
                sourceLanguage: String?, receivedAt: Date) {
        self.id = id
        self.messageLocalId = messageLocalId
        self.messageServerId = messageServerId
        self.targetLanguage = targetLanguage
        self.translatedContent = translatedContent
        self.translationModel = translationModel
        self.confidenceScore = confidenceScore
        self.sourceLanguage = sourceLanguage
        self.receivedAt = receivedAt
    }
}
