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

public struct TranscriptionRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "message_transcriptions"

    public var messageLocalId: String
    public var messageServerId: String?
    public var language: String
    public var text: String
    public var segmentsJson: Data?
    public var speakerCount: Int?
    public var receivedAt: Date

    public init(messageLocalId: String, messageServerId: String?,
                language: String, text: String,
                segmentsJson: Data?, speakerCount: Int?, receivedAt: Date) {
        self.messageLocalId = messageLocalId
        self.messageServerId = messageServerId
        self.language = language
        self.text = text
        self.segmentsJson = segmentsJson
        self.speakerCount = speakerCount
        self.receivedAt = receivedAt
    }
}

public struct AudioTranslationRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "message_audio_translations"

    public var id: String
    public var messageLocalId: String
    public var messageServerId: String?
    public var targetLanguage: String
    public var audioUrl: String?
    public var status: String
    public var receivedAt: Date

    public init(id: String, messageLocalId: String, messageServerId: String?,
                targetLanguage: String, audioUrl: String?,
                status: String, receivedAt: Date) {
        self.id = id
        self.messageLocalId = messageLocalId
        self.messageServerId = messageServerId
        self.targetLanguage = targetLanguage
        self.audioUrl = audioUrl
        self.status = status
        self.receivedAt = receivedAt
    }
}
