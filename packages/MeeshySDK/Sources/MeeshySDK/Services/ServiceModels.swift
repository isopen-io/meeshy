import Foundation

// MARK: - Conversation Requests

public struct CreateConversationRequest: Encodable {
    public let type: String
    public let title: String?
    public let participantIds: [String]

    public init(type: String, title: String? = nil, participantIds: [String]) {
        self.type = type; self.title = title; self.participantIds = participantIds
    }
}

public struct CreateConversationResponse: Decodable {
    public let id: String
    public let type: String
    public let title: String?
    public let createdAt: Date
}

// MARK: - Reaction Requests

public struct AddReactionRequest: Encodable {
    public let messageId: String
    public let emoji: String

    public init(messageId: String, emoji: String) {
        self.messageId = messageId; self.emoji = emoji
    }
}

// MARK: - Mobile Transcription

public struct MobileTranscriptionSegment: Encodable, Sendable {
    public let text: String
    public let start: Double?
    public let end: Double?
    public let speakerId: String?

    public init(text: String, start: Double? = nil, end: Double? = nil, speakerId: String? = nil) {
        self.text = text; self.start = start; self.end = end; self.speakerId = speakerId
    }

    enum CodingKeys: String, CodingKey {
        case text, start, end
        case speakerId = "speaker_id"
    }
}

public struct MobileTranscriptionPayload: Encodable, Sendable {
    public let text: String
    public let language: String
    public let confidence: Double?
    public let durationMs: Int?
    public let segments: [MobileTranscriptionSegment]

    public init(text: String, language: String, confidence: Double? = nil,
                durationMs: Int? = nil, segments: [MobileTranscriptionSegment] = []) {
        self.text = text; self.language = language
        self.confidence = confidence; self.durationMs = durationMs; self.segments = segments
    }

    enum CodingKeys: String, CodingKey {
        case text, language, confidence, segments
        case durationMs = "duration_ms"
    }
}

// MARK: - Post Requests

public struct CreatePostRequest: Encodable {
    public let content: String?
    public let type: String
    public let visibility: String
    public let moodEmoji: String?
    public let visibilityUserIds: [String]?
    public let mediaIds: [String]?
    public let audioUrl: String?
    public let audioDuration: Int?
    public let originalLanguage: String?
    public let mobileTranscription: MobileTranscriptionPayload?
    public let viaUsername: String?
    public let repostOfId: String?

    public init(content: String? = nil, type: String = "POST", visibility: String = "PUBLIC", moodEmoji: String? = nil, visibilityUserIds: [String]? = nil, mediaIds: [String]? = nil, audioUrl: String? = nil, audioDuration: Int? = nil, originalLanguage: String? = nil, mobileTranscription: MobileTranscriptionPayload? = nil, viaUsername: String? = nil, repostOfId: String? = nil) {
        self.content = content; self.type = type; self.visibility = visibility
        self.moodEmoji = moodEmoji; self.visibilityUserIds = visibilityUserIds
        self.mediaIds = mediaIds; self.audioUrl = audioUrl; self.audioDuration = audioDuration
        self.originalLanguage = originalLanguage
        self.mobileTranscription = mobileTranscription; self.viaUsername = viaUsername
        self.repostOfId = repostOfId
    }
}

public struct CreateCommentRequest: Encodable {
    public let content: String
    public let parentId: String?
    public let effectFlags: Int?
    /// IDs des PostMedia déjà uploadés (uploadContext=comment) à attacher au
    /// commentaire. Wire aligné sur le contrat message-with-attachments (tableau),
    /// MAIS un commentaire ne porte QU'UN SEUL média : le gateway borne à 1.
    /// Omis du payload quand vide (endpoint texte-seul inchangé).
    public let attachmentIds: [String]?
    /// Transcription Whisper produite côté mobile pour un média audio (skip
    /// re-transcription serveur). Même structure que pour les posts.
    public let mobileTranscription: MobileTranscriptionPayload?
    public let originalLanguage: String?

    public init(content: String, parentId: String? = nil, effectFlags: Int? = nil,
                attachmentIds: [String]? = nil,
                mobileTranscription: MobileTranscriptionPayload? = nil,
                originalLanguage: String? = nil) {
        self.content = content
        self.parentId = parentId
        self.effectFlags = effectFlags
        self.attachmentIds = (attachmentIds?.isEmpty == false) ? attachmentIds : nil
        self.mobileTranscription = mobileTranscription
        self.originalLanguage = originalLanguage
    }
}

public struct LikeRequest: Encodable {
    public let emoji: String
    public init(emoji: String) {
        self.emoji = emoji
    }
}

public struct UpdatePostRequest: Encodable, Sendable {
    public let content: String?
    public let visibility: String?
    public let visibilityUserIds: [String]?
    public let moodEmoji: String?
    /// Source language. Changing it re-runs the Prisme translation pipeline.
    public let originalLanguage: String?
    /// Editable only between "POST" and "REEL" (gateway enforces the rest).
    public let type: String?
    /// Ids of attached media (PostMedia) to detach during the edit.
    public let removeMediaIds: [String]?

    public init(content: String? = nil, visibility: String? = nil, visibilityUserIds: [String]? = nil,
                moodEmoji: String? = nil, originalLanguage: String? = nil, type: String? = nil,
                removeMediaIds: [String]? = nil) {
        self.content = content; self.visibility = visibility
        self.visibilityUserIds = visibilityUserIds
        self.moodEmoji = moodEmoji
        self.originalLanguage = originalLanguage
        self.type = type
        self.removeMediaIds = removeMediaIds
    }
}

public struct CreateStoryRequest: Encodable {
    public let type = "STORY"
    public let content: String?
    public let storyEffects: StoryEffects?
    public let visibility: String
    public let visibilityUserIds: [String]?
    public let originalLanguage: String?
    public let mediaIds: [String]?
    public let repostOfId: String?

    public init(content: String? = nil, storyEffects: StoryEffects? = nil, visibility: String = "PUBLIC", visibilityUserIds: [String]? = nil, originalLanguage: String? = nil, mediaIds: [String]? = nil, repostOfId: String? = nil) {
        self.content = content; self.storyEffects = storyEffects; self.visibility = visibility
        self.visibilityUserIds = visibilityUserIds
        self.originalLanguage = originalLanguage; self.mediaIds = mediaIds
        self.repostOfId = repostOfId
    }
}

// MARK: - Preference Requests

public struct UpdateConversationPreferencesRequest: Encodable, Sendable {
    public var isPinned: Bool?
    public var isMuted: Bool?
    public var isArchived: Bool?
    public var categoryId: String?
    public var tags: [String]?
    public var reaction: String?
    public var customName: String?
    public var mentionsOnly: Bool?

    public init(isPinned: Bool? = nil, isMuted: Bool? = nil, isArchived: Bool? = nil, categoryId: String? = nil, tags: [String]? = nil, reaction: String? = nil, customName: String? = nil, mentionsOnly: Bool? = nil) {
        self.isPinned = isPinned; self.isMuted = isMuted; self.isArchived = isArchived
        self.categoryId = categoryId; self.tags = tags; self.reaction = reaction
        self.customName = customName; self.mentionsOnly = mentionsOnly
    }
}

// MARK: - Category

public struct ConversationCategory: Codable, Identifiable, Sendable, CacheIdentifiable {
    public let id: String
    public let name: String
    public let color: String?
    public let icon: String?
    public let order: Int?
    public let isExpanded: Bool?

    public init(id: String, name: String, color: String?, icon: String?, order: Int?, isExpanded: Bool?) {
        self.id = id
        self.name = name
        self.color = color
        self.icon = icon
        self.order = order
        self.isExpanded = isExpanded
    }
}

// MARK: - Translation

public struct TranslateRequest: Encodable {
    public let text: String
    public let sourceLanguage: String
    public let targetLanguage: String
    public let messageId: String?

    public init(text: String, sourceLanguage: String, targetLanguage: String, messageId: String? = nil) {
        self.text = text; self.sourceLanguage = sourceLanguage; self.targetLanguage = targetLanguage
        self.messageId = messageId
    }

    enum CodingKeys: String, CodingKey {
        case text
        case sourceLanguage = "source_language"
        case targetLanguage = "target_language"
        case messageId = "message_id"
    }
}

public struct TranslateResponse: Decodable {
    public let translatedText: String
    public let detectedLanguage: String?

    enum CodingKeys: String, CodingKey {
        case translatedText = "translated_text"
        case detectedLanguage = "source_language"
    }
}

// MARK: - User Search

public struct UserSearchResult: Codable, CacheIdentifiable, Identifiable, Sendable, Equatable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
    public let isOnline: Bool?

    public init(
        id: String,
        username: String,
        displayName: String? = nil,
        avatar: String? = nil,
        isOnline: Bool? = nil
    ) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
        self.isOnline = isOnline
    }
}

// MARK: - Attachment Status

/// Per-user playback / view stats for a single attachment.
///
/// The gateway returns rows keyed by `participantId` (cf. `MessageReadStatusService.getAttachmentStatusDetails`).
/// Historically this struct used `userId`, which caused `JSONDecoder` to fail
/// silently against the real payload, leaving the "Écouté" / "Vu" tabs empty
/// even when stats existed in MongoDB.
public struct AttachmentStatusUser: Decodable, Identifiable {
    public let participantId: String
    public let username: String
    public let avatar: String?
    public let viewedAt: Date?
    public let downloadedAt: Date?
    public let listenedAt: Date?
    public let watchedAt: Date?
    public let listenCount: Int?
    public let watchCount: Int?
    public let listenedComplete: Bool?
    public let watchedComplete: Bool?
    public let lastPlayPositionMs: Int?
    public let lastWatchPositionMs: Int?

    public var id: String { participantId }
}

// MARK: - Attachment Transcription

public struct TranscribeRequest: Encodable {
    public let force: Bool

    public init(force: Bool) {
        self.force = force
    }

    enum CodingKeys: String, CodingKey {
        case force
    }
}

// MARK: - Generic empty success for fire-and-forget

public struct EmptySuccess: Decodable {
    public init() {}
}

// MARK: - Attachment Translation

public struct AttachmentTranslateRequest: Encodable {
    public let targetLanguages: [String]
    public let sourceLanguage: String?
    public let generateVoiceClone: Bool?

    public init(
        targetLanguages: [String],
        sourceLanguage: String? = nil,
        generateVoiceClone: Bool? = nil
    ) {
        self.targetLanguages = targetLanguages
        self.sourceLanguage = sourceLanguage
        self.generateVoiceClone = generateVoiceClone
    }
}

public struct AttachmentTranslationResult: Decodable, Sendable {
    public let id: String
    public let targetLanguage: String
    public let translatedText: String?
    public let audioUrl: String?
    public let durationMs: Int?
    public let voiceCloned: Bool?

    public init(
        id: String,
        targetLanguage: String,
        translatedText: String? = nil,
        audioUrl: String? = nil,
        durationMs: Int? = nil,
        voiceCloned: Bool? = nil
    ) {
        self.id = id
        self.targetLanguage = targetLanguage
        self.translatedText = translatedText
        self.audioUrl = audioUrl
        self.durationMs = durationMs
        self.voiceCloned = voiceCloned
    }
}

public struct AttachmentTranslateResponse: Decodable, Sendable {
    public let status: String?
    public let jobId: String?
    public let translations: [AttachmentTranslationResult]

    public init(status: String?, jobId: String?, translations: [AttachmentTranslationResult]) {
        self.status = status
        self.jobId = jobId
        self.translations = translations
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        status = try container.decodeIfPresent(String.self, forKey: .status)
        jobId = try container.decodeIfPresent(String.self, forKey: .jobId)
        translations = (try? container.decodeIfPresent([AttachmentTranslationResult].self, forKey: .translations)) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case status, jobId, translations
    }
}

/// Thrown by `AttachmentService.translate` when the gateway returns HTTP 403
/// with a consent-required payload (e.g. `AUDIO_TRANSLATION_NOT_ENABLED`).
public struct AttachmentConsentError: Error, Sendable {
    public let code: String
    public let message: String
    public let requiredConsents: [String]
}

/// Decodable shape of the HTTP 403 body for consent-required 403 responses.
struct AttachmentConsentErrorBody: Decodable {
    let error: String
    let message: String?
    let requiredConsents: [String]?
}
