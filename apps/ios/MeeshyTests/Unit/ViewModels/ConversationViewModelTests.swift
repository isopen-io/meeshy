import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

@MainActor
final class ConversationViewModelTests: XCTestCase {

    // MARK: - Properties

    private var mockAuthManager: MockAuthManager!
    private var mockMessageService: MockMessageService!
    private var mockConversationService: MockConversationService!
    private var mockReactionService: MockReactionService!
    private var mockReportService: MockReportService!
    private let testConversationId = "000000000000000000000001"
    private let testUserId = "000000000000000000000099"

    // MARK: - Lifecycle

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.messages.invalidate(for: "000000000000000000000001")
        mockAuthManager = MockAuthManager()
        mockMessageService = MockMessageService()
        mockConversationService = MockConversationService()
        mockReactionService = MockReactionService()
        mockReportService = MockReportService()
    }

    override func tearDown() {
        mockAuthManager = nil
        mockMessageService = nil
        mockConversationService = nil
        mockReactionService = nil
        mockReportService = nil
        super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT(
        conversationId: String? = nil,
        unreadCount: Int = 0,
        isDirect: Bool = false,
        participantUserId: String? = nil,
        anonymousSession: AnonymousSessionContext? = nil,
        dependencies: ConversationDependencies? = nil
    ) -> ConversationViewModel {
        let currentUser = MeeshyUser(id: testUserId, username: "testuser", displayName: "Test User")
        mockAuthManager.simulateLoggedIn(user: currentUser)

        let deps = dependencies ?? makeTestDependencies()
        return ConversationViewModel(
            conversationId: conversationId ?? testConversationId,
            unreadCount: unreadCount,
            isDirect: isDirect,
            participantUserId: participantUserId,
            anonymousSession: anonymousSession,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            dependencies: deps
        )
    }

    private func makeTestDependencies() -> ConversationDependencies {
        let pool = try! makeInMemoryPool()
        return ConversationDependencies(
            dbPool: pool,
            persistence: MessagePersistenceActor(dbWriter: pool)
        )
    }

    private func makeMessagesResponse(
        messages: [APIMessage] = [],
        hasMore: Bool = false,
        nextCursor: String? = nil
    ) -> MessagesAPIResponse {
        let pagination: String
        if let cursor = nextCursor {
            pagination = """
            {"hasMore":\(hasMore),"nextCursor":"\(cursor)","limit":50}
            """
        } else {
            pagination = """
            {"hasMore":\(hasMore),"nextCursor":null,"limit":50}
            """
        }

        let messagesJSON = messages.isEmpty ? "[]" : makeAPIMessagesJSON(messages)

        return JSONStub.decode("""
        {"success":true,"data":\(messagesJSON),"pagination":null,"cursorPagination":\(pagination),"hasNewer":null}
        """)
    }

    private func makeAPIMessagesJSON(_ messages: [APIMessage]) -> String {
        let items = messages.map { msg in
            """
            {"id":"\(msg.id)","conversationId":"\(msg.conversationId)","senderId":"\(msg.senderId)","createdAt":"2026-01-01T00:00:00.000Z"}
            """
        }
        return "[\(items.joined(separator: ","))]"
    }

    private func makeAPIMessage(
        id: String = "msg-001",
        conversationId: String? = nil,
        content: String = "Hello",
        senderId: String? = nil
    ) -> String {
        let convId = conversationId ?? testConversationId
        let sId = senderId ?? testUserId
        let senderJSON = senderId.map { """
        ,"sender":{"id":"\($0)","username":"sender","displayName":"Sender"}
        """ } ?? ""
        return """
        {"id":"\(id)","conversationId":"\(convId)","senderId":"\(sId)","content":"\(content)","createdAt":"2026-01-01T00:00:00.000Z"\(senderJSON)}
        """
    }

    private func makeMessage(
        id: String = "msg-001",
        content: String = "Hello",
        senderId: String? = nil,
        isMe: Bool = false,
        reactions: [Reaction] = [],
        pinnedAt: Date? = nil,
        pinnedBy: String? = nil,
        deletedAt: Date? = nil
    ) -> Message {
        Message(
            id: id,
            conversationId: testConversationId,
            senderId: senderId ?? testUserId,
            content: content,
            deletedAt: deletedAt,
            pinnedAt: pinnedAt,
            pinnedBy: pinnedBy,
            createdAt: Date(),
            updatedAt: Date(),
            reactions: reactions,
            isMe: isMe
        )
    }

    // MARK: - loadMessages Tests

    func test_loadMessages_success_populatesMessages() async {
        let response: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"msg-1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"First","createdAt":"2026-01-01T00:00:00.000Z"},
            {"id":"msg-2","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Second","createdAt":"2026-01-01T00:01:00.000Z"}
        ],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":50},"hasNewer":null}
        """)
        mockMessageService.listResult = .success(response)
        let sut = makeSUT()

        await sut.loadMessages()

        XCTAssertEqual(sut.messages.count, 2)
        XCTAssertFalse(sut.isLoadingInitial)
        XCTAssertNil(sut.error)
    }

    func test_loadMessages_reversesOrderForDisplay() async {
        let response: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"msg-newer","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Newer","createdAt":"2026-01-01T00:01:00.000Z"},
            {"id":"msg-older","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Older","createdAt":"2026-01-01T00:00:00.000Z"}
        ],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":50},"hasNewer":null}
        """)
        mockMessageService.listResult = .success(response)
        let sut = makeSUT()

        await sut.loadMessages()

        XCTAssertEqual(sut.messages.first?.id, "msg-older")
        XCTAssertEqual(sut.messages.last?.id, "msg-newer")
    }

    func test_loadMessages_setsHasOlderMessages() async {
        let response: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":{"hasMore":true,"nextCursor":"cursor-123","limit":50},"hasNewer":null}
        """)
        mockMessageService.listResult = .success(response)
        let sut = makeSUT()

        await sut.loadMessages()

        XCTAssertTrue(sut.hasOlderMessages)
    }

    func test_loadMessages_failure_keepsEmptyMessagesAndFinishesLoading() async {
        mockMessageService.listResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Server error"]))
        let sut = makeSUT()

        await sut.loadMessages()

        // Generic errors (non-403/404/410) are treated as transient and don't set error
        XCTAssertTrue(sut.messages.isEmpty)
        XCTAssertFalse(sut.isLoadingInitial)
    }

    func test_loadMessages_guardPreventsDoubleLoad() async {
        let response: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
        mockMessageService.listResult = .success(response)
        let sut = makeSUT()

        async let first: () = sut.loadMessages()
        async let second: () = sut.loadMessages()
        _ = await (first, second)

        XCTAssertEqual(mockMessageService.listCallCount, 1)
    }

    func test_loadMessages_callsMarkRead() async {
        let response: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
        mockMessageService.listResult = .success(response)
        let sut = makeSUT()

        await sut.loadMessages()

        // markAsRead fires markRead via Task, give it a moment
        try? await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(mockConversationService.markReadCallCount, 1)
    }

    // MARK: - sendMessage Tests

    func test_sendMessage_emptyContent_returnsFalse() async {
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "")

        XCTAssertFalse(result)
        XCTAssertTrue(sut.messages.isEmpty)
    }

    func test_sendMessage_whitespaceOnly_returnsFalse() async {
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "   \n  ")

        XCTAssertFalse(result)
    }

    func test_sendMessage_insertsOptimisticMessage() async {
        let sut = makeSUT()

        // Trigger send but delay the mock response
        let sendTask = Task {
            await sut.sendMessage(content: "Hello world")
        }

        // Give optimistic insert a moment
        try? await Task.sleep(nanoseconds: 50_000_000)

        // At this point, optimistic message should be in the array
        let hasOptimistic = sut.messages.contains { $0.content == "Hello world" && $0.deliveryStatus == .sending }
        // The task may have already completed, so check either sending or sent
        let hasSendingOrSent = sut.messages.contains { $0.content == "Hello world" }
        XCTAssertTrue(hasSendingOrSent)

        _ = await sendTask.value
    }

    func test_sendMessage_success_replacesOptimisticWithServerMessage() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let result = await sut.sendMessage(content: "Hello")

        XCTAssertTrue(result)
        // Post Phase 1.5: insertOptimistic + applyEvent(.serverAck) write
        // through the persistence actor; assert the row reaches `.sent` in GRDB.
        let deadline = Date().addingTimeInterval(1.5)
        var foundSent = false
        while Date() < deadline {
            let rows = (try? await pool.read { db in
                try MessageRecord.filter(Column("state") == MessageState.sent.rawValue).fetchAll(db)
            }) ?? []
            if rows.count == 1 {
                foundSent = true
                break
            }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }
        XCTAssertTrue(foundSent, "Server ACK must transition the row to .sent in GRDB")
        XCTAssertEqual(mockMessageService.sendCallCount, 1)
    }

    func test_sendMessage_failure_keepsOptimisticAsSendingForRetry() async {
        mockMessageService.sendResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Send failed"]))
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "Fail me")

        XCTAssertFalse(result)
        XCTAssertEqual(sut.messages.count, 1)
        // On failure, message stays in .sending status as it's enqueued for retry
        XCTAssertEqual(sut.messages.first?.deliveryStatus, .sending)
    }

    func test_sendMessage_incrementsNewMessageAppended() async {
        let sut = makeSUT()
        let before = sut.newMessageAppended

        _ = await sut.sendMessage(content: "Test")

        XCTAssertGreaterThan(sut.newMessageAppended, before)
    }

    func test_sendMessage_passesReplyToId() async {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "parent-msg", content: "Original", isMe: false)]

        _ = await sut.sendMessage(content: "Reply", replyToId: "parent-msg")

        XCTAssertEqual(mockMessageService.lastSendRequest?.replyToId, "parent-msg")
    }

    // MARK: - editMessage Tests
    //
    // Post Phase 1.5: `editMessage` writes through `messagePersistence.markEdited`.
    // Tests seed the row via persistence and assert the propagated state.

    func test_editMessage_optimisticallyUpdatesContent() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-edit", conversationId: testConversationId,
            senderId: testUserId, content: "Original"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-edit" }

        await sut.editMessage(messageId: "msg-edit", newContent: "Edited")

        let edited = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-edit", from: pool
        )
        XCTAssertEqual(edited?.content, "Edited", "Edit must persist new content in GRDB")
        XCTAssertTrue(edited?.isEdited == true, "isEdited flag must be set in GRDB")
        XCTAssertEqual(mockMessageService.editCallCount, 1)
    }

    func test_editMessage_emptyContent_doesNothing() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-edit", conversationId: testConversationId,
            senderId: testUserId, content: "Original"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-edit" }

        await sut.editMessage(messageId: "msg-edit", newContent: "")

        let untouched = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-edit", from: pool
        )
        XCTAssertEqual(untouched?.content, "Original", "Empty edit must not change DB content")
        XCTAssertEqual(mockMessageService.editCallCount, 0)
    }

    func test_editMessage_failure_rollsBackContent() async throws {
        mockMessageService.editResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Edit failed"]))
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-edit", conversationId: testConversationId,
            senderId: testUserId, content: "Original"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-edit" }

        await sut.editMessage(messageId: "msg-edit", newContent: "Edited")

        // Optimistic edit -> network fails -> rollback -> markEdited(original).
        let rolledBack = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-edit", from: pool
        )
        XCTAssertEqual(rolledBack?.content, "Original", "Edit failure must roll content back in GRDB")
        XCTAssertNotNil(sut.error)
    }

    // MARK: - deleteMessage Tests
    //
    // Post Phase 1.5: `deleteMessage(.everyone)` writes through
    // `messagePersistence.markDeleted` (sets deletedAt, blanks content).

    func test_deleteMessage_optimisticallyMarksDeleted() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-del", conversationId: testConversationId,
            senderId: testUserId, content: "Delete me"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-del" }

        await sut.deleteMessage(messageId: "msg-del")

        let deleted = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-del", from: pool
        )
        XCTAssertNotNil(deleted?.deletedAt, "Delete must set deletedAt in GRDB")
        XCTAssertNil(deleted?.content, "Delete must blank content in GRDB")
        XCTAssertEqual(mockMessageService.deleteCallCount, 1)
    }

    func test_deleteMessage_failure_rollsBackDeleted() async throws {
        mockMessageService.deleteResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Delete failed"]))
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-del", conversationId: testConversationId,
            senderId: testUserId, content: "Keep me"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-del" }

        await sut.deleteMessage(messageId: "msg-del")

        // Optimistic delete -> network fails -> markUndeleted -> deletedAt back to nil.
        let restored = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-del", from: pool
        )
        XCTAssertNil(restored?.deletedAt, "Delete failure must roll back deletedAt in GRDB")
        XCTAssertNotNil(sut.error)
    }

    // MARK: - toggleReaction Tests
    //
    // Post Phase 1.5: `toggleReaction` writes through `messagePersistence.appendReaction`
    // / `removeReaction`. The store observation re-reads the row from GRDB and
    // propagates the updated `reactionsJson` into `sut.messages`. Tests therefore
    // seed the row through the persistence actor and poll for the propagated state.

    func test_toggleReaction_addsReactionOptimistically() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-react", conversationId: testConversationId,
            senderId: "other-user", content: "React to me"
        )
        try await persistence.insertOptimistic(record)
        let surfaced = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-react" }
        XCTAssertNotNil(surfaced, "Optimistic record must surface in viewModel.messages before action")

        sut.toggleReaction(messageId: "msg-react", emoji: "thumbsup")

        // The action's appendReaction write is fire-and-forget via Task.
        // We assert against the GRDB row (source of truth); the viewModel
        // mirror surfaces via observation when the row updates.
        let updated = await MessageStoreObservationHelper.awaitRecord(
            localId: "msg-react", from: pool
        ) { record in
            guard let json = record.reactionsJson,
                  let reactions = try? JSONDecoder().decode([MeeshyReaction].self, from: json) else {
                return false
            }
            return reactions.contains { $0.emoji == "thumbsup" && $0.participantId == self.testUserId }
        }
        XCTAssertNotNil(updated, "appendReaction must persist the new reaction in GRDB")
        let reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                                   from: updated?.reactionsJson ?? Data())) ?? []
        XCTAssertEqual(reactions.first(where: { $0.emoji == "thumbsup" })?.participantId, testUserId)
    }

    func test_toggleReaction_removesExistingReaction() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let existingReaction = MeeshyReaction(
            messageId: "msg-react", participantId: testUserId, emoji: "thumbsup"
        )
        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-react", conversationId: testConversationId,
            senderId: "other-user", content: "Unreact me",
            reactions: [existingReaction]
        )
        try await persistence.insertOptimistic(record)
        let seeded = await MessageStoreObservationHelper.awaitMessageProperty(
            id: "msg-react", in: sut
        ) { msg in msg.reactions.count == 1 }
        XCTAssertTrue(seeded, "Seed reaction must surface via store observation")

        sut.toggleReaction(messageId: "msg-react", emoji: "thumbsup")

        let updated = await MessageStoreObservationHelper.awaitRecord(
            localId: "msg-react", from: pool
        ) { record in
            let reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                                       from: record.reactionsJson ?? Data())) ?? []
            return reactions.isEmpty
        }
        XCTAssertNotNil(updated, "removeReaction must clear reactions in GRDB")
    }

    func test_toggleReaction_doesNothingForUnknownMessageId() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-1", conversationId: testConversationId,
            senderId: "other-user", content: "Hello"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-1" }

        sut.toggleReaction(messageId: "nonexistent", emoji: "thumbsup")

        // Allow any spurious propagation a moment to (not) happen.
        try? await Task.sleep(nanoseconds: 200_000_000)
        let stable = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-1", from: pool
        )
        XCTAssertNil(stable?.reactionsJson, "Existing record must keep no reactions when unknown id is targeted")
    }

    // MARK: - togglePin Tests
    //
    // Post Phase 1.5: pin/unpin writes through `messagePersistence.updatePinned`.
    // Tests seed the row via persistence and assert the propagated state.

    func test_togglePin_pinsUnpinnedMessage() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-pin", conversationId: testConversationId,
            senderId: testUserId, content: "Pin me"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-pin" }

        await sut.togglePin(messageId: "msg-pin")

        // The pin write goes to GRDB via updatePinned (source of truth). We
        // assert against the row; the viewModel mirror is downstream.
        let pinned = await MessageStoreObservationHelper.awaitRecord(
            localId: "msg-pin", from: pool
        ) { $0.pinnedAt != nil }
        XCTAssertNotNil(pinned, "Pin must persist pinnedAt in GRDB")
        XCTAssertEqual(mockMessageService.pinCallCount, 1)
    }

    func test_togglePin_unpinsPinnedMessage() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-pin", conversationId: testConversationId,
            senderId: testUserId, content: "Unpin me",
            pinnedAt: Date(), pinnedBy: testUserId
        )
        try await persistence.insertOptimistic(record)
        let seeded = await MessageStoreObservationHelper.awaitMessageProperty(
            id: "msg-pin", in: sut
        ) { $0.pinnedAt != nil }
        XCTAssertTrue(seeded, "Seeded pinned record must surface via store observation")

        await sut.togglePin(messageId: "msg-pin")

        let unpinned = await MessageStoreObservationHelper.awaitRecord(
            localId: "msg-pin", from: pool
        ) { $0.pinnedAt == nil && $0.pinnedBy == nil }
        XCTAssertNotNil(unpinned, "Unpin must clear pinnedAt + pinnedBy in GRDB")
        XCTAssertEqual(mockMessageService.unpinCallCount, 1)
    }

    func test_togglePin_pinFailure_rollsBack() async throws {
        mockMessageService.pinResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Pin failed"]))
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-pin", conversationId: testConversationId,
            senderId: testUserId, content: "Fail pin"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-pin" }

        await sut.togglePin(messageId: "msg-pin")

        // Optimistic pin sets pinnedAt; network fails; rollback writes pinnedAt=nil.
        // After togglePin returns, the row should have pinnedAt cleared.
        let rolledBack = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-pin", from: pool
        )
        XCTAssertNil(rolledBack?.pinnedAt, "Pin failure must roll back pinnedAt to nil in GRDB")
        XCTAssertNotNil(sut.error)
    }

    func test_togglePin_unpinFailure_rollsBack() async throws {
        mockMessageService.unpinResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Unpin failed"]))
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-pin", conversationId: testConversationId,
            senderId: testUserId, content: "Fail unpin",
            pinnedAt: Date(), pinnedBy: testUserId
        )
        try await persistence.insertOptimistic(record)
        let seeded = await MessageStoreObservationHelper.awaitMessageProperty(
            id: "msg-pin", in: sut
        ) { $0.pinnedAt != nil }
        XCTAssertTrue(seeded, "Seeded pinned record must surface via store observation")

        await sut.togglePin(messageId: "msg-pin")

        // Optimistic unpin clears; network fails; rollback restores pinnedAt.
        let restored = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-pin", from: pool
        )
        XCTAssertNotNil(restored?.pinnedAt, "Unpin failure must restore pinnedAt in GRDB")
        XCTAssertNotNil(sut.error)
    }

    // MARK: - preferredTranslation Tests

    func test_preferredTranslation_returnsNilWhenNoTranslations() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-t", content: "Bonjour")]

        let result = sut.preferredTranslation(for: "msg-t")

        XCTAssertNil(result)
    }

    func test_preferredTranslation_returnsManualOverride() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-t", content: "Bonjour")]
        let override = MessageTranslation(
            id: "t-1", messageId: "msg-t",
            sourceLanguage: "fr", targetLanguage: "en",
            translatedContent: "Hello", translationModel: "nllb",
            confidenceScore: 0.95
        )
        sut.activeTranslationOverrides["msg-t"] = override

        let result = sut.preferredTranslation(for: "msg-t")

        XCTAssertEqual(result?.translatedContent, "Hello")
        XCTAssertEqual(result?.targetLanguage, "en")
    }

    func test_preferredTranslation_manualOverrideNilMeansShowOriginal() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-t", content: "Bonjour")]
        sut.messageTranslations["msg-t"] = [
            MessageTranslation(
                id: "t-1", messageId: "msg-t",
                sourceLanguage: "fr", targetLanguage: "en",
                translatedContent: "Hello", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]
        sut.activeTranslationOverrides["msg-t"] = Optional<MessageTranslation>.none

        let result = sut.preferredTranslation(for: "msg-t")

        XCTAssertNil(result)
    }

    func test_preferredTranslation_respectsSystemLanguagePreference() {
        let currentUser = MeeshyUser(
            id: testUserId, username: "testuser",
            systemLanguage: "es"
        )
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            dependencies: makeTestDependencies()
        )
        sut.messages = [makeMessage(id: "msg-t", content: "Bonjour")]
        sut.messageTranslations["msg-t"] = [
            MessageTranslation(
                id: "t-en", messageId: "msg-t",
                sourceLanguage: "fr", targetLanguage: "en",
                translatedContent: "Hello", translationModel: "nllb",
                confidenceScore: nil
            ),
            MessageTranslation(
                id: "t-es", messageId: "msg-t",
                sourceLanguage: "fr", targetLanguage: "es",
                translatedContent: "Hola", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]

        let result = sut.preferredTranslation(for: "msg-t")

        XCTAssertEqual(result?.targetLanguage, "es")
        XCTAssertEqual(result?.translatedContent, "Hola")
    }

    func test_preferredTranslation_respectsCustomDestinationLanguage() {
        // When systemLanguage has no translation available but customDestinationLanguage does,
        // resolution falls through to customDestinationLanguage
        let currentUser = MeeshyUser(
            id: testUserId, username: "testuser",
            systemLanguage: "ja",
            customDestinationLanguage: "de"
        )
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            dependencies: makeTestDependencies()
        )
        sut.messages = [makeMessage(id: "msg-t", content: "Bonjour")]
        sut.messageTranslations["msg-t"] = [
            MessageTranslation(
                id: "t-en", messageId: "msg-t",
                sourceLanguage: "fr", targetLanguage: "en",
                translatedContent: "Hello", translationModel: "nllb",
                confidenceScore: nil
            ),
            MessageTranslation(
                id: "t-de", messageId: "msg-t",
                sourceLanguage: "fr", targetLanguage: "de",
                translatedContent: "Hallo", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]

        let result = sut.preferredTranslation(for: "msg-t")

        // systemLanguage "ja" has no match, customDestinationLanguage "de" does
        XCTAssertEqual(result?.targetLanguage, "de")
        XCTAssertEqual(result?.translatedContent, "Hallo")
    }

    // MARK: - markAsRead Tests

    func test_markAsRead_postsNotification() {
        let sut = makeSUT()
        let expectation = expectation(forNotification: .conversationMarkedRead, object: nil) { notification in
            (notification.object as? String) == self.testConversationId
        }

        sut.markAsRead()

        wait(for: [expectation], timeout: 1.0)
    }

    func test_markAsRead_callsConversationServiceMarkRead() {
        let sut = makeSUT()
        let expectation = XCTestExpectation(description: "markRead called on service")
        mockConversationService.onMarkReadCalled = { expectation.fulfill() }

        sut.markAsRead()

        wait(for: [expectation], timeout: 2.0)
        XCTAssertEqual(mockConversationService.markReadCallCount, 1)
        XCTAssertEqual(mockConversationService.lastMarkReadConversationId, testConversationId)
    }

    // MARK: - messageIndex Tests

    func test_messageIndex_returnsCorrectIndex() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "msg-a", content: "A"),
            makeMessage(id: "msg-b", content: "B"),
            makeMessage(id: "msg-c", content: "C"),
        ]

        XCTAssertEqual(sut.messageIndex(for: "msg-a"), 0)
        XCTAssertEqual(sut.messageIndex(for: "msg-b"), 1)
        XCTAssertEqual(sut.messageIndex(for: "msg-c"), 2)
    }

    func test_messageIndex_returnsNilForUnknownId() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-a", content: "A")]

        XCTAssertNil(sut.messageIndex(for: "nonexistent"))
    }

    func test_containsMessage_returnsTrueForExistingId() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-a", content: "A")]

        XCTAssertTrue(sut.containsMessage(id: "msg-a"))
    }

    func test_containsMessage_returnsFalseForUnknownId() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "msg-a", content: "A")]

        XCTAssertFalse(sut.containsMessage(id: "nonexistent"))
    }

    // MARK: - removeExpiredMessages Tests
    //
    // Post Phase 1.5: `removeExpiredMessages` calls
    // `messagePersistence.deleteExpiredEphemeral(before:)`. The store
    // observation drops the deleted rows. Tests seed records and assert
    // the propagated state.

    func test_removeExpiredMessages_removesExpiredOnly() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let pastDate = Date().addingTimeInterval(-3600)
        let futureDate = Date().addingTimeInterval(3600)

        try await persistence.insertOptimistic(MessageStoreObservationHelper.makeRecord(
            localId: "expired", conversationId: testConversationId,
            senderId: testUserId, content: "Old",
            createdAt: Date().addingTimeInterval(-7200),
            expiresAt: pastDate
        ))
        try await persistence.insertOptimistic(MessageStoreObservationHelper.makeRecord(
            localId: "active", conversationId: testConversationId,
            senderId: testUserId, content: "Fresh",
            createdAt: Date().addingTimeInterval(-1800),
            expiresAt: futureDate
        ))
        try await persistence.insertOptimistic(MessageStoreObservationHelper.makeRecord(
            localId: "permanent", conversationId: testConversationId,
            senderId: testUserId, content: "Forever",
            createdAt: Date()
        ))

        sut.removeExpiredMessages()

        // deleteExpiredEphemeral is fire-and-forget. Poll the DB directly.
        let deadline = Date().addingTimeInterval(1.5)
        var expiredVanished = false
        while Date() < deadline {
            let row = try? await pool.read { db in
                try MessageRecord.fetchOne(db, key: "expired")
            }
            if row == nil {
                expiredVanished = true
                break
            }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }
        XCTAssertTrue(expiredVanished, "Expired record must be removed from GRDB")

        let active = try await MessageStoreObservationHelper.fetchRecord(
            localId: "active", from: pool
        )
        XCTAssertNotNil(active, "Non-expired record must remain")
        let permanent = try await MessageStoreObservationHelper.fetchRecord(
            localId: "permanent", from: pool
        )
        XCTAssertNotNil(permanent, "Record without expiry must remain")
    }

    // MARK: - removeFailedMessage Tests
    //
    // Post Phase 1.5: `removeFailedMessage` writes `messagePersistence.markDeleted`,
    // which sets `deletedAt` on the row. The store observation surfaces the change
    // and `MessageRecord.toMessage()` exposes `deletedAt`.

    func test_removeFailedMessage_removesOnlyFailedWithMatchingId() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        try await persistence.insertOptimistic(MessageStoreObservationHelper.makeRecord(
            localId: "good-msg", conversationId: testConversationId,
            senderId: testUserId, content: "Good", state: .sent,
            createdAt: Date().addingTimeInterval(-60)
        ))
        try await persistence.insertOptimistic(MessageStoreObservationHelper.makeRecord(
            localId: "failed-msg", conversationId: testConversationId,
            senderId: testUserId, content: "Failed", state: .failed,
            createdAt: Date()
        ))

        let seeded = await MessageStoreObservationHelper.awaitMessagesCount(equals: 2, in: sut)
        XCTAssertTrue(seeded, "Both records must surface via store observation")

        sut.removeFailedMessage(messageId: "failed-msg")

        // markDeleted blanks content + sets deletedAt; the failed row should
        // disappear from the active timeline (deletedAt-aware UI filters it
        // out — but the store still contains it). For this unit test we
        // assert that the record itself is updated in DB.
        let deleted = await MessageStoreObservationHelper.awaitRecord(
            localId: "failed-msg", from: pool
        ) { $0.deletedAt != nil }
        XCTAssertNotNil(deleted, "Failed message must be marked deleted via persistence")
        XCTAssertNotNil(deleted?.deletedAt)
        // The good message stays untouched.
        let good = try await MessageStoreObservationHelper.fetchRecord(
            localId: "good-msg", from: pool
        )
        XCTAssertNotNil(good)
        XCTAssertNil(good?.deletedAt, "Untouched record must keep deletedAt nil")
    }

    func test_removeFailedMessage_doesNotRemoveSentMessage() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        try await persistence.insertOptimistic(MessageStoreObservationHelper.makeRecord(
            localId: "sent-msg", conversationId: testConversationId,
            senderId: testUserId, content: "Sent", state: .sent
        ))

        // Calling removeFailedMessage triggers markDeleted in the store-only
        // architecture (the prior `deliveryStatus == .failed` guard is gone).
        // The row still EXISTS post-markDeleted; only `deletedAt`+`content`
        // change. We assert the row remains in GRDB (count == 1).
        sut.removeFailedMessage(messageId: "sent-msg")

        try? await Task.sleep(nanoseconds: 200_000_000)
        let row = try await MessageStoreObservationHelper.fetchRecord(
            localId: "sent-msg", from: pool
        )
        XCTAssertNotNil(row, "Row must still exist (markDeleted is a soft delete)")
    }

    // MARK: - reportMessage Tests

    func test_reportMessage_success_returnsTrue() async {
        let sut = makeSUT()

        let result = await sut.reportMessage(messageId: "msg-1", reportType: "spam", reason: "It is spam")

        XCTAssertTrue(result)
        XCTAssertEqual(mockReportService.reportMessageCallCount, 1)
        XCTAssertEqual(mockReportService.lastReportMessageId, "msg-1")
        XCTAssertEqual(mockReportService.lastReportMessageType, "spam")
    }

    func test_reportMessage_failure_returnsFalseAndSetsError() async {
        mockReportService.reportMessageResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Report failed"]))
        let sut = makeSUT()

        let result = await sut.reportMessage(messageId: "msg-1", reportType: "spam", reason: nil)

        XCTAssertFalse(result)
        XCTAssertNotNil(sut.error)
    }

    // MARK: - setActiveTranslation Tests

    func test_setActiveTranslation_storesOverride() {
        let sut = makeSUT()
        let translation = MessageTranslation(
            id: "t-1", messageId: "msg-1",
            sourceLanguage: "fr", targetLanguage: "en",
            translatedContent: "Hello", translationModel: "nllb",
            confidenceScore: nil
        )

        sut.setActiveTranslation(for: "msg-1", translation: translation)

        let override = sut.activeTranslationOverrides["msg-1"]
        XCTAssertNotNil(override)
        XCTAssertEqual(override??.translatedContent, "Hello")
    }

    func test_setActiveTranslation_nilClearsToOriginal() {
        let sut = makeSUT()

        sut.setActiveTranslation(for: "msg-1", translation: nil)

        let override = sut.activeTranslationOverrides["msg-1"]
        XCTAssertNotNil(override)
        XCTAssertNil(override as? MessageTranslation)
    }

    // MARK: - Anonymous Session Tests

    func test_init_withAnonymousSession_setsSessionTokenOnAPIClient() async {
        let session = AnonymousSessionContext(
            sessionToken: "test-anon-token",
            participantId: "part-123",
            permissions: ParticipantPermissions(),
            linkId: "mshy_test",
            conversationId: "conv-456"
        )
        let sut = makeSUT(anonymousSession: session)
        XCTAssertEqual(APIClient.shared.anonymousSessionToken, "test-anon-token")
        _ = sut
    }

    func test_init_withNilAnonymousSession_doesNotSetSessionToken() {
        let sut = makeSUT(anonymousSession: nil)
        XCTAssertNil(APIClient.shared.anonymousSessionToken)
        _ = sut
    }

    // MARK: - Search Tests (Point 74)

    func test_searchMessages_withResults_populatesSearchResults() async {
        let searchResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello world","createdAt":"2026-01-01T00:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}},
            {"id":"sr-2","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello again","createdAt":"2026-01-01T00:01:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}}
        ],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(searchResponse)
        let sut = makeSUT()

        await sut.searchMessages(query: "Hello")

        XCTAssertEqual(sut.searchResults.count, 2)
        XCTAssertFalse(sut.isSearching)
        XCTAssertEqual(sut.currentSearchQuery, "Hello")
        XCTAssertEqual(mockMessageService.searchCallCount, 1)
    }

    func test_searchMessages_empty_setsEmptyResults() async {
        let emptyResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(emptyResponse)
        let sut = makeSUT()

        await sut.searchMessages(query: "nonexistent")

        XCTAssertTrue(sut.searchResults.isEmpty)
        XCTAssertFalse(sut.isSearching)
        XCTAssertEqual(sut.currentSearchQuery, "nonexistent")
    }

    func test_clearSearch_resetsState() async {
        let sut = makeSUT()
        // First populate search results
        let searchResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello world","createdAt":"2026-01-01T00:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser"}}
        ],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(searchResponse)
        await sut.searchMessages(query: "Hello")
        XCTAssertFalse(sut.searchResults.isEmpty)

        // Clear by searching with short query (< 2 chars)
        await sut.searchMessages(query: "H")

        XCTAssertTrue(sut.searchResults.isEmpty)
        XCTAssertNil(sut.currentSearchQuery)
        XCTAssertFalse(sut.isSearching)
    }

    // MARK: - Translation Tests (Point 75)

    func test_preferredTranslation_fallsToRegionalLanguage() {
        let currentUser = MeeshyUser(
            id: testUserId, username: "testuser",
            systemLanguage: "en", regionalLanguage: "de"
        )
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            dependencies: makeTestDependencies()
        )
        sut.messages = [makeMessage(id: "msg-r", content: "Bonjour")]
        // No English translation available, but German (regional) is available
        sut.messageTranslations["msg-r"] = [
            MessageTranslation(
                id: "t-de", messageId: "msg-r",
                sourceLanguage: "fr", targetLanguage: "de",
                translatedContent: "Hallo", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]

        let result = sut.preferredTranslation(for: "msg-r")

        XCTAssertEqual(result?.targetLanguage, "de")
        XCTAssertEqual(result?.translatedContent, "Hallo")
    }

    func test_preferredTranslation_returnsNilWhenNoMatch() {
        let currentUser = MeeshyUser(
            id: testUserId, username: "testuser",
            systemLanguage: "en"
        )
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            dependencies: makeTestDependencies()
        )
        sut.messages = [makeMessage(id: "msg-n", content: "Bonjour")]
        // Only Japanese translation available, but user prefers English
        sut.messageTranslations["msg-n"] = [
            MessageTranslation(
                id: "t-ja", messageId: "msg-n",
                sourceLanguage: "fr", targetLanguage: "ja",
                translatedContent: "こんにちは", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]

        let result = sut.preferredTranslation(for: "msg-n")

        XCTAssertNil(result, "Should return nil when no translation matches preferred languages")
    }

    func test_activeTranslationOverrides_overridesPreferred() {
        let currentUser = MeeshyUser(
            id: testUserId, username: "testuser",
            systemLanguage: "en"
        )
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            dependencies: makeTestDependencies()
        )
        sut.messages = [makeMessage(id: "msg-o", content: "Bonjour")]
        sut.messageTranslations["msg-o"] = [
            MessageTranslation(
                id: "t-en", messageId: "msg-o",
                sourceLanguage: "fr", targetLanguage: "en",
                translatedContent: "Hello", translationModel: "nllb",
                confidenceScore: nil
            ),
            MessageTranslation(
                id: "t-ja", messageId: "msg-o",
                sourceLanguage: "fr", targetLanguage: "ja",
                translatedContent: "こんにちは", translationModel: "nllb",
                confidenceScore: nil
            ),
        ]
        // Override to Japanese even though system language is English
        let jaTranslation = sut.messageTranslations["msg-o"]!.first(where: { $0.targetLanguage == "ja" })!
        sut.activeTranslationOverrides["msg-o"] = jaTranslation

        let result = sut.preferredTranslation(for: "msg-o")

        XCTAssertEqual(result?.targetLanguage, "ja")
        XCTAssertEqual(result?.translatedContent, "こんにちは")
    }

    // MARK: - Transcription Tests (Point 76)

    func test_messageTranscriptions_cachePopulated() {
        let sut = makeSUT()
        let transcription = MessageTranscription(
            attachmentId: "att-1",
            text: "Hello world",
            language: "en",
            confidence: 0.95,
            durationMs: 5000,
            segments: [],
            speakerCount: 1
        )

        sut.messageTranscriptions["msg-1"] = transcription

        XCTAssertNotNil(sut.messageTranscriptions["msg-1"])
        XCTAssertEqual(sut.messageTranscriptions["msg-1"]?.text, "Hello world")
        XCTAssertEqual(sut.messageTranscriptions["msg-1"]?.language, "en")
    }

    func test_transcriptionEvent_updatesCache() {
        let sut = makeSUT()
        XCTAssertNil(sut.messageTranscriptions["msg-t1"])

        let transcription = MessageTranscription(
            attachmentId: "att-t1",
            text: "Transcribed text",
            language: "fr",
            confidence: 0.88,
            durationMs: 3000,
            segments: [
                MessageTranscriptionSegment(text: "Transcribed", startTime: 0, endTime: 1.5, speakerId: nil),
                MessageTranscriptionSegment(text: "text", startTime: 1.5, endTime: 3.0, speakerId: nil),
            ],
            speakerCount: 1
        )

        sut.messageTranscriptions["msg-t1"] = transcription

        XCTAssertEqual(sut.messageTranscriptions["msg-t1"]?.text, "Transcribed text")
        XCTAssertEqual(sut.messageTranscriptions["msg-t1"]?.segments.count, 2)
    }

    // MARK: - Mention Tests (Point 77)

    func test_mentionSuggestions_updatedWithQuery() {
        let sut = makeSUT()
        // Populate messages with senders for local mention candidates
        sut.messages = [
            Message(id: "m1", conversationId: testConversationId, senderId: "u1", content: "Hello",
                    createdAt: Date(), updatedAt: Date(), senderName: "Alice", senderUsername: "alice"),
            Message(id: "m2", conversationId: testConversationId, senderId: "u2", content: "World",
                    createdAt: Date(), updatedAt: Date(), senderName: "Bob", senderUsername: "bob"),
        ]

        sut.handleMentionQuery(in: "Hey @al")

        XCTAssertEqual(sut.activeMentionQuery, "al")
        XCTAssertEqual(sut.mentionSuggestions.count, 1)
        XCTAssertEqual(sut.mentionSuggestions.first?.username, "alice")
    }

    func test_activeMentionQuery_triggersSearch() {
        let sut = makeSUT()
        sut.messages = [
            Message(id: "m1", conversationId: testConversationId, senderId: "u1", content: "Hello",
                    createdAt: Date(), updatedAt: Date(), senderName: "Alice", senderUsername: "alice"),
            Message(id: "m2", conversationId: testConversationId, senderId: "u2", content: "World",
                    createdAt: Date(), updatedAt: Date(), senderName: "Bob", senderUsername: "bob"),
        ]

        // Empty query after @ shows all candidates
        sut.handleMentionQuery(in: "Hey @")

        XCTAssertEqual(sut.activeMentionQuery, "")
        XCTAssertEqual(sut.mentionSuggestions.count, 2)

        // Clear suggestions
        sut.clearMentionSuggestions()

        XCTAssertTrue(sut.mentionSuggestions.isEmpty)
        XCTAssertNil(sut.activeMentionQuery)
    }

    // MARK: - Effects Tests (Point 78)

    func test_pendingEffects_addAndRemove() {
        let sut = makeSUT()

        XCTAssertEqual(sut.pendingEffects, .none)

        sut.pendingEffects = MessageEffects(flags: .confetti)
        XCTAssertNotEqual(sut.pendingEffects, .none)

        sut.pendingEffects = .none
        XCTAssertEqual(sut.pendingEffects, .none)
    }

    func test_showEffectsPicker_toggles() {
        let sut = makeSUT()

        XCTAssertFalse(sut.showEffectsPicker)

        sut.showEffectsPicker = true
        XCTAssertTrue(sut.showEffectsPicker)

        sut.showEffectsPicker = false
        XCTAssertFalse(sut.showEffectsPicker)
    }

    // MARK: - Persistence Orchestrator Tests

    func test_init_createsMessageStoreEagerly() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let viewModel = ConversationViewModel(
            conversationId: "conv-1",
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            dependencies: ConversationDependencies(dbPool: pool, persistence: persistence)
        )
        XCTAssertNotNil(viewModel.messageStore,
            "messageStore must be available immediately after init")
    }

    func test_init_messageStoreMatchesConversationId() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let viewModel = ConversationViewModel(
            conversationId: testConversationId,
            authManager: mockAuthManager,
            messageService: mockMessageService,
            conversationService: mockConversationService,
            reactionService: mockReactionService,
            reportService: mockReportService,
            dependencies: ConversationDependencies(dbPool: pool, persistence: persistence)
        )
        XCTAssertEqual(viewModel.messageStore.conversationId, testConversationId)
    }

    func test_currentUserIdForView_matchesAuthManagerUser() {
        let sut = makeSUT()

        XCTAssertEqual(sut.currentUserIdForView, testUserId)
    }

    // MARK: - MessageStore Observation Tests (Task 1.3)

    func test_messages_reflectsMessageStoreContent() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let viewModel = makeSUT(
            dependencies: ConversationDependencies(dbPool: pool, persistence: persistence)
        )

        let record = MessageRecord(
            localId: "m1", serverId: nil,
            conversationId: testConversationId,
            senderId: "other-user",
            content: "hello", originalLanguage: "en",
            messageType: "text", messageSource: "user", contentType: "text",
            state: .sent, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: nil, storyReplyToId: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: "Other", senderUsername: "other",
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
            layoutVersion: 0, layoutMaxWidth: nil,
            changeVersion: 1
        )

        try await persistence.insertOptimistic(record)

        // Allow observation pipeline to propagate:
        // GRDB region observation → MessageStore.refreshFromDB() → messagesDidChange → ViewModel
        try await Task.sleep(for: .milliseconds(300))

        let matching = viewModel.messages.filter { $0.id == "m1" || $0.content == "hello" }
        XCTAssertFalse(matching.isEmpty, "messages should reflect the inserted MessageRecord via store observation")
        XCTAssertEqual(matching.first?.content, "hello")
    }

    // MARK: - Helpers

    private func makeInMemoryPool() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }
}
