import Foundation
import Combine
import MeeshySDK
import MeeshyUI

/// Holds the UI-driven state for a conversation.
/// Separating state from command logic (ViewModel) simplifies the 3000-line God Object.
@MainActor
final class ConversationStateStore: ObservableObject {
    /// Deliberately NOT `@Published`: no View ever reads it. The only observer
    /// of this store is `ConversationView` (as `typingObserver`), and its body
    /// reads typing/loading state, never `messages`. The three readers
    /// (command/media handlers, `ConversationViewModel`) are synchronous point
    /// reads, not view dependencies. Publishing it therefore bought nothing but
    /// a wasted `objectWillChange` emission on `typingObserver` (plus its
    /// dependency bookkeeping) on every mirror write — several times per second
    /// on an active conversation. A plain stored property serves the readers
    /// without that churn.
    var messages: [Message] = []
    @Published var isLoadingInitial = false
    @Published var isLoadingOlder = false
    @Published var isLoadingNewer = false
    @Published var isRevalidating = false
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

    init() {}
}

// MARK: - Helper Models

struct AudioItem: Identifiable {
    let id: String // attachment.id
    let attachment: MessageAttachment
    let message: Message
    let transcription: MessageTranscription?
    let translatedAudios: [MessageTranslatedAudio]
}

struct MediaSenderInfo {
    let senderName: String
    let senderAvatarURL: String?
    let senderColor: String
    let sentAt: Date
}
