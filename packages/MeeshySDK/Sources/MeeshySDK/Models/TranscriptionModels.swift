import Foundation

// MARK: - Message Transcription Segment

public struct MessageTranscriptionSegment: Identifiable {
    public let id = UUID()
    public let text: String
    public let startTime: Double?
    public let endTime: Double?
    public let speakerId: String?

    public init(text: String, startTime: Double? = nil, endTime: Double? = nil, speakerId: String? = nil) {
        self.text = text; self.startTime = startTime; self.endTime = endTime; self.speakerId = speakerId
    }
}

// MARK: - Message Transcription

public struct MessageTranscription {
    public let attachmentId: String
    public let text: String
    public let language: String
    public let confidence: Double?
    public let durationMs: Int?
    public let segments: [MessageTranscriptionSegment]
    public let speakerCount: Int?

    public init(attachmentId: String, text: String, language: String, confidence: Double? = nil,
                durationMs: Int? = nil, segments: [MessageTranscriptionSegment] = [], speakerCount: Int? = nil) {
        self.attachmentId = attachmentId; self.text = text; self.language = language
        self.confidence = confidence; self.durationMs = durationMs
        self.segments = segments; self.speakerCount = speakerCount
    }
}

// MARK: - Message Translated Audio

public struct MessageTranslatedAudio: Identifiable {
    public let id: String
    public let attachmentId: String
    public let targetLanguage: String
    public let url: String
    public let transcription: String
    public let durationMs: Int
    public let format: String
    public let cloned: Bool
    public let quality: Double
    public let ttsModel: String
    public let segments: [MessageTranscriptionSegment]

    public init(id: String, attachmentId: String, targetLanguage: String, url: String,
                transcription: String, durationMs: Int, format: String, cloned: Bool,
                quality: Double, ttsModel: String, segments: [MessageTranscriptionSegment] = []) {
        self.id = id; self.attachmentId = attachmentId; self.targetLanguage = targetLanguage
        self.url = url; self.transcription = transcription; self.durationMs = durationMs
        self.format = format; self.cloned = cloned; self.quality = quality
        self.ttsModel = ttsModel; self.segments = segments
    }
}
