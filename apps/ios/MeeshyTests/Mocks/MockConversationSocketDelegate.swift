import Foundation
import MeeshySDK
@testable import Meeshy

// MARK: - Mock Delegate

@MainActor
final class MockConversationSocketDelegate: ConversationSocketDelegate {
    var messages: [Message] = []
    var typingParticipants: [TypingParticipant] = []
    /// Projection de lecture — les témoins de ce fichier assertent sur des noms,
    /// pas sur des visages. Miroir exact de `ConversationViewModel.typingUsernames`.
    var typingUsernames: [String] { typingParticipants.displayNames }
    /// Avatars injectés par témoin : `nil` par défaut (l'auteur n'a rien écrit
    /// dans le fil), une entrée pour vérifier qu'un visage connu est bien relayé.
    var stubbedAvatarURLs: [String: String] = [:]
    func localAvatarURL(forSender userId: String) -> String? { stubbedAvatarURLs[userId] }
    var lastUnreadMessage: Message?
    var messageTranslations: [String: [MessageTranslation]] = [:]
    var messageTranscriptions: [String: MessageTranscription] = [:]
    var messageTranscriptionsByAttachment: [String: MessageTranscription] = [:]
    var messageTranslatedAudios: [String: [MessageTranslatedAudio]] = [:]
    var messageTranslatedAudiosByAttachment: [String: [MessageTranslatedAudio]] = [:]
    var activeLiveLocations: [ActiveLiveLocation] = []
    var isConversationClosed: Bool = false
    var isViewportAtBottom: Bool = true

    private var _messageIdIndex: [String: Int]?

    func messageIndex(for id: String) -> Int? {
        if _messageIdIndex == nil {
            var index = [String: Int](minimumCapacity: messages.count)
            for (i, m) in messages.enumerated() { index[m.id] = i }
            _messageIdIndex = index
        }
        return _messageIdIndex?[id]
    }

    func containsMessage(id: String) -> Bool {
        messageIndex(for: id) != nil
    }

    func invalidateIndex() {
        _messageIdIndex = nil
    }

    // Track calls
    var evictedMessages: [Message] = []
    var syncMissedCalled = false

    func evictViewOnceMedia(message: Message) {
        evictedMessages.append(message)
    }

    /// Les ids dont les traductions ont été évincées, dans l'ordre. Une LISTE
    /// et non un ensemble : l'absence d'appel sur la branche `callSummary` fait
    /// partie du contrat testé.
    var invalidatedTranslationIds: [String] = []
    func invalidateTranslations(for messageId: String) {
        invalidatedTranslationIds.append(messageId)
        messageTranslations.removeValue(forKey: messageId)
    }


    func handleParticipantRoleUpdated(participantId: String, newRole: String) {
        // no-op in tests
    }

    func syncMissedMessages() async {
        syncMissedCalled = true
    }

    /// Les lots d'ids passés à `restoreMessagesForMe`, dans l'ordre. Une LISTE
    /// de lots et non un ensemble aplati : le découpage par conversation fait
    /// partie du contrat testé, et un lot vide ne doit jamais être remis.
    var restoredForMeBatches: [[String]] = []
    func restoreMessagesForMe(ids: [String]) async {
        restoredForMeBatches.append(ids)
    }

    func decryptMessagesIfNeeded(_ msgs: inout [Message]) async {
        // no-op in tests
    }

    var pendingServerIds: [String: String] = [:]

    /// Dernier pas de la réconciliation d'un écho (branche A) : il suit les
    /// deux écritures de l'acteur, les témoins l'attendent pour lire la base.
    var persistedUsingServerIdsCount = 0
    func persistMessagesUsingServerIds() async {
        persistedUsingServerIdsCount += 1
    }

    var accessRevokedReasons: [String?] = []
    func handleSocketAccessRevoked(reason: String?) {
        accessRevokedReasons.append(reason)
    }

    var markAsReadCallCount: Int = 0
    func markAsRead() {
        markAsReadCallCount += 1
    }

    var applyAttachmentUpdateEvents: [AttachmentUpdatedEvent] = []
    func applyAttachmentUpdate(_ event: AttachmentUpdatedEvent) {
        applyAttachmentUpdateEvents.append(event)
    }

    var applyAttachmentReactionDeltas: [(attachmentId: String, reactionSummary: [String: Int])] = []
    func applyAttachmentReactionDelta(attachmentId: String, reactionSummary: [String: Int]) {
        applyAttachmentReactionDeltas.append((attachmentId, reactionSummary))
    }
}
