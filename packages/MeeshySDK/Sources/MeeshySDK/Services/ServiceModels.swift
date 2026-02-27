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

// MARK: - Post Requests

public struct CreatePostRequest: Encodable {
    public let content: String
    public let type: String
    public let visibility: String
    public let moodEmoji: String?
    public let visibilityUserIds: [String]?
    public let mediaIds: [String]?
    public let audioUrl: String?
    public let audioDuration: Int?

    public init(content: String, type: String = "POST", visibility: String = "PUBLIC", moodEmoji: String? = nil, visibilityUserIds: [String]? = nil, mediaIds: [String]? = nil, audioUrl: String? = nil, audioDuration: Int? = nil) {
        self.content = content; self.type = type; self.visibility = visibility
        self.moodEmoji = moodEmoji; self.visibilityUserIds = visibilityUserIds
        self.mediaIds = mediaIds; self.audioUrl = audioUrl; self.audioDuration = audioDuration
    }
}

public struct CreateCommentRequest: Encodable {
    public let content: String

    public init(content: String) {
        self.content = content
    }
}

public struct CreateStoryRequest: Encodable {
    public let type = "STORY"
    public let content: String?
    public let storyEffects: StoryEffects?
    public let visibility: String
    public let mediaIds: [String]?

    public init(content: String? = nil, storyEffects: StoryEffects? = nil, visibility: String = "PUBLIC", mediaIds: [String]? = nil) {
        self.content = content; self.storyEffects = storyEffects; self.visibility = visibility
        self.mediaIds = mediaIds
    }
}

// MARK: - Preference Requests

public struct UpdateConversationPreferencesRequest: Encodable {
    public var isPinned: Bool?
    public var isMuted: Bool?
    public var isArchived: Bool?
    public var categoryId: String?
    public var tags: [String]?

    public init(isPinned: Bool? = nil, isMuted: Bool? = nil, isArchived: Bool? = nil, categoryId: String? = nil, tags: [String]? = nil) {
        self.isPinned = isPinned; self.isMuted = isMuted; self.isArchived = isArchived
        self.categoryId = categoryId; self.tags = tags
    }
}

// MARK: - Category

public struct ConversationCategory: Decodable, Identifiable {
    public let id: String
    public let name: String
    public let color: String?
    public let icon: String?
    public let order: Int?
}

// MARK: - Translation

public struct TranslateRequest: Encodable {
    public let text: String
    public let sourceLanguage: String
    public let targetLanguage: String

    public init(text: String, sourceLanguage: String, targetLanguage: String) {
        self.text = text; self.sourceLanguage = sourceLanguage; self.targetLanguage = targetLanguage
    }

    enum CodingKeys: String, CodingKey {
        case text
        case sourceLanguage = "source_language"
        case targetLanguage = "target_language"
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

public struct UserSearchResult: Decodable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
    public let isOnline: Bool?
}

// MARK: - Attachment Status

public struct AttachmentStatusUser: Decodable, Identifiable {
    public let userId: String
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

    public var id: String { userId }
}

// MARK: - Generic empty success for fire-and-forget

public struct EmptySuccess: Decodable {
    public init() {}
}
