import Foundation
import Combine
import MeeshySDK
import MeeshyUI

/// Holds the UI-driven state for a conversation.
/// Separating state from command logic (ViewModel) simplifies the 3000-line God Object.
@MainActor
public final class ConversationStateStore: ObservableObject {
    @Published var messages: [Message] = []
    @Published var isLoadingInitial = false
    @Published var isLoadingOlder = false
    @Published var isLoadingNewer = false
    @Published var isRevalidating = false
    @Published var editInProgress: Set<String> = []
    @Published var hasOlderMessages = true
    @Published var hasNewerMessages = false
    @Published var isSending = false
    @Published var error: String?
    @Published var scrollAnchorId: String?
    @Published var typingUsernames: [String] = []

    @Published var messageTranslations: [String: [MessageTranslation]] = [:]
    @Published var messageTranscriptions: [String: MessageTranscription] = [:]
    @Published var messageTranslatedAudios: [String: [MessageTranslatedAudio]] = [:]
    @Published var activeTranslationOverrides: [String: MessageTranslation?] = [:]
    @Published var activeAudioLanguageOverrides: [String: String?] = [:]

    @Published var preferredLanguageRevision: Int = 0
    @Published var activeLiveLocations: [ActiveLiveLocation] = []
    @Published var lastUnreadMessage: Message?
    @Published var currentConversationUnreadCount: Int = 0
    @Published var otherConversationsUnread: Int = 0

    @Published var reactionDetails: [ReactionGroup] = []
    @Published var isLoadingReactions = false
    @Published var firstUnreadMessageId: String?
    @Published var isConversationClosed = false
    @Published var accessRevoked: Bool = false

    @Published var ephemeralDuration: EphemeralDuration?
    @Published var isBlurEnabled: Bool = false
    @Published var pendingEffects: MessageEffects = .none
    @Published var showEffectsPicker: Bool = false

    @Published var searchResults: [SearchResultItem] = []
    @Published var isSearching = false
    @Published var searchHasMore = false
    @Published var currentSearchQuery: String?
    @Published var isInJumpedState = false
    @Published var isSearchingQuotedMessage = false
    @Published var quotedMessageSearchTarget: String? = nil

    var isCurrentlyNearBottom: Bool = true
    var isProgrammaticScroll = false
    var pendingServerIds: [String: String] = [:]

    // MARK: - Cached derived data

    @Published var topActiveMembers: [ConversationActiveMember] = []
    @Published var allAudioItems: [AudioItem] = []
    @Published var mediaCaptionMap: [String: String] = [:]
    @Published var mediaSenderInfoMap: [String: MediaSenderInfo] = [:]

    public init() {}
}

// MARK: - Helper Models

public struct AudioItem: Identifiable {
    public let id: String // attachment.id
    public let attachment: MessageAttachment
    public let message: Message
    public let transcription: MessageTranscription?
    public let translatedAudios: [MessageTranslatedAudio]
}

public struct MediaSenderInfo {
    public let senderName: String
    public let senderAvatarURL: String?
    public let senderColor: String
    public let sentAt: Date
}
