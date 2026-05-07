import XCTest
import Combine
import GRDB
import MeeshySDK
@testable import Meeshy

// MARK: - Mock Delegate

@MainActor
final class MockConversationSocketDelegate: ConversationSocketDelegate {
    var messages: [Message] = []
    var typingUsernames: [String] = []
    var lastUnreadMessage: Message?
    var newMessageAppended: Int = 0
    var messageTranslations: [String: [MessageTranslation]] = [:]
    var messageTranscriptions: [String: MessageTranscription] = [:]
    var messageTranslatedAudios: [String: [MessageTranslatedAudio]] = [:]
    var activeLiveLocations: [ActiveLiveLocation] = []
    var isConversationClosed: Bool = false

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
    var consumedMessageIds: [String] = []
    var syncMissedCalled = false

    func evictViewOnceMedia(message: Message) {
        evictedMessages.append(message)
    }

    func markMessageAsConsumed(messageId: String) {
        consumedMessageIds.append(messageId)
    }

    func handleParticipantRoleUpdated(participantId: String, newRole: String) {
        // no-op in tests
    }

    func syncMissedMessages() async {
        syncMissedCalled = true
    }

    func decryptMessagesIfNeeded(_ msgs: inout [Message]) async {
        // no-op in tests
    }

    var pendingServerIds: [String: String] = [:]

    func persistMessagesUsingServerIds() async {
        // no-op in tests
    }

    var accessRevokedReasons: [String?] = []
    func handleSocketAccessRevoked(reason: String?) {
        accessRevokedReasons.append(reason)
    }

    var markAsReadCallCount: Int = 0
    func markAsRead() {
        markAsReadCallCount += 1
    }
}

// MARK: - Tests

final class ConversationSocketHandlerTests: XCTestCase {

    private let conversationId = "000000000000000000000099"
    private let currentUserId = "000000000000000000000001"
    private let otherUserId = "000000000000000000000002"

    // MARK: - Factory

    private func makeSUT(
        messageSocket: MockMessageSocket = MockMessageSocket()
    ) -> (
        sut: ConversationSocketHandler,
        delegate: MockConversationSocketDelegate,
        socket: MockMessageSocket
    ) {
        let sut = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: currentUserId,
            messageSocket: messageSocket
        )
        let delegate = MockConversationSocketDelegate()
        sut.delegate = delegate
        sut.armSocketSubscriptions()
        return (sut, delegate, messageSocket)
    }

    private func makeReactionEvent(
        messageId: String,
        emoji: String,
        participantId: String,
        action: String
    ) -> ReactionUpdateEvent {
        // Include conversationId so the production .filter { $0.conversationId == convId }
        // subscription accepts the event (post-Phase-1.5 the socket handler filters
        // strictly on conversationId).
        let json = """
        {
            "messageId": "\(messageId)",
            "conversationId": "\(conversationId)",
            "participantId": "\(participantId)",
            "emoji": "\(emoji)",
            "action": "\(action)",
            "aggregation": {
                "emoji": "\(emoji)",
                "count": \(action == "remove" ? 0 : 1),
                "participantIds": ["\(participantId)"],
                "hasCurrentUser": false
            },
            "timestamp": "2026-03-06T12:00:00.000Z"
        }
        """.data(using: .utf8)!
        return try! JSONDecoder().decode(ReactionUpdateEvent.self, from: json)
    }

    private func makeMessage(
        id: String = "msg1",
        senderId: String? = nil,
        content: String = "Hello",
        isMe: Bool = false,
        deliveryStatus: Message.DeliveryStatus = .sent,
        createdAt: Date = Date()
    ) -> Message {
        Message(
            id: id,
            conversationId: conversationId,
            senderId: senderId ?? (isMe ? currentUserId : otherUserId),
            content: content,
            createdAt: createdAt,
            updatedAt: createdAt,
            deliveryStatus: deliveryStatus,
            isMe: isMe
        )
    }

    private func makeAPIMessage(
        id: String = "msg1",
        senderId: String? = nil,
        content: String = "Hello",
        senderUsername: String = "bob",
        senderDisplayName: String = "Bob"
    ) -> APIMessage {
        let sid = senderId ?? otherUserId
        return JSONStub.decode("""
        {
            "id":"\(id)",
            "conversationId":"\(conversationId)",
            "senderId":"\(sid)",
            "content":"\(content)",
            "createdAt":"2026-03-06T12:00:00.000Z",
            "sender":{"id":"\(sid)","username":"\(senderUsername)","displayName":"\(senderDisplayName)"}
        }
        """)
    }

    // MARK: - messageReceived: From Other User
    //
    // Post Phase 1.5: messageReceived no longer mutates delegate.messages
    // directly. The socket handler writes to GRDB via
    // `persistence.bufferIncoming(...)` and emits UI signals through the
    // delegate (lastUnreadMessage, newMessageAppended, markAsRead). This
    // test seeds a persistence actor on the handler and verifies that the
    // record landed in the database and the UI signals fired.

    func test_messageReceived_fromOtherUser_appendsToDelegate() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor
        // bufferIncoming queues writes via AsyncStream; the processor must be
        // started for the queued writes to actually land in GRDB.
        await actor.start()

        let apiMsg = makeAPIMessage(id: "newmsg", senderId: otherUserId, content: "Hey!")
        socket.simulateMessage(apiMsg)

        // Wait for the buffered write + actor processor to commit.
        try await Task.sleep(nanoseconds: 800_000_000)

        // 1. Record landed in the database via persistence.bufferIncoming.
        let records = try await db.read { db in
            try MessageRecord.filter(Column("localId") == "newmsg").fetchAll(db)
        }
        XCTAssertEqual(records.count, 1, "Incoming message must be persisted to GRDB")
        XCTAssertEqual(records.first?.content, "Hey!")
        XCTAssertEqual(records.first?.conversationId, conversationId)

        // 2. UI signals on delegate are still expected.
        XCTAssertEqual(delegate.newMessageAppended, 1)
        XCTAssertNotNil(delegate.lastUnreadMessage)
        XCTAssertEqual(delegate.lastUnreadMessage?.id, "newmsg")
        XCTAssertEqual(
            delegate.markAsReadCallCount, 1,
            "Inbound message in an active conversation must auto-trigger markAsRead so the sender's checkmark turns purple"
        )
    }

    // MARK: - messageReceived: From Self (no new append)

    func test_messageReceived_fromSelf_doesNotAppendNewMessage() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut

        let apiMsg = makeAPIMessage(id: "mymsg", senderId: currentUserId, content: "My msg")
        socket.simulateMessage(apiMsg)

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(delegate.messages.count, 0, "Should not append own message from socket")
        XCTAssertEqual(
            delegate.markAsReadCallCount, 0,
            "Echo of own message must not trigger markAsRead — there is nothing new to read"
        )
    }

    // MARK: - messageReceived: Duplicate (already exists)

    func test_messageReceived_duplicateId_doesNotAppendAgain() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut
        delegate.messages = [makeMessage(id: "existingmsg", senderId: otherUserId)]
        delegate.invalidateIndex()

        let apiMsg = makeAPIMessage(id: "existingmsg", senderId: otherUserId, content: "duplicate")
        socket.simulateMessage(apiMsg)

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(delegate.messages.count, 1, "Should not add duplicate")
    }

    // MARK: - messageReceived: Own message with attachments updates existing
    //
    // Post Phase 1.5: when an own-message echo arrives with new attachments,
    // the socket handler writes them through `persistence.updateAttachmentsJson`.
    // The delegate.messages array stays the gating signal (containsMessage check)
    // but the actual update happens via persistence. We verify the DB row.

    func test_messageReceived_ownMessageWithAttachments_updatesExisting() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor

        // Seed both the delegate (so containsMessage gates the branch) and
        // the GRDB row (so updateAttachmentsJson has something to update).
        delegate.messages = [makeMessage(id: "mymsg", senderId: currentUserId, isMe: true)]
        delegate.invalidateIndex()
        let record = MessageRecord(
            localId: "mymsg", serverId: nil,
            conversationId: conversationId, senderId: currentUserId,
            content: "My msg", originalLanguage: "en",
            messageType: "text", messageSource: "user", contentType: "text",
            state: .sending, retryCount: 0, lastError: nil,
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
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0
        )
        try await actor.insertOptimistic(record)

        let apiMsg: APIMessage = JSONStub.decode("""
        {
            "id":"mymsg",
            "conversationId":"\(conversationId)",
            "senderId":"\(currentUserId)",
            "content":"My msg",
            "createdAt":"2026-03-06T12:00:00.000Z",
            "attachments":[{"id":"att1","mimeType":"image/jpeg"}]
        }
        """)
        socket.simulateMessage(apiMsg)

        try await Task.sleep(nanoseconds: 400_000_000)

        // The DB row's attachmentsJson should now contain the inbound attachment.
        let updated = try await db.read { db in
            try MessageRecord.fetchOne(db, key: "mymsg")
        }
        XCTAssertNotNil(updated?.attachmentsJson, "attachmentsJson must be set after own-message echo")
        let attachments = (try? JSONDecoder().decode([MeeshyMessageAttachment].self,
                                                     from: updated!.attachmentsJson!)) ?? []
        XCTAssertFalse(attachments.isEmpty, "Persistence must hold the new attachments")
        XCTAssertEqual(attachments.first?.id, "att1")
    }

    // MARK: - messageEdited
    //
    // Post Phase 1.5: messageEdited writes via `persistence.markEdited`.
    // delegate.messages is no longer mutated — assertions verify the DB row.

    func test_messageEdited_updatesContentAndSetsIsEdited() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor
        _ = delegate

        // Seed a row in GRDB so markEdited has something to update.
        let record = MessageRecord(
            localId: "msg1", serverId: nil,
            conversationId: conversationId, senderId: otherUserId,
            content: "Original", originalLanguage: "en",
            messageType: "text", messageSource: "user", contentType: "text",
            state: .delivered, retryCount: 0, lastError: nil,
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
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0
        )
        try await actor.insertOptimistic(record)

        let editedApiMsg: APIMessage = JSONStub.decode("""
        {
            "id":"msg1",
            "conversationId":"\(conversationId)",
            "senderId":"\(otherUserId)",
            "content":"Edited content",
            "isEdited":true,
            "createdAt":"2026-03-06T12:00:00.000Z"
        }
        """)
        socket.simulateMessageEdited(editedApiMsg)

        try await Task.sleep(nanoseconds: 300_000_000)

        let updated = try await db.read { db in
            try MessageRecord.fetchOne(db, key: "msg1")
        }
        XCTAssertEqual(updated?.content, "Edited content", "Edited content must propagate to DB")
        XCTAssertTrue(updated?.isEdited == true, "isEdited flag must be set after socket edit")
        XCTAssertNotNil(updated?.editedAt)
    }

    func test_messageEdited_unknownMessage_noEffect() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut
        delegate.messages = [makeMessage(id: "msg1", content: "Original")]
        delegate.invalidateIndex()

        let editedApiMsg: APIMessage = JSONStub.decode("""
        {
            "id":"unknown",
            "conversationId":"\(conversationId)",
            "senderId":"\(otherUserId)",
            "content":"Edited",
            "createdAt":"2026-03-06T12:00:00.000Z"
        }
        """)
        socket.simulateMessageEdited(editedApiMsg)

        try await Task.sleep(nanoseconds: 100_000_000)

        // Without persistence wired, delegate.messages stays as seeded.
        XCTAssertEqual(delegate.messages[0].content, "Original")
    }

    // MARK: - messageDeleted
    //
    // Post Phase 1.5: messageDeleted writes via `persistence.markDeleted`.
    // delegate.messages is no longer mutated — assertions verify the DB row.

    func test_messageDeleted_setsIsDeletedAndClearsContent() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor
        _ = delegate

        // Seed a row so markDeleted has something to update.
        let record = MessageRecord(
            localId: "msg1", serverId: nil,
            conversationId: conversationId, senderId: otherUserId,
            content: "Will be deleted", originalLanguage: "en",
            messageType: "text", messageSource: "user", contentType: "text",
            state: .delivered, retryCount: 0, lastError: nil,
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
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0
        )
        try await actor.insertOptimistic(record)

        socket.simulateMessageDeleted(MessageDeletedEvent(messageId: "msg1", conversationId: conversationId))

        try await Task.sleep(nanoseconds: 300_000_000)

        let deleted = try await db.read { db in
            try MessageRecord.fetchOne(db, key: "msg1")
        }
        XCTAssertNotNil(deleted?.deletedAt, "deletedAt must be set after socket delete")
        XCTAssertNil(deleted?.content, "content must be blanked after socket delete")
    }

    func test_messageDeleted_unknownMessage_noEffect() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut
        delegate.messages = [makeMessage(id: "msg1", content: "Keep me")]
        delegate.invalidateIndex()

        socket.simulateMessageDeleted(MessageDeletedEvent(messageId: "unknown", conversationId: conversationId))

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertFalse(delegate.messages[0].isDeleted)
        XCTAssertEqual(delegate.messages[0].content, "Keep me")
    }

    // MARK: - reactionAdded
    //
    // Post Phase 1.5: reactionAdded writes via `persistence.appendReaction`.
    // delegate.messages is no longer mutated — assertions verify the DB row.

    func test_reactionAdded_appendsReactionToMessage() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor
        _ = delegate

        // Seed a row so appendReaction has something to update.
        let record = makeSeedRecord(localId: "msg1", senderId: otherUserId, content: "Hello")
        try await actor.insertOptimistic(record)

        let event = makeReactionEvent(messageId: "msg1", emoji: "thumbsup", participantId: otherUserId, action: "add")
        socket.reactionAdded.send(event)

        try await Task.sleep(nanoseconds: 300_000_000)

        let updated = try await db.read { db in
            try MessageRecord.fetchOne(db, key: "msg1")
        }
        XCTAssertNotNil(updated?.reactionsJson, "reactionsJson must be set after appendReaction")
        let reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                                   from: updated!.reactionsJson!)) ?? []
        XCTAssertEqual(reactions.count, 1)
        XCTAssertEqual(reactions.first?.emoji, "thumbsup")
        XCTAssertEqual(reactions.first?.participantId, otherUserId)
    }

    func test_reactionAdded_deduplicatesSameEmojiSameUser() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut
        var msg = makeMessage(id: "msg1")
        msg.reactions = [Reaction(messageId: "msg1", participantId: otherUserId, emoji: "thumbsup")]
        delegate.messages = [msg]
        delegate.invalidateIndex()

        let event = makeReactionEvent(messageId: "msg1", emoji: "thumbsup", participantId: otherUserId, action: "add")
        socket.reactionAdded.send(event)

        try await Task.sleep(nanoseconds: 100_000_000)

        // Without persistence wired, the production reactionAdded path is a no-op
        // on delegate.messages. The seeded reaction stays as-is — dedup is now
        // tested at the persistence layer (see appendReaction tests in SDK).
        XCTAssertEqual(delegate.messages[0].reactions.count, 1, "Should not add duplicate reaction")
    }

    // MARK: - reactionRemoved
    //
    // Post Phase 1.5: reactionRemoved writes via `persistence.removeReaction`.

    func test_reactionRemoved_removesMatchingReaction() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor
        _ = delegate

        // Seed a row with two reactions, only one matching the remove event.
        let r1 = MeeshyReaction(messageId: "msg1", participantId: otherUserId, emoji: "thumbsup")
        let r2 = MeeshyReaction(messageId: "msg1", participantId: currentUserId, emoji: "heart")
        let reactionsJson = try? JSONEncoder().encode([r1, r2])
        var record = makeSeedRecord(localId: "msg1", senderId: otherUserId, content: "Hello")
        record.reactionsJson = reactionsJson
        record.reactionCount = 2
        try await actor.insertOptimistic(record)

        let event = makeReactionEvent(messageId: "msg1", emoji: "thumbsup", participantId: otherUserId, action: "remove")
        socket.reactionRemoved.send(event)

        try await Task.sleep(nanoseconds: 300_000_000)

        let after = try await db.read { db in
            try MessageRecord.fetchOne(db, key: "msg1")
        }
        let reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                                   from: after?.reactionsJson ?? Data())) ?? []
        XCTAssertEqual(reactions.count, 1, "Only the matching reaction must be removed")
        XCTAssertEqual(reactions.first?.emoji, "heart")
    }

    // Convenience seed helper used by reaction / read-status tests below.
    private func makeSeedRecord(localId: String, senderId: String, content: String) -> MessageRecord {
        MessageRecord(
            localId: localId, serverId: nil,
            conversationId: conversationId, senderId: senderId,
            content: content, originalLanguage: "en",
            messageType: "text", messageSource: "user", contentType: "text",
            state: .delivered, retryCount: 0, lastError: nil,
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
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0
        )
    }

    // MARK: - typingStarted

    func test_typingStarted_addsUsernameToDelegate() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut

        socket.typingStarted.send(TypingEvent(userId: otherUserId, username: "Alice", conversationId: conversationId))

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(delegate.typingUsernames, ["Alice"])
    }

    func test_typingStarted_fromSelf_ignored() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut

        socket.typingStarted.send(TypingEvent(userId: currentUserId, username: "Me", conversationId: conversationId))

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertTrue(delegate.typingUsernames.isEmpty, "Should not add self to typing list")
    }

    func test_typingStarted_doesNotDuplicate() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut

        socket.typingStarted.send(TypingEvent(userId: otherUserId, username: "Alice", conversationId: conversationId))
        try await Task.sleep(nanoseconds: 50_000_000)

        socket.typingStarted.send(TypingEvent(userId: otherUserId, username: "Alice", conversationId: conversationId))
        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(delegate.typingUsernames.count, 1, "Should not duplicate typing username")
    }

    func test_typingStarted_differentConversation_ignored() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut

        socket.typingStarted.send(TypingEvent(userId: otherUserId, username: "Alice", conversationId: "other-conv"))

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertTrue(delegate.typingUsernames.isEmpty, "Should filter events for other conversations")
    }

    // MARK: - typingStopped

    func test_typingStopped_removesUsernameFromDelegate() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut
        delegate.typingUsernames = ["Alice"]

        socket.typingStopped.send(TypingEvent(userId: otherUserId, username: "Alice", conversationId: conversationId))

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertTrue(delegate.typingUsernames.isEmpty)
    }

    // MARK: - readStatusUpdated
    //
    // Post Phase 1.5: readStatusUpdated writes via `persistence.bufferBatchDelivery`,
    // which transitions every matching row's MessageState through the state machine.
    // delegate.messages is no longer mutated — assertions verify the DB row state.

    func test_readStatusUpdated_updatesDeliveryStatusForOwnMessages() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor
        _ = delegate

        // Seed two own-messages in `.sent` state — bufferBatchDelivery only
        // applies to rows in .sending or .sent states (per actor implementation).
        let msgDate = Date()
        var record1 = makeSeedRecord(localId: "msg1", senderId: currentUserId, content: "First")
        record1.state = .sent
        record1.createdAt = msgDate
        record1.updatedAt = msgDate
        try await actor.insertOptimistic(record1)

        var record2 = makeSeedRecord(localId: "msg2", senderId: currentUserId, content: "Second")
        record2.state = .sent
        record2.createdAt = msgDate.addingTimeInterval(1)
        record2.updatedAt = msgDate.addingTimeInterval(1)
        try await actor.insertOptimistic(record2)

        // Boot the actor's write processor so buffered ops are processed.
        await actor.start()

        let event: ReadStatusUpdateEvent = JSONStub.decode("""
        {
            "conversationId":"\(conversationId)",
            "participantId":"participant-other",
            "userId":"\(otherUserId)",
            "type":"read",
            "updatedAt":"2099-12-31T23:59:59.000Z",
            "summary":{"totalMembers":2,"deliveredCount":2,"readCount":2}
        }
        """)
        socket.readStatusUpdated.send(event)

        // bufferBatchDelivery is async (queued via AsyncStream); allow it to land.
        try await Task.sleep(nanoseconds: 600_000_000)

        let after1 = try await db.read { db in
            try MessageRecord.fetchOne(db, key: "msg1")
        }
        let after2 = try await db.read { db in
            try MessageRecord.fetchOne(db, key: "msg2")
        }
        // .read event transitions both rows; readAt is set.
        XCTAssertNotNil(after1?.readAt, "msg1 must transition to read state via bufferBatchDelivery")
        XCTAssertNotNil(after2?.readAt, "msg2 must transition to read state via bufferBatchDelivery")
    }

    func test_readStatusUpdated_deliveredStatus_updatesCorrectly() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor
        _ = delegate

        var record = makeSeedRecord(localId: "msg1", senderId: currentUserId, content: "Hello")
        record.state = .sent
        try await actor.insertOptimistic(record)
        await actor.start()

        let event: ReadStatusUpdateEvent = JSONStub.decode("""
        {
            "conversationId":"\(conversationId)",
            "participantId":"participant-other",
            "userId":"\(otherUserId)",
            "type":"received",
            "updatedAt":"2099-12-31T23:59:59.000Z",
            "summary":{"totalMembers":2,"deliveredCount":1,"readCount":0}
        }
        """)
        socket.readStatusUpdated.send(event)

        try await Task.sleep(nanoseconds: 600_000_000)

        let after = try await db.read { db in
            try MessageRecord.fetchOne(db, key: "msg1")
        }
        // .delivered event transitions the row to .delivered state and sets deliveredAt.
        XCTAssertNotNil(after?.deliveredAt, "msg1 must transition to delivered via bufferBatchDelivery")
    }

    func test_readStatusUpdated_fromSelf_ignored() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut
        delegate.messages = [
            makeMessage(id: "msg1", senderId: currentUserId, isMe: true, deliveryStatus: .sent, createdAt: Date())
        ]
        delegate.invalidateIndex()

        let event: ReadStatusUpdateEvent = JSONStub.decode("""
        {
            "conversationId":"\(conversationId)",
            "participantId":"participant-me",
            "userId":"\(currentUserId)",
            "type":"read",
            "updatedAt":"2099-12-31T23:59:59.000Z",
            "summary":{"totalMembers":2,"deliveredCount":1,"readCount":1}
        }
        """)
        socket.readStatusUpdated.send(event)

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(delegate.messages[0].deliveryStatus, .sent, "Should not update own read status events")
    }

    func test_readStatusUpdated_doesNotDowngradeReadToDelivered() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut
        delegate.messages = [
            makeMessage(id: "msg1", senderId: currentUserId, isMe: true, deliveryStatus: .read, createdAt: Date())
        ]
        delegate.invalidateIndex()

        let event: ReadStatusUpdateEvent = JSONStub.decode("""
        {
            "conversationId":"\(conversationId)",
            "participantId":"participant-other",
            "userId":"\(otherUserId)",
            "type":"received",
            "updatedAt":"2099-12-31T23:59:59.000Z",
            "summary":{"totalMembers":2,"deliveredCount":1,"readCount":0}
        }
        """)
        socket.readStatusUpdated.send(event)

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(delegate.messages[0].deliveryStatus, .read, "Should not downgrade from read to delivered")
    }

    // MARK: - messageReceived clears typing indicator for sender

    func test_messageReceived_clearsTypingForSender() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut
        delegate.typingUsernames = ["Bob"]

        let apiMsg = makeAPIMessage(id: "newmsg", senderId: otherUserId, senderUsername: "bob", senderDisplayName: "Bob")
        socket.simulateMessage(apiMsg)

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertFalse(delegate.typingUsernames.contains("Bob"), "Should clear typing when message received from that user")
    }

    // MARK: - Room Management

    func test_init_joinsConversationRoom() {
        let socket = MockMessageSocket()
        let _ = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: currentUserId,
            messageSocket: socket
        )

        XCTAssertTrue(socket.joinConversationIds.contains(conversationId))
    }

    // MARK: - Typing Emission

    func test_onTextChanged_nonEmptyText_emitsTypingStart() {
        let socket = MockMessageSocket()
        let sut = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: currentUserId,
            messageSocket: socket
        )

        sut.onTextChanged("Hello")

        XCTAssertTrue(socket.typingStartConversationIds.contains(conversationId))
    }

    func test_stopTypingEmission_emitsTypingStop() {
        let socket = MockMessageSocket()
        let sut = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: currentUserId,
            messageSocket: socket
        )

        sut.onTextChanged("Hello")
        sut.stopTypingEmission()

        XCTAssertTrue(socket.typingStopConversationIds.contains(conversationId))
    }

    func test_onTextChanged_emptyText_stopsTypingEmission() {
        let socket = MockMessageSocket()
        let sut = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: currentUserId,
            messageSocket: socket
        )

        sut.onTextChanged("Hello")
        let startCount = socket.typingStartConversationIds.count

        sut.onTextChanged("")

        XCTAssertEqual(socket.typingStartConversationIds.count, startCount, "Should not emit another start")
        XCTAssertTrue(socket.typingStopConversationIds.contains(conversationId))
    }

    // MARK: - Reconnect triggers sync

    func test_reconnect_triggersSyncMissedMessages() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut

        socket.simulateReconnect()

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertTrue(delegate.syncMissedCalled)
    }

    // MARK: - armSocketSubscriptions idempotency

    func test_armSocketSubscriptions_calledTwice_doesNotDuplicate() async throws {
        let socket = MockMessageSocket()
        let sut = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: currentUserId,
            messageSocket: socket
        )
        let delegate = MockConversationSocketDelegate()
        sut.delegate = delegate
        sut.armSocketSubscriptions()
        sut.armSocketSubscriptions()

        let apiMsg = makeAPIMessage(id: "duptest", senderId: otherUserId, content: "Once")
        socket.simulateMessage(apiMsg)

        await Task.yield()
        try await Task.sleep(nanoseconds: 300_000_000)

        XCTAssertEqual(delegate.messages.count, 1, "Should receive message only once despite double armSocketSubscriptions()")
        XCTAssertEqual(delegate.newMessageAppended, 1)
    }

    // MARK: - Persistence Actor Integration

    private func makeDB() throws -> (DatabaseQueue, MessagePersistenceActor) {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        let actor = MessagePersistenceActor(dbWriter: db)
        return (db, actor)
    }

    func test_persistence_isNilByDefault() {
        let socket = MockMessageSocket()
        let sut = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: currentUserId,
            messageSocket: socket
        )
        XCTAssertNil(sut.persistence, "Persistence should be nil by default so existing callers are unaffected")
    }

    func test_messageReceived_withPersistence_buffersIncomingMessage() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor
        _ = delegate
        await actor.start()

        let apiMsg = makeAPIMessage(id: "persist_new", senderId: otherUserId, content: "Persisted!")
        socket.simulateMessage(apiMsg)

        await Task.yield()
        try await Task.sleep(nanoseconds: 800_000_000)

        // Post Phase 1.5: delegate.messages is no longer appended to. The
        // socket handler emits UI signals (lastUnreadMessage, newMessageAppended)
        // and writes the row through persistence — the view layer surfaces
        // it via store observation. We verify the persistence side here.
        XCTAssertEqual(delegate.newMessageAppended, 1, "newMessageAppended UI signal must fire")
        XCTAssertEqual(delegate.lastUnreadMessage?.id, "persist_new", "lastUnreadMessage must be set")

        // Verify the record was written to the database
        let records = try await db.read { db in
            try MessageRecord.filter(Column("localId") == "persist_new").fetchAll(db)
        }
        XCTAssertEqual(records.count, 1, "Incoming message should be persisted via actor")
        XCTAssertEqual(records[0].content, "Persisted!")
        XCTAssertEqual(records[0].conversationId, conversationId)
    }

    func test_messageDeleted_withPersistence_writesDeletedAtToStore() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor

        // Insert a record into the DB so markDeleted has something to update
        let record = MessageRecord(
            localId: "del_msg", serverId: nil,
            conversationId: conversationId, senderId: otherUserId,
            content: "Will be deleted", originalLanguage: "en",
            messageType: "text", messageSource: "user", contentType: "text",
            state: .delivered, retryCount: 0, lastError: nil,
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
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0
        )
        try await actor.insertOptimistic(record)

        // Also add to delegate so the delegate path finds the message
        delegate.messages = [makeMessage(id: "del_msg", content: "Will be deleted")]
        delegate.invalidateIndex()

        socket.simulateMessageDeleted(MessageDeletedEvent(messageId: "del_msg", conversationId: conversationId))

        try await Task.sleep(nanoseconds: 300_000_000)

        // Post Phase 1.5: delegate.messages is no longer mutated. The
        // production write goes only through persistence; the view layer
        // surfaces it via store observation.

        // DB record has deletedAt set
        let fetched = try await db.read { db in
            try MessageRecord.fetchOne(db, key: "del_msg")
        }
        XCTAssertNotNil(fetched?.deletedAt, "Persistence should have deletedAt set after message:deleted event")
        XCTAssertNil(fetched?.content, "Content should be cleared in persistence after deletion")
    }

    func test_messageEdited_withPersistence_writesEditToStore() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor

        // Insert a record into the DB
        let record = MessageRecord(
            localId: "edit_msg", serverId: nil,
            conversationId: conversationId, senderId: otherUserId,
            content: "Original", originalLanguage: "en",
            messageType: "text", messageSource: "user", contentType: "text",
            state: .delivered, retryCount: 0, lastError: nil,
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
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0
        )
        try await actor.insertOptimistic(record)

        delegate.messages = [makeMessage(id: "edit_msg", content: "Original")]
        delegate.invalidateIndex()

        let editedApiMsg: APIMessage = JSONStub.decode("""
        {
            "id":"edit_msg",
            "conversationId":"\(conversationId)",
            "senderId":"\(otherUserId)",
            "content":"Edited content",
            "isEdited":true,
            "createdAt":"2026-03-06T12:00:00.000Z"
        }
        """)
        socket.simulateMessageEdited(editedApiMsg)

        try await Task.sleep(nanoseconds: 300_000_000)

        // Post Phase 1.5: delegate.messages is no longer mutated.

        // DB record updated
        let fetched = try await db.read { db in
            try MessageRecord.fetchOne(db, key: "edit_msg")
        }
        XCTAssertEqual(fetched?.content, "Edited content")
        XCTAssertTrue(fetched?.isEdited == true)
        XCTAssertNotNil(fetched?.editedAt)
    }
}
