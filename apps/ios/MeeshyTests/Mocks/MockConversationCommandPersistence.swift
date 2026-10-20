import Foundation
import MeeshySDK
@testable import Meeshy

actor MockConversationCommandPersistence: ConversationCommandPersisting {

    enum Call: Equatable {
        case markDeleted(localId: String)
        case markUndeleted(localId: String)
        case updatePinned(localId: String, pinnedAt: Date?, pinnedBy: String?)
        case markEditedLocally(localId: String, newContent: String)
        case markEdited(localId: String, newContent: String, editedAt: Date)
        case updateAttachmentsJson(localId: String, hasJson: Bool)
        case appendReaction(localId: String, emoji: String, participantId: String?)
        case removeReaction(localId: String, emoji: String, participantId: String?)
        case updateViewOnceCount(localId: String, count: Int)
    }

    private(set) var calls: [Call] = []
    private(set) var lastAttachmentsJson: Data?
    private let editStamp: Date?

    init(editStamp: Date? = Date(timeIntervalSince1970: 1_000)) {
        self.editStamp = editStamp
    }

    func markDeleted(localId: String, deletedAt: Date, sparingOpenedViewOnce: Bool, expired: Bool) async throws {
        calls.append(.markDeleted(localId: localId))
    }

    func markUndeleted(localId: String) async throws {
        calls.append(.markUndeleted(localId: localId))
    }

    func updatePinned(localId: String, pinnedAt: Date?, pinnedBy: String?) async throws {
        calls.append(.updatePinned(localId: localId, pinnedAt: pinnedAt, pinnedBy: pinnedBy))
    }

    func markEditedLocally(localId: String, newContent: String, now: Date) async throws -> Date? {
        calls.append(.markEditedLocally(localId: localId, newContent: newContent))
        return editStamp
    }

    func markEdited(
        localId: String, newContent: String, editedAt: Date, marksEdited: Bool,
        arrivalsNotice: ArrivalsNoticeMetadata?
    ) async throws {
        calls.append(.markEdited(localId: localId, newContent: newContent, editedAt: editedAt))
    }

    func updateAttachmentsJson(localId: String, attachmentsJson: Data?) async throws {
        lastAttachmentsJson = attachmentsJson
        calls.append(.updateAttachmentsJson(localId: localId, hasJson: attachmentsJson != nil))
    }

    func appendReaction(
        localId: String, reactionId: String, messageId: String, participantId: String?,
        emoji: String, maxCount: Int?, ownerUserId: String?
    ) async throws {
        calls.append(.appendReaction(localId: localId, emoji: emoji, participantId: participantId))
    }

    func removeReaction(
        localId: String, emoji: String, participantId: String?, ownerUserId: String?,
        aggregateCount: Int?, aggregateParticipantIds: [String]?
    ) async throws {
        calls.append(.removeReaction(localId: localId, emoji: emoji, participantId: participantId))
    }

    func updateViewOnceCount(localId: String, count: Int) async throws {
        calls.append(.updateViewOnceCount(localId: localId, count: count))
    }
}

final class MockReactionOutbox: ReactionOutboxEnqueuing, @unchecked Sendable {
    struct Enqueued: Equatable {
        let messageId: String
        let emoji: String
        let action: ReactionAction
        let conversationId: String
    }

    private let lock = NSLock()
    private var storage: [Enqueued] = []

    var enqueued: [Enqueued] {
        lock.lock()
        defer { lock.unlock() }
        return storage
    }

    func enqueue(messageId: String, emoji: String, action: ReactionAction, conversationId: String) async {
        lock.lock()
        storage.append(Enqueued(messageId: messageId, emoji: emoji, action: action, conversationId: conversationId))
        lock.unlock()
    }
}

final class MockAttachmentDeleting: AttachmentDeleting, @unchecked Sendable {
    var failure: (any Error)?
    private(set) var deleted: [String] = []

    func delete(attachmentId: String) async throws {
        if let failure { throw failure }
        deleted.append(attachmentId)
    }
}
