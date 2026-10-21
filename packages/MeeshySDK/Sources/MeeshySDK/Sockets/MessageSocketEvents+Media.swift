import Foundation
import SocketIO
import Combine
import os

// MARK: - Transcription Event Data

public struct TranscriptionSegment: Codable, Sendable {
    public let text: String
    public let startTime: Double?
    public let endTime: Double?
    public let speakerId: String?
    public let voiceSimilarityScore: Double?

    private enum CodingKeys: String, CodingKey {
        case text, startMs, endMs, startTime, endTime, speakerId, voiceSimilarityScore
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        text = try c.decode(String.self, forKey: .text)
        speakerId = try c.decodeIfPresent(String.self, forKey: .speakerId)
        voiceSimilarityScore = try c.decodeIfPresent(Double.self, forKey: .voiceSimilarityScore)
        if let ms = try c.decodeIfPresent(Double.self, forKey: .startMs) {
            startTime = ms / 1000.0
        } else {
            startTime = try c.decodeIfPresent(Double.self, forKey: .startTime)
        }
        if let ms = try c.decodeIfPresent(Double.self, forKey: .endMs) {
            endTime = ms / 1000.0
        } else {
            endTime = try c.decodeIfPresent(Double.self, forKey: .endTime)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(text, forKey: .text)
        try c.encodeIfPresent(startTime, forKey: .startTime)
        try c.encodeIfPresent(endTime, forKey: .endTime)
        try c.encodeIfPresent(speakerId, forKey: .speakerId)
        try c.encodeIfPresent(voiceSimilarityScore, forKey: .voiceSimilarityScore)
    }
}

public struct TranscriptionData: Codable, Sendable {
    public let id: String?
    public let text: String
    public let language: String
    public let confidence: Double?
    public let durationMs: Int?
    public let segments: [TranscriptionSegment]?
    public let speakerCount: Int?
}

public struct TranscriptionReadyEvent: Codable, Sendable {
    public let messageId: String
    public let attachmentId: String
    public let conversationId: String
    public let transcription: TranscriptionData
    public let processingTimeMs: Int?
}

// MARK: - Audio Translation Event Data

public struct TranslatedAudioInfo: Codable, Sendable {
    public let id: String
    public let targetLanguage: String
    public let url: String
    public let transcription: String
    public let durationMs: Int
    public let format: String
    public let cloned: Bool
    public let quality: Double
    public let voiceModelId: String?
    public let ttsModel: String
    public let segments: [TranscriptionSegment]?
}

public struct AudioTranslationEvent: Codable, Sendable {
    public let messageId: String
    public let attachmentId: String
    public let conversationId: String
    public let language: String
    public let translatedAudio: TranslatedAudioInfo
    public let processingTimeMs: Int?
}

// MARK: - Translation / Audio / Transcription Failure Events

public struct TranslationFailedEvent: Codable, Sendable {
    public let messageId: String
    public let conversationId: String
    public let error: String
    public let taskId: String?
}

public struct AudioTranslationFailedEvent: Codable, Sendable {
    public let messageId: String
    public let attachmentId: String
    public let conversationId: String
    public let error: String
    public let errorCode: String?
    public let taskId: String?
}

public struct TranscriptionFailedEvent: Codable, Sendable {
    public let messageId: String
    public let attachmentId: String
    public let conversationId: String
    public let error: String
    public let errorCode: String?
    public let taskId: String?
}
