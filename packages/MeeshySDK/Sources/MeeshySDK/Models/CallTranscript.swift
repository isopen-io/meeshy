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
    /// #16665 — les captures d'écran et les bornes de l'enregistrement de
    /// l'appel, datées comme les phrases. Un transcript gardé avant leur
    /// ajout se lit sans aucune.
    public let captures: [CallTranscriptCapture]
    public var id: String { callId }

    public init(callId: String, conversationId: String, callStartedAt: Date, segments: [CallTranscriptSegment], captures: [CallTranscriptCapture] = []) {
        self.callId = callId
        self.conversationId = conversationId
        self.callStartedAt = callStartedAt
        self.segments = segments
        self.captures = captures
    }

    private enum CodingKeys: String, CodingKey {
        case callId, conversationId, callStartedAt, segments, captures
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        callId = try container.decode(String.self, forKey: .callId)
        conversationId = try container.decode(String.self, forKey: .conversationId)
        callStartedAt = try container.decode(Date.self, forKey: .callStartedAt)
        segments = try container.decode([CallTranscriptSegment].self, forKey: .segments)
        captures = try container.decodeIfPresent([CallTranscriptCapture].self, forKey: .captures) ?? []
    }
}

/// #16665 — ce qu'une ligne de capture dit : une capture ponctuelle, un
/// enregistrement d'écran qui commence, ou une borne de l'enregistrement
/// consenti de l'appel. Les valeurs sont celles du fil de la passerelle.
public enum CallTranscriptCaptureKind: String, Codable, Sendable, Equatable, CaseIterable {
    case screenshot
    case recording
    case callRecordingStarted = "call-recording-started"
    case callRecordingStopped = "call-recording-stopped"

    /// Une borne de l'enregistrement de l'appel ne nomme personne.
    public var namesCapturer: Bool {
        self == .screenshot || self == .recording
    }
}

/// #16665 — une ligne datée du journal : qui a capturé l'écran, ou quand
/// l'enregistrement de l'appel a commencé et s'est arrêté.
public struct CallTranscriptCapture: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let userId: String
    public let displayName: String
    public let kind: CallTranscriptCaptureKind
    public let capturedAt: Date

    public init(id: String, userId: String, displayName: String, kind: CallTranscriptCaptureKind, capturedAt: Date) {
        self.id = id
        self.userId = userId
        self.displayName = displayName
        self.kind = kind
        self.capturedAt = capturedAt
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
    /// Tag de la langue dans laquelle le segment a été TRANSCRIT (jamais la
    /// langue de traduction — celle-ci vit dans `translatedLanguage`).
    /// Optionnel : les transcripts persistés avant l'ajout du tag décodent
    /// en `nil`.
    public let language: String?
    public let capturedAt: Date

    public init(speakerId: String, speakerName: String, isLocal: Bool, text: String, translatedText: String?, translatedLanguage: String?, language: String? = nil, capturedAt: Date) {
        self.speakerId = speakerId
        self.speakerName = speakerName
        self.isLocal = isLocal
        self.text = text
        self.translatedText = translatedText
        self.translatedLanguage = translatedLanguage
        self.language = language
        self.capturedAt = capturedAt
    }
}
