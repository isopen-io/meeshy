import Foundation
import MeeshySDK

nonisolated protocol ConversationCommandPersisting: Sendable {
    func markDeleted(localId: String, deletedAt: Date, sparingOpenedViewOnce: Bool, expired: Bool) async throws
    func markUndeleted(localId: String) async throws
    func updatePinned(localId: String, pinnedAt: Date?, pinnedBy: String?) async throws
    func markEditedLocally(localId: String, newContent: String, now: Date) async throws -> Date?
    func markEdited(
        localId: String, newContent: String, editedAt: Date, marksEdited: Bool,
        arrivalsNotice: ArrivalsNoticeMetadata?
    ) async throws
    func updateAttachmentsJson(localId: String, attachmentsJson: Data?) async throws
    func appendReaction(
        localId: String, reactionId: String, messageId: String, participantId: String?,
        emoji: String, maxCount: Int?, ownerUserId: String?
    ) async throws
    func removeReaction(
        localId: String, emoji: String, participantId: String?, ownerUserId: String?,
        aggregateCount: Int?, aggregateParticipantIds: [String]?
    ) async throws
    func updateViewOnceCount(localId: String, count: Int) async throws
    /// « Supprimer pour moi » (#11221) : la ligne quitte le fil, comme sur un autre
    /// appareil du lecteur à la réception de `message:hidden-for-me`.
    func purgeMessages(ids: [String]) async throws
}

extension MessagePersistenceActor: ConversationCommandPersisting {}

nonisolated protocol ReactionOutboxEnqueuing: Sendable {
    func enqueue(messageId: String, emoji: String, action: ReactionAction, conversationId: String) async
}

nonisolated struct LiveReactionOutbox: ReactionOutboxEnqueuing {
    func enqueue(messageId: String, emoji: String, action: ReactionAction, conversationId: String) async {
        try? await OfflineQueue.shared.enqueueReaction(
            messageId: messageId, emoji: emoji, action: action, conversationId: conversationId
        )
        await OutboxFlushTrigger.flushNow()
    }
}

nonisolated protocol AttachmentDeleting: Sendable {
    func delete(attachmentId: String) async throws
}

extension AttachmentService: AttachmentDeleting {}
