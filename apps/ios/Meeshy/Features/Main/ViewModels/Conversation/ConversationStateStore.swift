import Foundation
import Combine
import MeeshySDK
import MeeshyUI

/// Holds the UI-driven state for a conversation.
/// Separating state from command logic (ViewModel) simplifies the 3000-line God Object.
@MainActor
final class ConversationStateStore: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
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
    var error: String?
    @Published var typingParticipants: [TypingParticipant] = []
    var searchResults: [SearchResultItem] = []
    var isSearching = false
    var searchHasMore = false
    var currentSearchQuery: String?

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
