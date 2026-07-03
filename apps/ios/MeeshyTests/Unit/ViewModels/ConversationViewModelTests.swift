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
    private var mockMessageSocket: MockMessageSocket!
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
        mockMessageSocket = MockMessageSocket()
        // ConversationViewModel.sendMessage references MessageSocketManager.shared
        // directly (the singleton, not an injected dep) at line 1318: if the
        // socket is not connected it routes through the offline OutboxQueue
        // path and never calls `messageService.send`. Tests for the ONLINE
        // send semantics need the singleton to report connected. Tests that
        // exercise the offline path explicitly flip this to false.
        MessageSocketManager.shared.isConnected = true
    }

    override func tearDown() {
        // Reset singleton so other test classes don't inherit a forced
        // connected state. The default for a fresh app session is false.
        MessageSocketManager.shared.isConnected = false
        mockAuthManager = nil
        mockMessageService = nil
        mockConversationService = nil
        mockReactionService = nil
        mockReportService = nil
        mockMessageSocket = nil
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
        let sut = ConversationViewModel(
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
            messageSocket: mockMessageSocket,
            dependencies: deps
        )
        // Activate the VM as the view's `.task` does: `init` is now
        // side-effect-free, so the GRDB observation / initial load / Combine
        // subscriptions only come alive after `start()`.
        sut.start()
        return sut
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
        deletedAt: Date? = nil,
        createdAt: Date = Date()
    ) -> Message {
        Message(
            id: id,
            conversationId: testConversationId,
            senderId: senderId ?? testUserId,
            content: content,
            deletedAt: deletedAt,
            pinnedAt: pinnedAt,
            pinnedBy: pinnedBy,
            createdAt: createdAt,
            updatedAt: createdAt,
            reactions: reactions,
            isMe: isMe
        )
    }

    /// Builds a `MessagesAPIResponse` with `count` synthetic messages for the
    /// reconnect-backfill (`listAfter`) path. Lets a test return a full page
    /// (== the VM's page size) followed by a partial page to drive the
    /// watermark forward-paging loop.
    private func makeBackfillResponse(idPrefix: String, count: Int, createdAtISO: String) -> MessagesAPIResponse {
        let items = (0..<count).map { i in
            """
            {"id":"\(idPrefix)-\(i)","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"m\(i)","createdAt":"\(createdAtISO)"}
            """
        }
        return JSONStub.decode("""
        {"success":true,"data":[\(items.joined(separator: ","))],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
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

    func test_loadMessages_marksConversationAsRead() async {
        let response: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
        mockMessageService.listResult = .success(response)
        let sut = makeSUT()
        // markAsRead routes through ConversationSyncEngine + the offline outbox;
        // the .conversationMarkedRead notification is its observable contract.
        let marked = expectation(forNotification: .conversationMarkedRead, object: nil) { notification in
            (notification.object as? String) == self.testConversationId
        }

        await sut.loadMessages()

        await fulfillment(of: [marked], timeout: 1.0)
    }

    // MARK: - syncMissedMessages (T9 — reconnect gap recovery via watermark)

    /// The backfill must ask the gateway for messages created *after* the
    /// newest message currently held locally — that high-water mark is what
    /// makes the recovery incremental and contiguous.
    func test_syncMissedMessages_usesNewestLocalMessageAsWatermark() async throws {
        let sut = makeSUT()
        let older = Date(timeIntervalSince1970: 1_750_000_000)
        let newest = older.addingTimeInterval(3600)
        sut.messages = [
            makeMessage(id: "m-old", createdAt: older),
            makeMessage(id: "m-new", createdAt: newest),
        ]
        mockMessageService.listAfterResult = .success(makeMessagesResponse())  // empty page → loop stops after 1 fetch

        await sut.syncMissedMessages()

        XCTAssertEqual(mockMessageService.listAfterCallCount, 1)
        XCTAssertEqual(mockMessageService.listCallCount, 0, "reconnect backfill must use the watermark path, not offset-based list()")
        let after = try XCTUnwrap(mockMessageService.lastListAfterAfter)
        // The watermark is the newest local message (modulo a sub-millisecond
        // tie backoff so a same-instant missed message isn't excluded by the
        // gateway's strict `createdAt > after`).
        XCTAssertLessThanOrEqual(after, newest)
        XCTAssertGreaterThan(after, newest.addingTimeInterval(-0.01))
    }

    /// The core bug fix: a missed-message gap larger than one page must be
    /// filled. The old code fetched `offset:0,limit:30` once and could never
    /// recover a >30-message gap. The watermark loop pages forward until a
    /// page comes back shorter than the page size.
    func test_syncMissedMessages_pagesForwardUntilGapSmallerThanPage() async {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "local-newest", createdAt: Date(timeIntervalSince1970: 1_750_000_000))]
        // First page is FULL (== the VM's 100-message page size) so the loop
        // must fetch again; the second page is partial so it then stops.
        mockMessageService.listAfterResults = [
            makeBackfillResponse(idPrefix: "p1", count: 100, createdAtISO: "2026-06-01T10:00:00.000Z"),
            makeBackfillResponse(idPrefix: "p2", count: 5, createdAtISO: "2026-06-01T11:00:00.000Z"),
        ]

        await sut.syncMissedMessages()

        XCTAssertEqual(mockMessageService.listAfterCallCount, 2, "must page past the first full page to fill a gap larger than one page")
        XCTAssertEqual(mockMessageService.listCallCount, 0, "must not fall back to offset-based list()")
    }

    /// With no local messages there is no high-water mark to backfill from —
    /// a full load happens on conversation open instead, so the reconnect
    /// path must no-op rather than refetch from the top.
    func test_syncMissedMessages_withNoLocalMessages_doesNotFetch() async {
        let sut = makeSUT()
        sut.messages = []

        await sut.syncMissedMessages()

        XCTAssertEqual(mockMessageService.listAfterCallCount, 0)
        XCTAssertEqual(mockMessageService.listCallCount, 0)
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

        // Trigger the send concurrently. The optimistic row surfaces in
        // `messages` through the GRDB -> MessageStore -> ViewModel pipeline,
        // which crosses several runloop hops — poll for the condition instead
        // of a fixed sleep (a 50 ms delay races the pipeline under load).
        let sendTask = Task {
            await sut.sendMessage(content: "Hello world")
        }

        let surfaced = await MessageStoreObservationHelper.awaitMessage(in: sut) {
            $0.content == "Hello world"
        }
        XCTAssertNotNil(surfaced, "Optimistic message must surface in `messages`")

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

    func test_sendMessage_failure_keepsOptimisticAsSlowForRetry() async {
        mockMessageService.sendResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Send failed"]))
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "Fail me")

        XCTAssertFalse(result)
        XCTAssertEqual(sut.messages.count, 1)
        // On failure the message is enqueued for retry (state `.queued`), which
        // surfaces as `.slow` ("Envoi lent") — distinct from a fresh `.sending`
        // clock — so the user can tell a struggling/retrying send from one that
        // just left. It is NOT removed and NOT `.failed` (retries remain).
        XCTAssertEqual(sut.messages.first?.deliveryStatus, .slow)
    }

    func test_sendMessage_surfacesOptimisticMessage() async {
        let sut = makeSUT()
        XCTAssertEqual(sut.messages.count, 0)

        _ = await sut.sendMessage(content: "Test")

        // The optimistic GRDB insert surfaces through the store observation
        // (notification → store refresh → @Published messages), which hops the
        // main runloop a couple of times — poll briefly rather than racing it.
        // The auto-scroll signal is now derived from the snapshot delta in
        // MessageListViewController, not a ViewModel counter.
        for _ in 0..<40 where sut.messages.isEmpty {
            try? await Task.sleep(nanoseconds: 25_000_000)
        }
        XCTAssertEqual(sut.messages.count, 1)
        XCTAssertEqual(sut.messages.first?.content, "Test")
    }

    func test_sendMessage_passesReplyToId() async {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "parent-msg", content: "Original", isMe: false)]

        _ = await sut.sendMessage(content: "Reply", replyToId: "parent-msg")

        XCTAssertEqual(mockMessageService.lastSendRequest?.replyToId, "parent-msg")
    }

    // MARK: - sendMessage Socket Fallback Tests

    func test_sendMessage_restFails_fallsBackToSocket() async {
        mockMessageService.sendResult = .failure(NSError(domain: "test", code: 500))
        mockMessageSocket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(
            messageId: "server-id-from-socket", clientMessageId: nil, createdAt: Date()
        )
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "Fallback me")

        XCTAssertTrue(result)
        XCTAssertEqual(mockMessageSocket.sendViaSocketFallbackCallCount, 1)
    }

    func test_sendMessage_restSucceeds_skipsSocketFallback() async {
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "Plain send")

        XCTAssertTrue(result)
        XCTAssertEqual(mockMessageSocket.sendViaSocketFallbackCallCount, 0)
    }

    // MARK: - sendMessage Socket-First Fast Path

    func test_sendMessage_socketConnected_plainText_usesSocketFirst_skipsRest() async {
        // Socket-first fast path: a connected socket ACKs `message:send` before
        // the REST POST is ever attempted (avoids the 10-30s slow-cellular POST).
        mockMessageSocket.isConnected = true
        mockMessageSocket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(
            messageId: "server-id-socket-first", clientMessageId: nil, createdAt: Date()
        )
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "Fast via socket")

        XCTAssertTrue(result)
        XCTAssertEqual(mockMessageSocket.sendViaSocketFallbackCallCount, 1, "socket-first sends via the socket")
        XCTAssertEqual(mockMessageService.sendCallCount, 0, "REST is not called when the socket ACKs first")
    }

    func test_sendMessage_socketConnectedButNoAck_fallsThroughToRest() async {
        // Socket connected but no ACK (nil) → fall straight through to the REST
        // POST with the SAME clientMessageId. Both transports attempted once.
        mockMessageSocket.isConnected = true
        mockMessageSocket.sendViaSocketFallbackResult = nil
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "Socket miss then REST")

        XCTAssertTrue(result)
        XCTAssertEqual(mockMessageSocket.sendViaSocketFallbackCallCount, 1, "socket-first was attempted")
        XCTAssertEqual(mockMessageService.sendCallCount, 1, "REST is the fallback on a socket miss")
    }

    // MARK: - Conversation-list optimistic preview

    func test_optimisticListPreview_text_returnsTheText() {
        XCTAssertEqual(ConversationViewModel.optimisticListPreview(text: "Salut", messageType: .text), "Salut")
    }

    func test_optimisticListPreview_captionedMedia_prefersTheCaption() {
        // A media message WITH a caption shows the caption, not the media label.
        XCTAssertEqual(ConversationViewModel.optimisticListPreview(text: "Regarde", messageType: .image), "Regarde")
    }

    func test_optimisticListPreview_captionlessMedia_returnsMediaLabel() {
        XCTAssertEqual(ConversationViewModel.optimisticListPreview(text: "", messageType: .image), "📷 Photo")
        XCTAssertEqual(ConversationViewModel.optimisticListPreview(text: "", messageType: .video), "🎥 Vidéo")
        XCTAssertEqual(ConversationViewModel.optimisticListPreview(text: "", messageType: .audio), "🎙️ Message vocal")
        XCTAssertEqual(ConversationViewModel.optimisticListPreview(text: "", messageType: .file), "📎 Fichier")
        XCTAssertEqual(ConversationViewModel.optimisticListPreview(text: "", messageType: .location), "📍 Position")
    }

    func test_sendMessage_restAndSocketBothFail_returnsFalse() async {
        mockMessageService.sendResult = .failure(NSError(domain: "test", code: 500))
        mockMessageSocket.sendViaSocketFallbackResult = nil
        let sut = makeSUT()

        let result = await sut.sendMessage(content: "Both down")

        XCTAssertFalse(result)
        XCTAssertEqual(mockMessageSocket.sendViaSocketFallbackCallCount, 1)
    }

    func test_sendMessage_socketFallbackReusesOptimisticClientMessageId() async {
        mockMessageService.sendResult = .failure(NSError(domain: "test", code: 500))
        mockMessageSocket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(
            messageId: "server-id", clientMessageId: nil, createdAt: nil
        )
        let sut = makeSUT()

        _ = await sut.sendMessage(content: "Dedup key check")

        // The fallback MUST reuse the cid_<uuid> optimistic id so the gateway
        // dedup (conversationId, clientMessageId) prevents a duplicate when the
        // outbox later replays the REST request.
        let cid = mockMessageSocket.lastSendViaSocketFallbackClientMessageId
        XCTAssertNotNil(cid)
        XCTAssertEqual(cid?.hasPrefix("cid_"), true)
    }

    // MARK: - insertOptimisticMediaMessage Tests
    //
    // Regression guards for the disappearing-bubble bug. The contract:
    // 1. Calling the helper must persist a MessageRecord through GRDB so the
    //    row survives any subsequent MessageStore observation refresh
    //    (otherwise the bubble would only live in `messages` for one tick).
    // 2. The persisted row must carry the local file:// attachments so the
    //    bubble can render the image/audio immediately, including offline.
    // 3. The originalLanguage must NOT be hardcoded (Prisme Linguistique).

    func test_insertOptimisticMediaMessage_persistsRecordToGRDB() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let imageAttachment = MeeshyMessageAttachment(
            id: "att_image_001",
            mimeType: "image/jpeg",
            fileUrl: "file:///tmp/photo.jpg",
            uploadedBy: testUserId
        )
        let tempId = "temp_\(UUID().uuidString)"

        sut.insertOptimisticMediaMessage(
            tempId: tempId,
            content: "Caption",
            attachments: [imageAttachment],
            messageType: .image,
            replyToId: nil,
            originalLanguage: "es"
        )

        // The helper writes via Task.detached — wait for the row to land.
        let record = await MessageStoreObservationHelper.awaitRecord(
            localId: tempId,
            from: pool
        ) { _ in true }

        XCTAssertNotNil(record, "Optimistic media row must reach GRDB")
        XCTAssertEqual(record?.localId, tempId)
        XCTAssertEqual(record?.state, .sending)
        XCTAssertEqual(record?.messageType, "image")
        XCTAssertEqual(record?.contentType, "image", "contentType must mirror messageType, not be hardcoded to 'text'")
        XCTAssertEqual(record?.originalLanguage, "es", "originalLanguage must come from the caller, not be hardcoded to 'fr'")
        XCTAssertEqual(record?.content, "Caption")
        XCTAssertNotNil(record?.attachmentsJson, "Local attachments must be serialized into attachmentsJson")

        let decoded = try JSONDecoder().decode([MeeshyMessageAttachment].self, from: record!.attachmentsJson!)
        XCTAssertEqual(decoded.count, 1)
        XCTAssertEqual(decoded.first?.id, "att_image_001")
        XCTAssertEqual(decoded.first?.fileUrl, "file:///tmp/photo.jpg")
    }

    // MARK: - Attachment Reactions (BUG2 A')

    private func makeImageMessage(id: String = "m1", attachmentId: String = "a1") -> Message {
        var msg = makeMessage(id: id)
        msg.attachments = [MeeshyMessageAttachment(
            id: attachmentId, mimeType: "image/jpeg", fileUrl: "file:///x.jpg", uploadedBy: testUserId
        )]
        return msg
    }

    func test_toggleAttachmentReaction_addsOptimistically_andEmits() throws {
        let pool = try makeInMemoryPool()
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)))
        sut.messages = [makeImageMessage()]

        sut.toggleAttachmentReaction(attachmentId: "a1", messageId: "m1", emoji: "❤️")

        let att = sut.messages.first?.attachments.first
        XCTAssertEqual(att?.reactionSummary?["❤️"], 1)
        XCTAssertEqual(att?.currentUserReactions, ["❤️"])
        XCTAssertEqual(mockMessageSocket.addAttachmentReactionCallCount, 1)
    }

    func test_toggleAttachmentReaction_secondTapSameEmoji_removes() throws {
        let pool = try makeInMemoryPool()
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)))
        sut.messages = [makeImageMessage()]

        sut.toggleAttachmentReaction(attachmentId: "a1", messageId: "m1", emoji: "❤️")
        sut.toggleAttachmentReaction(attachmentId: "a1", messageId: "m1", emoji: "❤️")

        let att = sut.messages.first?.attachments.first
        XCTAssertNil(att?.reactionSummary)
        XCTAssertNil(att?.currentUserReactions)
        XCTAssertEqual(mockMessageSocket.removeAttachmentReactionCallCount, 1)
    }

    func test_toggleAttachmentReaction_capsAtOneEmojiPerUser() throws {
        let pool = try makeInMemoryPool()
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)))
        sut.messages = [makeImageMessage()]

        sut.toggleAttachmentReaction(attachmentId: "a1", messageId: "m1", emoji: "❤️")
        sut.toggleAttachmentReaction(attachmentId: "a1", messageId: "m1", emoji: "👍")

        let att = sut.messages.first?.attachments.first
        XCTAssertNil(att?.reactionSummary?["❤️"])
        XCTAssertEqual(att?.reactionSummary?["👍"], 1)
        XCTAssertEqual(att?.currentUserReactions, ["👍"])
    }

    func test_applyAttachmentReactionDelta_replacesSummary() throws {
        let pool = try makeInMemoryPool()
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)))
        sut.messages = [makeImageMessage()]

        sut.applyAttachmentReactionDelta(attachmentId: "a1", reactionSummary: ["👍": 3])

        XCTAssertEqual(sut.messages.first?.attachments.first?.reactionSummary?["👍"], 3)
    }

    // Regression guard (GAP #1): an attachment reaction must be written through
    // GRDB so it survives a cold reload. Before the fix the pill lived only in
    // the in-memory `messages` array and was lost on the next conversation load.
    func test_toggleAttachmentReaction_persistsReactionSummaryToGRDB() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        // Seed a delivered message row carrying the image attachment so the row
        // exists for `updateAttachmentsJson` to update and surfaces in the VM.
        let record = MessageStoreObservationHelper.makeRecord(
            localId: "m1", conversationId: testConversationId, senderId: testUserId
        )
        try await persistence.insertOptimistic(record)
        let attachment = MeeshyMessageAttachment(
            id: "a1", mimeType: "image/jpeg", fileUrl: "file:///x.jpg", uploadedBy: testUserId
        )
        try await persistence.updateAttachmentsJson(
            localId: "m1", attachmentsJson: try JSONEncoder().encode([attachment])
        )
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) {
            $0.id == "m1" && !$0.attachments.isEmpty
        }

        sut.toggleAttachmentReaction(attachmentId: "a1", messageId: "m1", emoji: "❤️")

        // The write-through runs in a fire-and-forget Task; poll GRDB until it lands.
        var persistedSummary: [String: Int]?
        let deadline = Date().addingTimeInterval(1.5)
        while Date() < deadline {
            if let json = try await MessageStoreObservationHelper.fetchRecord(localId: "m1", from: pool)?.attachmentsJson,
               let atts = try? JSONDecoder().decode([MeeshyMessageAttachment].self, from: json),
               let summary = atts.first?.reactionSummary {
                persistedSummary = summary
                break
            }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }
        XCTAssertEqual(persistedSummary?["❤️"], 1, "Attachment reaction must be persisted to GRDB to survive a reload")
    }

    func test_insertOptimisticMediaMessage_surfacesBubbleInViewModel() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let audioAttachment = MeeshyMessageAttachment(
            id: "att_audio_001",
            mimeType: "audio/mp4",
            fileUrl: "file:///tmp/voice.m4a",
            duration: 3500,
            uploadedBy: testUserId
        )
        let tempId = "temp_\(UUID().uuidString)"

        sut.insertOptimisticMediaMessage(
            tempId: tempId,
            content: "",
            attachments: [audioAttachment],
            messageType: .audio,
            replyToId: nil,
            originalLanguage: "fr"
        )

        let surfaced = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == tempId }

        XCTAssertNotNil(surfaced, "Store observation must surface the optimistic bubble")
        XCTAssertEqual(surfaced?.deliveryStatus, .sending)
        XCTAssertEqual(surfaced?.messageType, .audio)
        XCTAssertEqual(surfaced?.attachments.count, 1)
        XCTAssertEqual(surfaced?.attachments.first?.fileUrl, "file:///tmp/voice.m4a")
    }

    func test_insertOptimisticMediaMessage_emptyAttachments_persistsNilJson() async throws {
        // Edge case: caller decides to use the helper for a content-only path.
        // Should still produce a valid row but with attachmentsJson = nil
        // (so we don't store an empty `[]` blob taking disk space).
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let tempId = "temp_\(UUID().uuidString)"

        sut.insertOptimisticMediaMessage(
            tempId: tempId,
            content: "Just text",
            attachments: [],
            messageType: .text,
            replyToId: nil,
            originalLanguage: "en"
        )

        let record = await MessageStoreObservationHelper.awaitRecord(
            localId: tempId,
            from: pool
        ) { _ in true }

        XCTAssertNotNil(record)
        XCTAssertNil(record?.attachmentsJson, "Empty attachments must serialize to nil, not Data([])")
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

    /// S11 — a "Delete for me" hide keyed on a temp id must follow the
    /// temp->server reconciliation, so the hidden message stays hidden instead
    /// of reappearing once its display id flips to the server id.
    func test_persistMessagesUsingServerIds_migratesHiddenTempIdToServerId() async {
        let sut = makeSUT(conversationId: "c_s11")
        LocallyHiddenMessagesStore.shared.clearAll()
        defer { LocallyHiddenMessagesStore.shared.clearAll() }
        LocallyHiddenMessagesStore.shared.hide("temp_s11")
        sut.pendingServerIds = ["temp_s11": "srv_s11"]

        await sut.persistMessagesUsingServerIds()

        XCTAssertFalse(LocallyHiddenMessagesStore.shared.isHidden("temp_s11"),
            "the temp id must be migrated away once reconciled")
        XCTAssertTrue(LocallyHiddenMessagesStore.shared.isHidden("srv_s11"),
            "the hidden state must follow temp->server so the message stays hidden")
    }

    /// S7 — an optimistic media bubble whose upload/send fails must flip to
    /// `.failed` (retryable) rather than stay a permanent `.sending` ghost.
    func test_markOptimisticMediaFailed_flipsRowToFailed() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))
        let record = MessageStoreObservationHelper.makeRecord(
            localId: "media-s7", conversationId: testConversationId,
            senderId: testUserId, content: ""
        )
        try await persistence.insertOptimistic(record)

        await sut.markOptimisticMediaFailed(tempId: "media-s7", reason: "upload failed")

        let row = try await MessageStoreObservationHelper.fetchRecord(localId: "media-s7", from: pool)
        XCTAssertEqual(row?.state, .failed,
            "a failed-upload media bubble must flip to .failed, not stay .sending")
        XCTAssertEqual(row?.lastError, "upload failed")
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

    /// End-to-end ownership lock: tapping a reaction must surface it as MINE in
    /// the badge. The optimistic row is keyed by the `currentUserId` sentinel
    /// (never the resolved `Participant.id`), so `summarizeReactions` — whose
    /// ownership check is `participantId == currentUserId` — marks it
    /// `includesMe`. Guards the regression where the 2nd+ reaction in a
    /// conversation was keyed by `Participant.id` and lost its highlight.
    @MainActor
    func test_toggleReaction_ownReaction_isHighlightedAsMine() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-mine", conversationId: testConversationId,
            senderId: "other-user", content: "React to me"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-mine" }

        sut.toggleReaction(messageId: "msg-mine", emoji: "thumbsup")

        let updated = await MessageStoreObservationHelper.awaitRecord(
            localId: "msg-mine", from: pool
        ) { record in
            let reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                                       from: record.reactionsJson ?? Data())) ?? []
            return reactions.contains { $0.emoji == "thumbsup" }
        }
        let reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                                   from: updated?.reactionsJson ?? Data())) ?? []

        let summaries = BubbleContent.summarizeReactions(reactions, currentUserId: testUserId)
        let thumbs = summaries.first { $0.emoji == "thumbsup" }
        XCTAssertEqual(thumbs?.includesMe, true, "my own reaction must render highlighted as mine")
        XCTAssertEqual(thumbs?.count, 1, "a single tap counts once")
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

    /// Modèle 1-réaction-par-user (miroir attachment-level + serveur) : poser un
    /// emoji DIFFÉRENT remplace ma réaction précédente au lieu de l'empiler.
    /// Les réactions des AUTRES participants ne sont jamais touchées.
    func test_toggleReaction_differentEmoji_replacesPreviousOwnReaction() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let myPrevious = MeeshyReaction(
            messageId: "msg-swap", participantId: testUserId, emoji: "heart"
        )
        let someoneElses = MeeshyReaction(
            messageId: "msg-swap", participantId: "other-user", emoji: "heart"
        )
        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-swap", conversationId: testConversationId,
            senderId: "other-user", content: "Swap my reaction",
            reactions: [myPrevious, someoneElses]
        )
        try await persistence.insertOptimistic(record)
        let seeded = await MessageStoreObservationHelper.awaitMessageProperty(
            id: "msg-swap", in: sut
        ) { msg in msg.reactions.count == 2 }
        XCTAssertTrue(seeded, "Seed reactions must surface via store observation")

        sut.toggleReaction(messageId: "msg-swap", emoji: "thumbsup")

        let updated = await MessageStoreObservationHelper.awaitRecord(
            localId: "msg-swap", from: pool
        ) { record in
            let reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                                       from: record.reactionsJson ?? Data())) ?? []
            let mine = reactions.filter { $0.participantId == self.testUserId }
            return mine.map(\.emoji) == ["thumbsup"]
        }
        XCTAssertNotNil(updated, "my previous emoji must be swapped out, not stacked")
        let reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                                   from: updated?.reactionsJson ?? Data())) ?? []
        XCTAssertTrue(
            reactions.contains { $0.participantId == "other-user" && $0.emoji == "heart" },
            "another participant's reaction must survive my swap"
        )
    }

    func test_toggleReaction_systemMessage_isIgnored() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let record = MessageStoreObservationHelper.makeRecord(
            localId: "msg-system", conversationId: testConversationId,
            senderId: "other-user", content: "Call ended",
            messageSource: "system"
        )
        try await persistence.insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "msg-system" }

        sut.toggleReaction(messageId: "msg-system", emoji: "thumbsup")

        try? await Task.sleep(nanoseconds: 200_000_000)
        let stable = try await MessageStoreObservationHelper.fetchRecord(
            localId: "msg-system", from: pool
        )
        XCTAssertNil(stable?.reactionsJson, "system messages must not accept reactions")
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

    // MARK: - Search Pagination Tests

    func test_searchMessages_withHasMore_setsSearchHasMoreTrue() async {
        let firstPageResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-p1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello world","createdAt":"2026-01-01T00:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}}
        ],"pagination":null,"cursorPagination":{"hasMore":true,"nextCursor":"cursor-abc123","limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(firstPageResponse)
        let sut = makeSUT()

        await sut.searchMessages(query: "Hello")

        XCTAssertTrue(sut.searchHasMore, "searchHasMore must be true when server signals hasMore=true")
        XCTAssertEqual(sut.searchResults.count, 1)
    }

    func test_loadMoreSearchResults_appendsNextPageToExistingResults() async {
        let firstPageResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-page1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello page one","createdAt":"2026-01-01T00:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}}
        ],"pagination":null,"cursorPagination":{"hasMore":true,"nextCursor":"cursor-page2","limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(firstPageResponse)
        let sut = makeSUT()
        await sut.searchMessages(query: "Hello")
        XCTAssertEqual(sut.searchResults.count, 1)
        XCTAssertTrue(sut.searchHasMore)

        let secondPageResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-page2","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello page two","createdAt":"2026-01-01T01:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}}
        ],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":20},"hasNewer":null}
        """)
        mockMessageService.searchWithCursorResult = .success(secondPageResponse)

        await sut.loadMoreSearchResults(query: "Hello")

        XCTAssertEqual(sut.searchResults.count, 2, "loadMore must append second page results to existing ones")
        XCTAssertFalse(sut.searchHasMore, "searchHasMore must be false when server returns hasMore=false on last page")
        XCTAssertEqual(mockMessageService.searchWithCursorCallCount, 1, "searchWithCursor must be called exactly once for the second page")
    }

    func test_loadMoreSearchResults_whenSearchHasMoreFalse_isNoOp() async {
        let singlePageResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-only","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello only page","createdAt":"2026-01-01T00:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}}
        ],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(singlePageResponse)
        let sut = makeSUT()
        await sut.searchMessages(query: "Hello")
        XCTAssertFalse(sut.searchHasMore)
        let countAfterFirstPage = sut.searchResults.count

        await sut.loadMoreSearchResults(query: "Hello")

        XCTAssertEqual(sut.searchResults.count, countAfterFirstPage, "loadMore when no more pages must not modify results")
        XCTAssertEqual(mockMessageService.searchWithCursorCallCount, 0, "searchWithCursor must not be called when there is no cursor")
    }

    func test_loadMoreSearchResults_setsIsSearchingFalseAfterCompletion() async {
        let firstPageResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-lm1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello loadmore","createdAt":"2026-01-01T00:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}}
        ],"pagination":null,"cursorPagination":{"hasMore":true,"nextCursor":"cursor-lm2","limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(firstPageResponse)
        let sut = makeSUT()
        await sut.searchMessages(query: "Hello")

        let emptyNextPage: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":20},"hasNewer":null}
        """)
        mockMessageService.searchWithCursorResult = .success(emptyNextPage)

        await sut.loadMoreSearchResults(query: "Hello")

        XCTAssertFalse(sut.isSearching, "isSearching must be false once loadMoreSearchResults completes")
    }

    func test_loadMoreSearchResults_onNetworkFailure_preservesExistingResultsAndHasMore() async {
        let firstPageResponse: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"sr-fail1","conversationId":"\(testConversationId)","senderId":"\(testUserId)","content":"Hello fail test","createdAt":"2026-01-01T00:00:00.000Z","sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"}}
        ],"pagination":null,"cursorPagination":{"hasMore":true,"nextCursor":"cursor-fail","limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(firstPageResponse)
        let sut = makeSUT()
        await sut.searchMessages(query: "Hello")
        XCTAssertEqual(sut.searchResults.count, 1)

        mockMessageService.searchWithCursorResult = .failure(NSError(domain: "test", code: -1009))
        await sut.loadMoreSearchResults(query: "Hello")

        XCTAssertEqual(sut.searchResults.count, 1,
            "loadMore network failure must not remove existing search results")
        XCTAssertTrue(sut.searchHasMore,
            "searchHasMore must remain true after a transient loadMore failure so the user can retry by scrolling")
        XCTAssertFalse(sut.isSearching,
            "isSearching must be false even after a loadMore failure")
    }

    func test_searchMessages_translationMatch_surfacesTranslationAsMatchedText() async {
        let responseWithTranslation: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {
                "id":"sr-tr1",
                "conversationId":"\(testConversationId)",
                "senderId":"\(testUserId)",
                "content":"Bonjour le monde",
                "createdAt":"2026-01-01T00:00:00.000Z",
                "sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"},
                "translations":[
                    {"id":"tl-1","messageId":"sr-tr1","targetLanguage":"en","translatedContent":"Hello world","translationModel":"nllb","confidenceScore":null,"sourceLanguage":"fr"}
                ]
            }
        ],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(responseWithTranslation)
        let sut = makeSUT()

        await sut.searchMessages(query: "Hello")

        XCTAssertEqual(sut.searchResults.count, 1)
        let result = sut.searchResults.first
        XCTAssertEqual(result?.id, "sr-tr1")
        XCTAssertEqual(result?.matchedText, "Hello world",
            "matchedText must use the translation when content does not match the query but a translation does")
        XCTAssertEqual(result?.matchType, "translation",
            "matchType must be 'translation' when the match is in a translated version of the content")
    }

    func test_searchMessages_contentMatch_usesContentAsMatchedText() async {
        let responseWithMatchingContent: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {
                "id":"sr-ct1",
                "conversationId":"\(testConversationId)",
                "senderId":"\(testUserId)",
                "content":"Hello direct match",
                "createdAt":"2026-01-01T00:00:00.000Z",
                "sender":{"id":"\(testUserId)","username":"testuser","displayName":"Test User"},
                "translations":[
                    {"id":"tl-ct1","messageId":"sr-ct1","targetLanguage":"fr","translatedContent":"Bonjour correspondance directe","translationModel":"nllb","confidenceScore":null,"sourceLanguage":"en"}
                ]
            }
        ],"pagination":null,"cursorPagination":{"hasMore":false,"nextCursor":null,"limit":20},"hasNewer":null}
        """)
        mockMessageService.searchResult = .success(responseWithMatchingContent)
        let sut = makeSUT()

        await sut.searchMessages(query: "Hello")

        let result = sut.searchResults.first
        XCTAssertEqual(result?.matchedText, "Hello direct match",
            "matchedText must use the original content when content matches the query, even if translations are present")
        XCTAssertEqual(result?.matchType, "content")
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

    // MARK: - withSendTimeout (S1 — send-clock latency cap)

    func test_withSendTimeout_fastOperation_returnsValue() async throws {
        let result = try await withSendTimeout(seconds: 5) { () async throws -> Int in
            return 42
        }
        XCTAssertEqual(result, 42)
    }

    func test_withSendTimeout_slowOperation_cancelsAndThrows() async {
        do {
            _ = try await withSendTimeout(seconds: 0.05) { () async throws -> Int in
                // Far longer than the 50ms cap — the watchdog must cancel it.
                try await Task.sleep(nanoseconds: 5_000_000_000)
                return 1
            }
            XCTFail("Expected the timed-out operation to be cancelled and rethrow")
        } catch is CancellationError {
            // Expected: the watchdog cancelled the operation task, whose
            // `Task.sleep` surfaces a CancellationError that `.value` rethrows.
        } catch {
            XCTFail("Expected CancellationError, got \(error)")
        }
    }

    // MARK: - mergeIntoMessages duplicate prevention

    /// When a server ACK arrives, the message's display id transitions from
    /// localId ("cid_123") to serverId ("srv_abc") via toMessage(). Without
    /// the pendingServerIds guard in mergeIntoMessages, both the old optimistic
    /// row (id="cid_123") and the acked row (id="srv_abc") survive in messages,
    /// producing a duplicate bubble. After the fix, only the server-id version
    /// must remain.
    func test_mergeIntoMessages_afterServerAck_noDuplicateBubble() async throws {
        let pool = try makeInMemoryPool()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let sut = makeSUT(dependencies: ConversationDependencies(dbPool: pool, persistence: persistence))

        let tempId = "cid_merge_dedup_test"
        let serverId = "srv_merge_dedup_test"

        // Seed an optimistic row: localId=tempId, serverId=nil → id=tempId in domain
        let record = MessageStoreObservationHelper.makeRecord(
            localId: tempId,
            conversationId: testConversationId,
            senderId: testUserId,
            state: .sending
        )
        try await persistence.insertOptimistic(record)

        // Wait for the optimistic message to surface with id=tempId
        let appeared = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == tempId }
        XCTAssertNotNil(appeared, "Optimistic row must surface with id=tempId before the ACK")

        // Register the tempId → serverId mapping BEFORE applyEvent (mirrors the
        // real send path where pendingServerIds is set synchronously before the
        // async applyEvent task).
        sut.pendingServerIds[tempId] = serverId

        // Apply serverAck: GRDB row.serverId becomes serverId → toMessage id flips
        _ = try await persistence.applyEvent(localId: tempId, event: .serverAck(serverId: serverId, at: Date()))

        // Wait until the server-id version surfaces
        let acked = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == serverId }
        XCTAssertNotNil(acked, "After ACK the message must surface with id=serverId")

        // The critical assertion: exactly ONE bubble — no duplicate cid_* row
        let count = sut.messages.filter {
            $0.id == tempId || $0.id == serverId
        }.count
        XCTAssertEqual(count, 1,
            "mergeIntoMessages must suppress the superseded optimistic row — expected 1 bubble, got \(count)")
    }

    // MARK: - Helpers

    private func makeInMemoryPool() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }
}
