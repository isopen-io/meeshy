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

    var applyAttachmentUpdateEvents: [AttachmentUpdatedEvent] = []
    func applyAttachmentUpdate(_ event: AttachmentUpdatedEvent) {
        applyAttachmentUpdateEvents.append(event)
    }

    var applyAttachmentReactionDeltas: [(attachmentId: String, reactionSummary: [String: Int])] = []
    func applyAttachmentReactionDelta(attachmentId: String, reactionSummary: [String: Int]) {
        applyAttachmentReactionDeltas.append((attachmentId, reactionSummary))
    }
}

// MARK: - Tests

@MainActor
final class ConversationSocketHandlerTests: XCTestCase {

    private let conversationId = "000000000000000000000099"
    private let currentUserId = "000000000000000000000001"
    private let otherUserId = "000000000000000000000002"

    // MARK: - Factory

    private func makeSUT(
        messageSocket: MockMessageSocket = MockMessageSocket(),
        isApplicationActive: Bool = true
    ) -> (
        sut: ConversationSocketHandler,
        delegate: MockConversationSocketDelegate,
        socket: MockMessageSocket
    ) {
        // The XCTest host never reaches `.active`, so the production foreground
        // probe would block the read-receipt gate. Inject a known value; tests
        // exercising the gate flip it explicitly.
        let sut = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: currentUserId,
            messageSocket: messageSocket,
            isApplicationActive: { isApplicationActive }
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
    // Post Sprint 2: messageReceived no longer mutates delegate.messages
    // directly. The socket handler persists the full APIMessage to GRDB via
    // `persistence.bufferIncomingAPIMessages(...)` and emits UI signals
    // through the delegate (lastUnreadMessage, markAsRead). This test seeds a
    // persistence actor on the handler and verifies that the record landed in
    // the database and the UI signals fired.

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
        XCTAssertNotNil(delegate.lastUnreadMessage)
        XCTAssertEqual(delegate.lastUnreadMessage?.id, "newmsg")
        XCTAssertEqual(
            delegate.markAsReadCallCount, 1,
            "Inbound message in an active conversation must auto-trigger markAsRead so the sender's checkmark turns purple"
        )
    }

    // MARK: - messageReceived: Read-receipt PRECISION gate
    //
    // Being subscribed to the socket is not proof the user is reading. A read
    // receipt may only be emitted when the app is foregrounded AND the viewport
    // is at the bottom (the new message is visible). Otherwise the receipt would
    // be FALSE — the sender's check would turn indigo "read" although nobody read
    // anything. The positive control (active + at-bottom ⇒ markAsRead fires) is
    // `test_messageReceived_fromOtherUser_appendsToDelegate` above.

    func test_messageReceived_backgrounded_doesNotMarkAsRead() async throws {
        let (sut, delegate, socket) = makeSUT(isApplicationActive: false)
        _ = sut

        let apiMsg = makeAPIMessage(id: "bg_msg", senderId: otherUserId, content: "Ping")
        socket.simulateMessage(apiMsg)

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(
            delegate.markAsReadCallCount, 0,
            "A message arriving while the app is backgrounded must NOT emit a read receipt"
        )
        XCTAssertEqual(
            delegate.lastUnreadMessage?.id, "bg_msg",
            "The unread anchor is still set — only the receipt is gated, not the UI signal"
        )
    }

    func test_messageReceived_scrolledAway_doesNotMarkAsRead() async throws {
        let (sut, delegate, socket) = makeSUT(isApplicationActive: true)
        _ = sut
        // User is reading history near the top — the new message lands
        // off-screen at the bottom.
        delegate.isViewportAtBottom = false

        let apiMsg = makeAPIMessage(id: "up_msg", senderId: otherUserId, content: "Ping")
        socket.simulateMessage(apiMsg)

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(
            delegate.markAsReadCallCount, 0,
            "A message landing off-screen while scrolled up must NOT emit a read receipt"
        )
        XCTAssertEqual(delegate.lastUnreadMessage?.id, "up_msg")
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

    func test_typingStarted_addsDisplayName_notHandle() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut

        socket.typingStarted.send(TypingEvent(userId: otherUserId, username: "alice_handle", displayName: "Alice Martin", conversationId: conversationId))

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(delegate.typingUsernames, ["Alice Martin"])
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
        // .read event (all recipients) transitions both rows; readAt + the
        // unambiguous "read by all" marker the display resolver trusts are set.
        XCTAssertNotNil(after1?.readAt, "msg1 must transition to read state via bufferBatchDelivery")
        XCTAssertNotNil(after2?.readAt, "msg2 must transition to read state via bufferBatchDelivery")
        XCTAssertNotNil(after1?.readByAllAt, "msg1 must be stamped read-by-all for the resolver")
        XCTAssertNotNil(after2?.readByAllAt, "msg2 must be stamped read-by-all for the resolver")
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

        // ALL recipients received (2/2) → delivered-to-all fires.
        let event: ReadStatusUpdateEvent = JSONStub.decode("""
        {
            "conversationId":"\(conversationId)",
            "participantId":"participant-other",
            "userId":"\(otherUserId)",
            "type":"received",
            "updatedAt":"2099-12-31T23:59:59.000Z",
            "summary":{"totalMembers":2,"deliveredCount":2,"readCount":0}
        }
        """)
        socket.readStatusUpdated.send(event)

        try await Task.sleep(nanoseconds: 600_000_000)

        let after = try await db.read { db in
            try MessageRecord.fetchOne(db, key: "msg1")
        }
        // .delivered event (all recipients) transitions the row to .delivered
        // state, sets deliveredAt + the "delivered to all" marker.
        XCTAssertNotNil(after?.deliveredAt, "msg1 must transition to delivered via bufferBatchDelivery")
        XCTAssertNotNil(after?.deliveredToAllAt, "msg1 must be stamped delivered-to-all for the resolver")
    }

    /// WhatsApp-style all-or-nothing: a PARTIAL group delivery (1 of 2 members)
    /// must NOT advance the sender's checkmark — showing ✓✓ "delivered" while
    /// only one of several recipients has received would misrepresent reality.
    func test_readStatusUpdated_partialGroupDelivery_doesNotTransition() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor
        _ = delegate

        var record = makeSeedRecord(localId: "msg1", senderId: currentUserId, content: "Hello")
        record.state = .sent
        try await actor.insertOptimistic(record)
        await actor.start()

        // Only 1 of 2 recipients received → not delivered-to-all.
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
        XCTAssertNil(after?.deliveredAt,
            "a partial group delivery (1/2) must NOT mark the message delivered-to-all")
        XCTAssertEqual(after?.state, .sent,
            "the row must stay at .sent until EVERY recipient has received it")
    }

    /// Soundness (never over-claim): a message I sent AFTER the peer's read
    /// moment must NOT be marked read by a batch read event, even when the
    /// summary says read-by-all (that "all" refers to the older latest message).
    /// Mirrors the cache-path frontier guard.
    func test_readStatusUpdated_messageAfterFrontier_staysUnread() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor
        _ = delegate

        // Message created NOW (2026), well after the event's read frontier (2020).
        var record = makeSeedRecord(localId: "msg1", senderId: currentUserId, content: "after")
        record.state = .sent
        record.createdAt = Date()
        try await actor.insertOptimistic(record)
        await actor.start()

        let event: ReadStatusUpdateEvent = JSONStub.decode("""
        {
            "conversationId":"\(conversationId)",
            "participantId":"participant-other",
            "userId":"\(otherUserId)",
            "type":"read",
            "updatedAt":"2020-01-01T00:00:00.000Z",
            "summary":{"totalMembers":2,"deliveredCount":2,"readCount":2}
        }
        """)
        socket.readStatusUpdated.send(event)

        try await Task.sleep(nanoseconds: 600_000_000)

        let after = try await db.read { db in
            try MessageRecord.fetchOne(db, key: "msg1")
        }
        XCTAssertNil(after?.readAt,
            "a message sent AFTER the read frontier must NOT be marked read")
        XCTAssertNil(after?.readByAllAt,
            "and must NOT be stamped read-by-all")
        XCTAssertEqual(after?.state, .sent)
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

    func test_activate_joinsConversationRoom() async throws {
        let socket = MockMessageSocket()
        let sut = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: currentUserId,
            messageSocket: socket
        )

        // L'activation est désormais explicite : seule la VM réellement
        // installée (ConversationViewModel.start(), déclenché par le `.task`
        // de la vue) appelle `activate()`. L'init seul ne joint jamais.
        XCTAssertFalse(socket.joinConversationIds.contains(conversationId))

        sut.activate()

        XCTAssertTrue(socket.joinConversationIds.contains(conversationId))
    }

    func test_activate_calledTwice_joinsOnlyOnce() async throws {
        let socket = MockMessageSocket()
        let sut = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: currentUserId,
            messageSocket: socket
        )

        sut.activate()
        sut.activate()

        XCTAssertEqual(
            socket.joinConversationIds.filter { $0 == conversationId }.count, 1,
            "activate() doit être idempotent — un seul conversation:join"
        )
    }

    /// SwiftUI's `@StateObject` alloue EAGER un `ConversationViewModel` jetable
    /// (donc un handler jetable) à chaque ré-évaluation d'un parent montant
    /// `ConversationView`, puis le jette. Un tel handler n'est jamais activé
    /// (seule la VM installée exécute `start()` → `activate()`) : il ne doit
    /// donc PAS émettre `conversation:join` — sinon le churn join/leave fait
    /// spiker le CPU et sature `/read` (429). Garde de non-régression de la
    /// boucle : l'ancienne activation différée depuis `init`
    /// (`DispatchQueue.main.async`) dépendait du timing de désallocation du
    /// jetable et laissait la boucle repartir sous pression de re-render.
    func test_init_discardedBeforeActivation_doesNotJoin() async throws {
        let socket = MockMessageSocket()
        do {
            _ = ConversationSocketHandler(
                conversationId: conversationId,
                currentUserId: currentUserId,
                messageSocket: socket
            )
        }
        // Même en laissant tourner le runloop, aucun join ne doit partir :
        // l'init ne programme plus aucun effet de bord différé.
        try await Task.sleep(nanoseconds: 150_000_000)

        XCTAssertFalse(
            socket.joinConversationIds.contains(conversationId),
            "Un handler jetable jamais activé ne doit pas rejoindre la room"
        )
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
            messageSocket: socket,
            isApplicationActive: { true }
        )
        let delegate = MockConversationSocketDelegate()
        sut.delegate = delegate
        sut.armSocketSubscriptions()
        sut.armSocketSubscriptions()

        // Let the runloop settle so the Combine pipeline delivery (receive(on:
        // DispatchQueue.main)) is fully wired before we emit.
        try await Task.sleep(nanoseconds: 100_000_000)

        let apiMsg = makeAPIMessage(id: "duptest", senderId: otherUserId, content: "Once")
        socket.simulateMessage(apiMsg)

        await Task.yield()
        try await Task.sleep(nanoseconds: 500_000_000)

        // Post Sprint 2: delegate.messages is no longer mutated. `markAsRead`
        // fires exactly once per inbound message — `armSocketSubscriptions`
        // early-returns on the second call so only one subscription is wired.
        XCTAssertEqual(delegate.markAsReadCallCount, 1, "Should receive message only once despite double armSocketSubscriptions()")
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

        // Post Sprint 2: delegate.messages is no longer appended to. The
        // socket handler emits UI signals (lastUnreadMessage, markAsRead) and
        // writes the full APIMessage through persistence — the view layer
        // surfaces it via store observation. We verify the persistence side.
        XCTAssertEqual(delegate.markAsReadCallCount, 1, "inbound message must auto-fire markAsRead")
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

    // MARK: - Sprint 2 — RC2.2: full APIMessage ingestion (no empty bubbles)

    /// A media message received via socket must persist its attachments —
    /// the legacy 6-field `IncomingMessageData` path dropped them and the
    /// bubble rendered empty.
    func test_messageNew_withMediaAttachment_persistsAttachmentsJson() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor
        _ = delegate
        await actor.start()

        let apiMsg: APIMessage = JSONStub.decode("""
        {
            "id":"img_msg",
            "conversationId":"\(conversationId)",
            "senderId":"\(otherUserId)",
            "createdAt":"2026-03-06T12:00:00.000Z",
            "messageType":"image",
            "attachments":[{
                "id":"att_img",
                "mimeType":"image/jpeg",
                "fileUrl":"https://cdn.example/p.jpg",
                "thumbHash":"1QcSHQRnh493V4dIh4eXh1h4kJUI",
                "width":800,"height":600
            }]
        }
        """)
        socket.simulateMessage(apiMsg)

        try await Task.sleep(nanoseconds: 800_000_000)

        let record = try await db.read { db in
            try MessageRecord.fetchOne(db, key: "img_msg")
        }
        let json = try XCTUnwrap(record?.attachmentsJson,
            "RC2.2: a media message received via socket must persist its attachments")
        let attachments = try JSONDecoder().decode([MeeshyMessageAttachment].self, from: json)
        XCTAssertEqual(attachments.first?.id, "att_img")
        XCTAssertEqual(attachments.first?.thumbHash, "1QcSHQRnh493V4dIh4eXh1h4kJUI",
            "ThumbHash must reach GRDB for the instant blur placeholder")
    }

    // MARK: - Sprint 2 — RC2.3: reconcile own echo by clientMessageId

    /// An own-message broadcast that races ahead of the REST POST response
    /// must reconcile the optimistic row by `clientMessageId` — NOT fall into
    /// the `senderId == userId` branch and get dropped (RC2.3b). The
    /// `pendingServerIds` map is empty here, exactly as it is before the
    /// REST ACK returns.
    func test_messageNew_ownEcho_reconcilesByClientMessageId_beforeRestResponse() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor

        let cid = "cid_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        let optimistic = MessageRecord(
            localId: cid, serverId: nil,
            conversationId: conversationId, senderId: currentUserId,
            content: "Race me", originalLanguage: "en",
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
        try await actor.insertOptimistic(optimistic)
        // The optimistic row is visible to the handler via the delegate index,
        // but pendingServerIds is still empty (REST POST not yet returned).
        delegate.messages = [makeMessage(id: cid, senderId: currentUserId,
                                         content: "Race me", isMe: true,
                                         deliveryStatus: .sending)]
        delegate.invalidateIndex()
        XCTAssertTrue(delegate.pendingServerIds.isEmpty)

        let echo: APIMessage = JSONStub.decode("""
        {
            "id":"srv_race_1",
            "clientMessageId":"\(cid)",
            "conversationId":"\(conversationId)",
            "senderId":"\(currentUserId)",
            "content":"Race me",
            "createdAt":"2026-03-06T12:00:00.000Z"
        }
        """)
        socket.simulateMessage(echo)

        try await Task.sleep(nanoseconds: 600_000_000)

        let conversationId = self.conversationId
        let rows = try await db.read { db in
            try MessageRecord
                .filter(Column("conversationId") == conversationId)
                .fetchAll(db)
        }
        XCTAssertEqual(rows.count, 1,
            "RC2.3b: an echo racing the REST ACK must reconcile in place — not duplicate or drop")
        XCTAssertEqual(rows.first?.localId, cid, "the optimistic row's localId is preserved")
        XCTAssertEqual(rows.first?.serverId, "srv_race_1",
            "applyEvent(.serverAck) must backfill the server id on the optimistic row")
    }

    /// An own-message echo from the REST broadcast path carries NO
    /// clientMessageId. It must NOT be persisted again — the optimistic GRDB
    /// row is reconciled by the REST ACK, and a blind upsert here would insert
    /// a duplicate row.
    func test_messageNew_ownEcho_withoutClientMessageId_doesNotDuplicate() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor
        _ = delegate
        // start() so a regression that DID buffer the echo would actually
        // commit a duplicate row — otherwise the test could pass falsely.
        await actor.start()

        let cid = "cid_cccccccccccccccccccccccccccccccc"
        let optimistic = MessageRecord(
            localId: cid, serverId: nil,
            conversationId: conversationId, senderId: currentUserId,
            content: "No cid echo", originalLanguage: "en",
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
        try await actor.insertOptimistic(optimistic)

        // Echo from _broadcastNewMessage — own message, server id, NO cid.
        let echo: APIMessage = JSONStub.decode("""
        {
            "id":"srv_nocid_1",
            "conversationId":"\(conversationId)",
            "senderId":"\(currentUserId)",
            "content":"No cid echo",
            "createdAt":"2026-03-06T12:00:00.000Z"
        }
        """)
        socket.simulateMessage(echo)

        try await Task.sleep(nanoseconds: 600_000_000)

        let conversationId = self.conversationId
        let rows = try await db.read { db in
            try MessageRecord
                .filter(Column("conversationId") == conversationId)
                .fetchAll(db)
        }
        XCTAssertEqual(rows.count, 1,
            "an own echo without clientMessageId must not insert a duplicate row")
        XCTAssertEqual(rows.first?.localId, cid, "only the optimistic row remains")
    }

    /// An own E2EE message: the optimistic row holds the plaintext we typed.
    /// The encrypted `message:new` echo carries only ciphertext we cannot
    /// decrypt (no E2EE session with ourselves) — branch A must keep the
    /// optimistic plaintext rather than clobber the bubble with base64.
    func test_messageNew_ownEncryptedEcho_keepsOptimisticPlaintext() async throws {
        let (db, actor) = try makeDB()
        let (sut, delegate, socket) = makeSUT()
        sut.persistence = actor

        let cid = "cid_e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2"
        let optimistic = MessageRecord(
            localId: cid, serverId: nil,
            conversationId: conversationId, senderId: currentUserId,
            content: "message en clair", originalLanguage: "fr",
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
        try await actor.insertOptimistic(optimistic)
        delegate.messages = [makeMessage(id: cid, senderId: currentUserId,
                                         content: "message en clair", isMe: true,
                                         deliveryStatus: .sending)]
        delegate.invalidateIndex()

        let echo: APIMessage = JSONStub.decode("""
        {
            "id":"srv_enc_echo_1",
            "clientMessageId":"\(cid)",
            "conversationId":"\(conversationId)",
            "senderId":"\(currentUserId)",
            "content":"Y2lwaGVydGV4dA==",
            "isEncrypted":true,
            "createdAt":"2026-03-06T12:00:00.000Z"
        }
        """)
        socket.simulateMessage(echo)

        try await Task.sleep(nanoseconds: 600_000_000)

        let row = try await db.read { db in
            try MessageRecord.fetchOne(db, key: cid)
        }
        XCTAssertEqual(row?.content, "message en clair",
            "an own E2EE message's optimistic plaintext must survive the encrypted server echo")
    }

    // MARK: - Audio translation per-attachment (multi-audio Prisme realtime fix)

    // `AudioTranslationEvent` / `TranslatedAudioInfo` are `public` SDK structs
    // with no public memberwise init, so the app test target can only build
    // them by decoding the wire JSON (camelCase CodingKeys match the props).
    private func makeAudioTranslationEvent(
        messageId: String,
        attachmentId: String,
        targetLanguage: String,
        url: String
    ) -> AudioTranslationEvent {
        JSONStub.decode("""
        {
            "messageId": "\(messageId)",
            "attachmentId": "\(attachmentId)",
            "conversationId": "\(conversationId)",
            "language": "\(targetLanguage)",
            "translatedAudio": {
                "id": "\(attachmentId)_\(targetLanguage)",
                "targetLanguage": "\(targetLanguage)",
                "url": "\(url)",
                "transcription": "t",
                "durationMs": 1000,
                "format": "mp3",
                "cloned": false,
                "quality": 0.9,
                "ttsModel": "xtts"
            }
        }
        """)
    }

    func test_audioTranslationReady_multiAttachment_keepsEachTrackInPerAttachmentDict() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut

        try await Task.sleep(nanoseconds: 100_000_000)

        // Two attachments on the SAME message, each translated to "en".
        socket.audioTranslationReady.send(
            makeAudioTranslationEvent(messageId: "m1", attachmentId: "attA", targetLanguage: "en", url: "https://x/A_en.mp3")
        )
        socket.audioTranslationReady.send(
            makeAudioTranslationEvent(messageId: "m1", attachmentId: "attB", targetLanguage: "en", url: "https://x/B_en.mp3")
        )

        try await Task.sleep(nanoseconds: 300_000_000)

        // Per-attachment dict keeps BOTH tracks' audios (the carousel reads this).
        XCTAssertEqual(delegate.messageTranslatedAudiosByAttachment["attA"]?.first?.url, "https://x/A_en.mp3")
        XCTAssertEqual(delegate.messageTranslatedAudiosByAttachment["attB"]?.first?.url, "https://x/B_en.mp3")
    }

    func test_audioTranslationReady_perAttachment_dedupsBySameLanguage() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut

        try await Task.sleep(nanoseconds: 100_000_000)

        socket.audioTranslationReady.send(
            makeAudioTranslationEvent(messageId: "m1", attachmentId: "attA", targetLanguage: "en", url: "https://x/old.mp3")
        )
        socket.audioTranslationReady.send(
            makeAudioTranslationEvent(messageId: "m1", attachmentId: "attA", targetLanguage: "en", url: "https://x/new.mp3")
        )

        try await Task.sleep(nanoseconds: 300_000_000)

        // Dedup scoped to (attachmentId, targetLanguage): one entry, latest wins.
        XCTAssertEqual(delegate.messageTranslatedAudiosByAttachment["attA"]?.count, 1)
        XCTAssertEqual(delegate.messageTranslatedAudiosByAttachment["attA"]?.first?.url, "https://x/new.mp3")
    }
}
