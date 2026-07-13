import Foundation

/// A single call's persisted multi-speaker transcript/translation history —
/// local-only, never sent to the Meeshy server (may be included in this
/// device's own iCloud/Finder backup like any other local app data). See
/// docs/superpowers/specs/2026-07-11-call-transcript-history-design.md.
public struct CallTranscript: Codable, Sendable, CacheIdentifiable, Equatable {
    public let callId: String
    public let conversationId: String
    public let callStartedAt: Date
    public let segments: [CallTranscriptSegment]
    public var id: String { callId }

    public init(callId: String, conversationId: String, callStartedAt: Date, segments: [CallTranscriptSegment]) {
        self.callId = callId
        self.conversationId = conversationId
        self.callStartedAt = callStartedAt
        self.segments = segments
    }
}

/// One utterance in a persisted call transcript. `speakerName`/`isLocal` are
/// resolved once at call-end (not stored redundantly elsewhere) since names
/// can change after the fact but the transcript should reflect who it was at
/// the time.
public struct CallTranscriptSegment: Codable, Sendable, Equatable {
    public let speakerId: String
    public let speakerName: String
    public let isLocal: Bool
    public let text: String
    public let translatedText: String?
    public let translatedLanguage: String?
    public let capturedAt: Date

    public init(speakerId: String, speakerName: String, isLocal: Bool, text: String, translatedText: String?, translatedLanguage: String?, capturedAt: Date) {
        self.speakerId = speakerId
        self.speakerName = speakerName
        self.isLocal = isLocal
        self.text = text
        self.translatedText = translatedText
        self.translatedLanguage = translatedLanguage
        self.capturedAt = capturedAt
    }
}
