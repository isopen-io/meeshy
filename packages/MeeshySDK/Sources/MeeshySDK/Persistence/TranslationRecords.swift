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
}
