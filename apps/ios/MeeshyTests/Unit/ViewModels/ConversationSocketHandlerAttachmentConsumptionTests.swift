import XCTest
import Combine
import GRDB
import MeeshySDK
@testable import Meeshy

/// I4 (#7360) — `attachment-status:updated` only called `touchUpdatedAt`;
/// `AttachmentConsumptionResolver` (SDK), tested in isolation, was never
/// wired to a live event. A voice message sent 1:1 stayed "not listened yet"
/// in the message-info sheet even after the sole recipient had listened to
/// it in full — closing and reopening the conversation was the only way to
/// see it move.
///
/// Scope: the 1:1 case ONLY. `attachment-status:updated` carries no
/// aggregate count or `complete` flag (G-6, #7359, not yet merged into
/// `dev`) — in a GROUP, a single report cannot say which member sent it,
/// and crediting it as "by all" would be a worse defect than staying
/// silent. In a 1:1 the sole OTHER participant IS the whole audience: one
/// report is proof enough, with no aggregate needed from the wire.
@MainActor
final class ConversationSocketHandlerAttachmentConsumptionTests: XCTestCase {

    private let conversationId = "000000000000000000000099"
    private let currentUserId = "000000000000000000000001"
    private let otherUserId = "000000000000000000000002"

    // MARK: - Factories

    private func makeDB() throws -> (DatabaseQueue, MessagePersistenceActor) {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return (db, MessagePersistenceActor(dbWriter: db))
    }

    private func makeSUT(messageSocket: MockMessageSocket = MockMessageSocket()) -> (
        sut: ConversationSocketHandler, delegate: MockConversationSocketDelegate, socket: MockMessageSocket
    ) {
        let sut = ConversationSocketHandler(
            conversationId: conversationId, currentUserId: currentUserId, messageSocket: messageSocket)
        let delegate = MockConversationSocketDelegate()
        sut.delegate = delegate
        sut.armSocketSubscriptions()
        return (sut, delegate, messageSocket)
    }

    private func makeAudioAttachment(id: String = "att1") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: id, fileName: "vn.m4a", originalName: "vn.m4a",
            mimeType: "audio/mp4", fileSize: 4_096,
            fileUrl: "https://cdn/vn.m4a", uploadedBy: currentUserId
        )
    }

    private func makeAppMessage(
        id: String, attachments: [MeeshyMessageAttachment], recipientCount: Int
    ) -> Message {
        Message(
            id: id, conversationId: conversationId, senderId: currentUserId,
            content: "", createdAt: Date(), updatedAt: Date(),
            attachments: attachments, deliveryStatus: .sent, isMe: true,
            recipientCount: recipientCount
        )
    }

    /// Mirrors the direct `MessageRecord(...)` fixtures already used
    /// elsewhere in `ConversationSocketHandlerTests.swift` (e.g. around its
    /// `messageDeleted` persistence test) — this file stays a standalone,
    /// small suite (budget: extracted, not added to the 2500+ line parent).
    private func makeRecord(messageId: String, attachments: [MeeshyMessageAttachment]) throws -> MessageRecord {
        MessageRecord(
            localId: messageId, serverId: nil,
            conversationId: conversationId, senderId: currentUserId,
            content: nil, originalLanguage: "fr",
            messageType: "audio", messageSource: "user", contentType: "audio",
            state: .sent, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: nil, storyReplyToId: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: nil, senderUsername: nil,
            senderColor: nil, senderAvatarURL: nil,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: Date(), sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: Date(),
            attachmentsJson: try JSONEncoder().encode(attachments),
            reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0
        )
    }

    private func makeEvent(
        action: String, userId: String, attachmentId: String = "att1", messageId: String = "msg1"
    ) -> AttachmentStatusUpdatedEvent {
        JSONStub.decode("""
        {
            "attachmentId":"\(attachmentId)",
            "messageId":"\(messageId)",
            "conversationId":"\(conversationId)",
            "userId":"\(userId)",
            "action":"\(action)",
            "updatedAt":"2099-12-31T23:59:59.000Z"
        }
        """)
    }

    private func fetchAttachment(
        db: DatabaseQueue, messageId: String, attachmentId: String
    ) async throws -> MeeshyMessageAttachment? {
        let record = try await db.read { db in try MessageRecord.fetchOne(db, key: messageId) }
        guard let data = record?.attachmentsJson else { return nil }
        return try JSONDecoder().decode([MeeshyMessageAttachment].self, from: data)
            .first { $0.id == attachmentId }
    }

    // MARK: - Tests

    func test_attachmentStatusUpdated_fromSoleOtherRecipient_marksListenedByAll() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor

        let attachment = makeAudioAttachment()
        try await actor.insertOptimistic(try makeRecord(messageId: "msg1", attachments: [attachment]))
        delegate.messages = [makeAppMessage(id: "msg1", attachments: [attachment], recipientCount: 1)]
        delegate.invalidateIndex()

        socket.attachmentStatusUpdated.send(makeEvent(action: "listened", userId: otherUserId))

        try await Task.sleep(nanoseconds: 400_000_000)

        let updated = try await fetchAttachment(db: db, messageId: "msg1", attachmentId: "att1")
        XCTAssertNotNil(
            updated?.listenedByAllAt,
            "the sole OTHER recipient of a 1:1 IS the whole audience — one report should be enough"
        )
        XCTAssertEqual(updated?.consumedCount, 1)
        _ = sut
    }

    func test_attachmentStatusUpdated_fromSelf_doesNotMarkConsumedByAll() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor

        let attachment = makeAudioAttachment()
        try await actor.insertOptimistic(try makeRecord(messageId: "msg1", attachments: [attachment]))
        delegate.messages = [makeAppMessage(id: "msg1", attachments: [attachment], recipientCount: 1)]
        delegate.invalidateIndex()

        socket.attachmentStatusUpdated.send(makeEvent(action: "listened", userId: currentUserId))

        try await Task.sleep(nanoseconds: 400_000_000)

        let updated = try await fetchAttachment(db: db, messageId: "msg1", attachmentId: "att1")
        XCTAssertNil(
            updated?.listenedByAllAt,
            "one's own playback echo (multi-device sync) is not a recipient confirming consumption"
        )
        _ = sut
    }

    func test_attachmentStatusUpdated_inAGroup_doesNotClaimConsumedByAll() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor

        let attachment = makeAudioAttachment()
        try await actor.insertOptimistic(try makeRecord(messageId: "msg1", attachments: [attachment]))
        delegate.messages = [makeAppMessage(id: "msg1", attachments: [attachment], recipientCount: 3)]
        delegate.invalidateIndex()

        socket.attachmentStatusUpdated.send(makeEvent(action: "listened", userId: otherUserId))

        try await Task.sleep(nanoseconds: 400_000_000)

        let updated = try await fetchAttachment(db: db, messageId: "msg1", attachmentId: "att1")
        XCTAssertNil(
            updated?.listenedByAllAt,
            "a single event cannot say which of 3 recipients reported — G-6 (#7359) adds the aggregate this needs"
        )
        _ = sut
    }

    func test_attachmentStatusUpdated_mismatchedAction_isNotCredited() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor

        let attachment = makeAudioAttachment() // primary action for audio/* is "listened"
        try await actor.insertOptimistic(try makeRecord(messageId: "msg1", attachments: [attachment]))
        delegate.messages = [makeAppMessage(id: "msg1", attachments: [attachment], recipientCount: 1)]
        delegate.invalidateIndex()

        socket.attachmentStatusUpdated.send(makeEvent(action: "downloaded", userId: otherUserId))

        try await Task.sleep(nanoseconds: 400_000_000)

        let updated = try await fetchAttachment(db: db, messageId: "msg1", attachmentId: "att1")
        XCTAssertNil(updated?.listenedByAllAt, "downloading an audio attachment is not listening to it")
        XCTAssertNil(
            updated?.downloadedByAllAt,
            "AttachmentConsumptionResolver.primaryAction(forMimeType:) governs the credited field, " +
            "not the raw event action"
        )
        _ = sut
    }
}
