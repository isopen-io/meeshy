import XCTest
import Combine
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

    func syncMissedMessages() async {
        syncMissedCalled = true
    }

    func decryptMessagesIfNeeded(_ msgs: inout [Message]) async {
        // no-op in tests
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
        return (sut, delegate, messageSocket)
    }

    private func makeReactionEvent(
        messageId: String,
        emoji: String,
        participantId: String,
        action: String
    ) -> ReactionUpdateEvent {
        let json = """
        {
            "messageId": "\(messageId)",
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

    func test_messageReceived_fromOtherUser_appendsToDelegate() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut

        let apiMsg = makeAPIMessage(id: "newmsg", senderId: otherUserId, content: "Hey!")
        socket.simulateMessage(apiMsg)

        // Combine pipeline needs RunLoop processing — yield and wait
        await Task.yield()
        try await Task.sleep(nanoseconds: 300_000_000)

        XCTAssertEqual(delegate.messages.count, 1)
        XCTAssertEqual(delegate.messages[0].id, "newmsg")
        XCTAssertEqual(delegate.messages[0].content, "Hey!")
        XCTAssertEqual(delegate.newMessageAppended, 1)
        XCTAssertNotNil(delegate.lastUnreadMessage)
    }

    // MARK: - messageReceived: From Self (no new append)

    func test_messageReceived_fromSelf_doesNotAppendNewMessage() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut

        let apiMsg = makeAPIMessage(id: "mymsg", senderId: currentUserId, content: "My msg")
        socket.simulateMessage(apiMsg)

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(delegate.messages.count, 0, "Should not append own message from socket")
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

    func test_messageReceived_ownMessageWithAttachments_updatesExisting() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut
        delegate.messages = [makeMessage(id: "mymsg", senderId: currentUserId, isMe: true)]
        delegate.invalidateIndex()

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

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(delegate.messages.count, 1, "Should update existing, not add new")
        XCTAssertFalse(delegate.messages[0].attachments.isEmpty, "Should have updated attachments")
    }

    // MARK: - messageEdited

    func test_messageEdited_updatesContentAndSetsIsEdited() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut
        delegate.messages = [makeMessage(id: "msg1", content: "Original")]
        delegate.invalidateIndex()

        let editedApiMsg: APIMessage = JSONStub.decode("""
        {
            "id":"msg1",
            "conversationId":"\(conversationId)",
            "content":"Edited content",
            "isEdited":true,
            "createdAt":"2026-03-06T12:00:00.000Z"
        }
        """)
        socket.simulateMessageEdited(editedApiMsg)

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(delegate.messages[0].content, "Edited content")
        XCTAssertTrue(delegate.messages[0].isEdited)
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
            "content":"Edited",
            "createdAt":"2026-03-06T12:00:00.000Z"
        }
        """)
        socket.simulateMessageEdited(editedApiMsg)

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(delegate.messages[0].content, "Original")
    }

    // MARK: - messageDeleted

    func test_messageDeleted_setsIsDeletedAndClearsContent() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut
        delegate.messages = [makeMessage(id: "msg1", content: "Will be deleted")]
        delegate.invalidateIndex()

        socket.simulateMessageDeleted(MessageDeletedEvent(messageId: "msg1", conversationId: conversationId))

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertTrue(delegate.messages[0].isDeleted)
        XCTAssertEqual(delegate.messages[0].content, "")
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

    func test_reactionAdded_appendsReactionToMessage() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut
        delegate.messages = [makeMessage(id: "msg1")]
        delegate.invalidateIndex()

        let event = makeReactionEvent(messageId: "msg1", emoji: "thumbsup", participantId: otherUserId, action: "add")
        socket.reactionAdded.send(event)

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(delegate.messages[0].reactions.count, 1)
        XCTAssertEqual(delegate.messages[0].reactions[0].emoji, "thumbsup")
        XCTAssertEqual(delegate.messages[0].reactions[0].participantId, otherUserId)
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

        XCTAssertEqual(delegate.messages[0].reactions.count, 1, "Should not add duplicate reaction")
    }

    // MARK: - reactionRemoved

    func test_reactionRemoved_removesMatchingReaction() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut
        var msg = makeMessage(id: "msg1")
        msg.reactions = [
            Reaction(messageId: "msg1", participantId: otherUserId, emoji: "thumbsup"),
            Reaction(messageId: "msg1", participantId: currentUserId, emoji: "heart")
        ]
        delegate.messages = [msg]
        delegate.invalidateIndex()

        let event = makeReactionEvent(messageId: "msg1", emoji: "thumbsup", participantId: otherUserId, action: "remove")
        socket.reactionRemoved.send(event)

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(delegate.messages[0].reactions.count, 1)
        XCTAssertEqual(delegate.messages[0].reactions[0].emoji, "heart")
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

    func test_readStatusUpdated_updatesDeliveryStatusForOwnMessages() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut
        let msgDate = Date()
        delegate.messages = [
            makeMessage(id: "msg1", senderId: currentUserId, isMe: true, deliveryStatus: .sent, createdAt: msgDate),
            makeMessage(id: "msg2", senderId: currentUserId, isMe: true, deliveryStatus: .sent, createdAt: msgDate.addingTimeInterval(1))
        ]
        delegate.invalidateIndex()

        let event: ReadStatusUpdateEvent = JSONStub.decode("""
        {
            "conversationId":"\(conversationId)",
            "userId":"\(otherUserId)",
            "type":"read",
            "updatedAt":"2099-12-31T23:59:59.000Z"
        }
        """)
        socket.readStatusUpdated.send(event)

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(delegate.messages[0].deliveryStatus, .read)
        XCTAssertEqual(delegate.messages[1].deliveryStatus, .read)
    }

    func test_readStatusUpdated_deliveredStatus_updatesCorrectly() async throws {
        let (sut, delegate, socket) = makeSUT()
        _ = sut
        let msgDate = Date()
        delegate.messages = [
            makeMessage(id: "msg1", senderId: currentUserId, isMe: true, deliveryStatus: .sent, createdAt: msgDate)
        ]
        delegate.invalidateIndex()

        let event: ReadStatusUpdateEvent = JSONStub.decode("""
        {
            "conversationId":"\(conversationId)",
            "userId":"\(otherUserId)",
            "type":"received",
            "updatedAt":"2099-12-31T23:59:59.000Z"
        }
        """)
        socket.readStatusUpdated.send(event)

        try await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(delegate.messages[0].deliveryStatus, .delivered)
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
            "userId":"\(currentUserId)",
            "type":"read",
            "updatedAt":"2099-12-31T23:59:59.000Z"
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
            "userId":"\(otherUserId)",
            "type":"received",
            "updatedAt":"2099-12-31T23:59:59.000Z"
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
}
