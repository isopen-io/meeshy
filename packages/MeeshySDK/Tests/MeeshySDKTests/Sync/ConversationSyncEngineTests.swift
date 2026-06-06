import XCTest
import Combine
import GRDB
@testable import MeeshySDK

final class ConversationSyncEngineTests: XCTestCase {

    private var mockAPI: MockAPIClient!
    private var mockConvService: MockConversationService!
    private var mockMsgService: MockMessageService!
    private var mockMessageSocket: MockMessageSocket!
    private var mockSocialSocket: MockSocialSocket!
    private var engine: ConversationSyncEngine!
    private var cancellables = Set<AnyCancellable>()

    override func setUp() {
        super.setUp()
        mockAPI = MockAPIClient()
        mockConvService = MockConversationService()
        mockMsgService = MockMessageService()
        mockMessageSocket = MockMessageSocket()
        mockSocialSocket = MockSocialSocket()

        engine = ConversationSyncEngine(
            cache: .shared,
            conversationService: mockConvService,
            messageService: mockMsgService,
            messageSocket: mockMessageSocket,
            socialSocket: mockSocialSocket,
            api: mockAPI
        )
    }

    override func tearDown() {
        cancellables.removeAll()
        mockAPI.reset()
        mockConvService.reset()
        mockMsgService.reset()
        super.tearDown()
    }

    // MARK: - T12: full-sync interior-gap recovery

    /// An interior page that fails the whole fan-out (all 3 retries) while a
    /// later page succeeds used to be swallowed: the partial list was cached and
    /// the sequential tail started at `merged.count`, beyond the hole. fullSync
    /// must re-fetch the dropped page so the cached list is provably complete.
    func test_fullSync_refetchesDroppedInteriorPage_fillsTheGap() async throws {
        let db = try DatabaseQueue()
        try AppDatabase.runMigrations(on: db)
        let testCache = CacheCoordinator(messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(), db: db)

        let gap = GapMockConversationService()
        gap.pagesByOffset = [
            0: (0..<100).map { TestFactories.makeAPIConversation(id: "p0-\($0)") },
            100: (0..<100).map { TestFactories.makeAPIConversation(id: "p1-\($0)") },
            200: (0..<50).map { TestFactories.makeAPIConversation(id: "p2-\($0)") }
        ]
        gap.advertisedTotal = 250
        // Page 1 (offset 100) fails all three fan-out attempts, then recovers on
        // the targeted re-fetch — exactly the transient-window scenario.
        gap.failTimesRemaining = [100: 3]

        let engine = ConversationSyncEngine(
            cache: testCache,
            conversationService: gap,
            messageService: MockMessageService(),
            messageSocket: MockMessageSocket(),
            socialSocket: MockSocialSocket(),
            api: MockAPIClient()
        )

        let ok = await engine.fullSync()

        let cached = await testCache.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(cached.count, 250,
                       "fullSync must re-fetch the dropped interior page so the cached list is complete")
        let ids = Set(cached.map(\.id))
        XCTAssertTrue(ids.contains("p1-0") && ids.contains("p1-99"),
                      "the dropped page's conversations must be present after recovery")
        XCTAssertTrue(ok, "fullSync should report success once the targeted re-fetch recovers the dropped page")
    }

    // MARK: - fullSync

    func test_fullSync_callsConversationServiceList() async {
        let apiConv = TestFactories.makeAPIConversation(id: "conv-1")
        let pagination = OffsetPagination(total: 1, hasMore: false, limit: 100, offset: 0)
        let response = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [apiConv], pagination: pagination, error: nil
        )
        mockConvService.listResult = .success(response)

        await engine.fullSync()

        XCTAssertGreaterThanOrEqual(mockConvService.listCallCount, 1)
    }

    func test_fullSync_emitsConversationsDidChange() async {
        let pagination = OffsetPagination(total: 0, hasMore: false, limit: 100, offset: 0)
        let response = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [], pagination: pagination, error: nil
        )
        mockConvService.listResult = .success(response)

        let expectation = expectation(description: "conversationsDidChange emitted")
        engine.conversationsDidChange
            .first()
            .sink { expectation.fulfill() }
            .store(in: &cancellables)

        await engine.fullSync()

        await fulfillment(of: [expectation], timeout: 2.0)
    }

    func test_fullSync_whenError_doesNotCrash() async {
        mockConvService.listResult = .failure(MeeshyError.network(.timeout))

        await engine.fullSync()

        // fetchPageWithRetry retries up to 3 times (attempt 0, 1, 2) on
        // transient errors, so the service is called 3 times before giving up.
        XCTAssertEqual(mockConvService.listCallCount, 3)
    }

    func test_fullSync_onSuccess_returnsTrue() async {
        let pagination = OffsetPagination(total: 0, hasMore: false, limit: 100, offset: 0)
        let response = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [], pagination: pagination, error: nil
        )
        mockConvService.listResult = .success(response)

        let ok = await engine.fullSync()

        XCTAssertTrue(ok)
    }

    func test_fullSync_onError_returnsFalse() async {
        mockConvService.listResult = .failure(MeeshyError.network(.timeout))

        let ok = await engine.fullSync()

        XCTAssertFalse(ok, "Callers must be able to distinguish a failed cold sync so the UI can offer a retry")
    }

    // MARK: - syncSinceLastCheckpoint

    func test_syncSinceLastCheckpoint_callsAPIRequest() async {
        let pagination = OffsetPagination(total: 0, hasMore: false, limit: 500, offset: 0)
        let response = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [], pagination: pagination, error: nil
        )
        mockAPI.stub("/conversations", result: response)

        await engine.syncSinceLastCheckpoint()

        XCTAssertEqual(mockAPI.requestCount, 1)
        XCTAssertEqual(mockAPI.lastRequest?.endpoint, "/conversations")
    }

    func test_syncSinceLastCheckpoint_emitsConversationsDidChange() async {
        let pagination = OffsetPagination(total: 0, hasMore: false, limit: 500, offset: 0)
        let response = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: [], pagination: pagination, error: nil
        )
        mockAPI.stub("/conversations", result: response)

        let expectation = expectation(description: "conversationsDidChange emitted")
        engine.conversationsDidChange
            .first()
            .sink { expectation.fulfill() }
            .store(in: &cancellables)

        await engine.syncSinceLastCheckpoint()

        await fulfillment(of: [expectation], timeout: 2.0)
    }

    // MARK: - ensureMessages

    func test_ensureMessages_callsMessageServiceList() async {
        let apiMsg = TestFactories.makeAPIMessage(conversationId: "conv-1")
        let response = MessagesAPIResponse(
            success: true, data: [apiMsg], pagination: nil,
            cursorPagination: nil, hasNewer: nil, meta: nil
        )
        mockMsgService.listResult = .success(response)

        // Invalidate cache first to force a fetch
        await CacheCoordinator.shared.messages.invalidate(for: "conv-1")

        await engine.ensureMessages(for: "conv-1")

        XCTAssertGreaterThanOrEqual(mockMsgService.listCallCount, 1)
    }

    func test_ensureMessages_emitsMessagesDidChange() async {
        let apiMsg = TestFactories.makeAPIMessage(conversationId: "conv-1")
        let response = MessagesAPIResponse(
            success: true, data: [apiMsg], pagination: nil,
            cursorPagination: nil, hasNewer: nil, meta: nil
        )
        mockMsgService.listResult = .success(response)

        await CacheCoordinator.shared.messages.invalidate(for: "conv-1")

        let expectation = expectation(description: "messagesDidChange emitted")
        engine.messagesDidChange
            .first()
            .sink { convId in
                XCTAssertEqual(convId, "conv-1")
                expectation.fulfill()
            }
            .store(in: &cancellables)

        await engine.ensureMessages(for: "conv-1")

        await fulfillment(of: [expectation], timeout: 2.0)
    }

    func test_ensureMessages_force_alwaysRefetchesAcrossConsecutiveCalls() async {
        // A non-forced ensure has a `.fresh` short-circuit: a second call on a
        // cache the first call just populated would normally NOT refetch. The
        // forced path (push-driven) must bypass that short-circuit, so two
        // consecutive `force: true` calls BOTH hit the network — proving the
        // bypass without coupling to mergeUpdate's exact freshness timing.
        let apiMsg = TestFactories.makeAPIMessage(conversationId: "conv-force")
        let response = MessagesAPIResponse(
            success: true, data: [apiMsg], pagination: nil,
            cursorPagination: nil, hasNewer: nil, meta: nil
        )
        mockMsgService.listResult = .success(response)
        await CacheCoordinator.shared.messages.invalidate(for: "conv-force")

        let before = mockMsgService.listCallCount
        await engine.ensureMessages(for: "conv-force", force: true)
        await engine.ensureMessages(for: "conv-force", force: true)

        XCTAssertEqual(
            mockMsgService.listCallCount, before + 2,
            "force:true must bypass the fresh-cache short-circuit and refetch every time"
        )
    }

    // MARK: - Socket relay

    func test_startSocketRelay_subscribesToMessageEvents() async {
        await engine.startSocketRelay()

        // Verify that sending a message event is handled (doesn't crash)
        let apiMsg = TestFactories.makeAPIMessage(conversationId: "conv-relay")
        mockMessageSocket.messageReceived.send(apiMsg)

        // Small delay for async processing
        try? await Task.sleep(nanoseconds: 100_000_000)

        // If we get here without crash, relay is working
    }

    func test_stopSocketRelay_clearsSubscriptions() async {
        await engine.startSocketRelay()
        await engine.stopSocketRelay()

        // After stopping, events should not be processed (no crash)
        let apiMsg = TestFactories.makeAPIMessage(conversationId: "conv-stopped")
        mockMessageSocket.messageReceived.send(apiMsg)

        try? await Task.sleep(nanoseconds: 100_000_000)
    }

    // MARK: - Total Unread Aggregator (cross-conversation)

    /// The sync engine must expose a CurrentValueSubject that aggregates the
    /// total `unreadCount` across all cached conversations. UI surfaces such
    /// as the back-button cross-conversation pill subscribe to it without
    /// re-implementing the reduce themselves.
    func test_totalConversationsUnreadValue_isZero_whenCacheEmpty() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")

        XCTAssertEqual(engine.totalConversationsUnreadValue, 0)
    }

    /// When the socket signals a single-conversation unread change, the
    /// aggregator MUST re-sum every cached conversation (not just delta the
    /// previous total). This guarantees correctness when the cache mutates
    /// from other code paths (delta sync, optimistic writes) between events.
    func test_totalConversationsUnread_publishesSumOfAllConversations_afterUnreadUpdatedEvent() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([
            ("unread-agg-c1", 2),
            ("unread-agg-c2", 5),
            ("unread-agg-c3", 0)
        ])

        await engine.startSocketRelay()

        let exp = expectation(description: "total unread published after event")
        var observed = [Int]()
        engine.totalConversationsUnread
            .sink { value in
                observed.append(value)
                if observed.count >= 2 { exp.fulfill() }
            }
            .store(in: &cancellables)

        // Update c1 from 2 → 4 ⇒ expected total = 4 + 5 + 0 = 9
        mockMessageSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "unread-agg-c1", unreadCount: 4))

        await fulfillment(of: [exp], timeout: 2.0)
        XCTAssertEqual(observed.last, 9)
    }

    /// Negative values are nonsense from the backend but the aggregator must
    /// not blow up: clamp each conversation contribution to ≥ 0.
    func test_totalConversationsUnread_clampsNegativeContributions_atZero() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([
            ("unread-agg-clamp-1", 4),
            ("unread-agg-clamp-2", -10)
        ])

        await engine.startSocketRelay()

        let exp = expectation(description: "clamped total")
        var observed = [Int]()
        engine.totalConversationsUnread
            .sink { value in
                observed.append(value)
                if observed.count >= 2 { exp.fulfill() }
            }
            .store(in: &cancellables)

        mockMessageSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "unread-agg-clamp-1", unreadCount: 4))

        await fulfillment(of: [exp], timeout: 2.0)
        XCTAssertEqual(observed.last, 4, "negative contribution must clamp to 0")
    }

    // MARK: - Currently-open conversation gating
    //
    // When the user has a conversation OPEN, the gateway still broadcasts
    // `conversation:unread-updated` for it (the server has no notion of
    // "currently visible"). The client must:
    //   1. Force the open conversation's unreadCount to 0 (the user IS
    //      reading the messages, so anything else is a visual lie).
    //   2. Exclude the open conversation from the cross-conversation
    //      aggregator (so the back-button pill counts OTHER conversations
    //      only).
    //
    // Setting the current id to `nil` (e.g. on view disappear) restores
    // normal pass-through behaviour.

    func test_setCurrentlyOpenConversation_forcesOpenConvUnreadToZero_onUnreadUpdate() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([
            ("open-conv", 0),
            ("other-conv", 3)
        ])
        await engine.startSocketRelay()
        engine.setCurrentlyOpenConversation("open-conv")

        // Server broadcasts a non-zero unread for the open conv — the engine
        // must ignore the new value and keep it at 0.
        mockMessageSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "open-conv", unreadCount: 75))

        // Wait for the event to be processed
        try? await Task.sleep(nanoseconds: 200_000_000)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        let openConv = cached.first { $0.id == "open-conv" }
        XCTAssertEqual(openConv?.userState.unreadCount, 0, "open conversation's unread must stay at 0")
    }

    func test_setCurrentlyOpenConversation_excludesOpenConvFromAggregator() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([
            ("open-conv", 10),
            ("other-conv-1", 4),
            ("other-conv-2", 2)
        ])
        await engine.startSocketRelay()
        engine.setCurrentlyOpenConversation("open-conv")

        // Trigger a recompute (any event that fires recomputeTotalUnread is fine)
        mockMessageSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "other-conv-1", unreadCount: 4))

        try? await Task.sleep(nanoseconds: 200_000_000)

        // Aggregator must skip "open-conv" — only 4 + 2 = 6
        XCTAssertEqual(engine.totalConversationsUnreadValue, 6,
                       "open conversation must be excluded from totalConversationsUnread")
    }

    func test_setCurrentlyOpenConversation_immediatelyZeroesOpenConvUnread() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([
            ("conv-with-11-unread", 11),
            ("other-conv", 3)
        ])

        engine.setCurrentlyOpenConversation("conv-with-11-unread")
        try? await Task.sleep(nanoseconds: 200_000_000)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        let openConv = cached.first { $0.id == "conv-with-11-unread" }
        XCTAssertEqual(openConv?.userState.unreadCount, 0,
                       "opening a conversation must reset its unread count locally")
    }

    func test_setCurrentlyOpenConversation_nil_restoresNormalPassThrough() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await seedConversations([("conv-1", 0)])
        await engine.startSocketRelay()

        engine.setCurrentlyOpenConversation("conv-1")
        engine.setCurrentlyOpenConversation(nil)

        // Now a server unread update for conv-1 must be applied normally
        mockMessageSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "conv-1", unreadCount: 4))
        try? await Task.sleep(nanoseconds: 200_000_000)

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(cached.first?.userState.unreadCount, 4)
    }

    // Helper: seed the conversations cache with [id, unreadCount] tuples.
    // Uses `save()` (not `update()`): `update()` early-returns when the key
    // is absent from L1, which is exactly the state right after `invalidate`.
    private func seedConversations(_ entries: [(String, Int)]) async {
        let conversations: [MeeshyConversation] = entries.map { id, unread in
            MeeshyConversation(
                id: id,
                identifier: "test-\(id)",
                type: .direct,
                unreadCount: unread
            )
        }
        try? await CacheCoordinator.shared.conversations.save(conversations, for: "list")
    }

    // MARK: - Sort persistence

    /// The sync engine MUST persist the cached list sorted by `lastMessageAt`
    /// DESC so cold-start cache reads land on the correct order without
    /// requiring the ViewModel to re-sort. Backend pagination order is not
    /// guaranteed to be timestamp-sorted (e.g. when delta sync interleaves
    /// pages), so the engine is the right place to enforce the invariant.
    func test_fullSync_savesConversationsSortedByLastMessageAtDesc() async {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")

        let oldest = Date(timeIntervalSince1970: 1_000)
        let middle = Date(timeIntervalSince1970: 2_000)
        let newest = Date(timeIntervalSince1970: 3_000)

        // Backend returns rows in arbitrary order — sync engine must sort
        // them on persistence.
        let data: [APIConversation] = [
            TestFactories.makeAPIConversation(id: "older", lastMessageAt: oldest),
            TestFactories.makeAPIConversation(id: "newest", lastMessageAt: newest),
            TestFactories.makeAPIConversation(id: "middle", lastMessageAt: middle)
        ]
        let pagination = OffsetPagination(total: data.count, hasMore: false, limit: 100, offset: 0)
        let response = OffsetPaginatedAPIResponse<[APIConversation]>(
            success: true, data: data, pagination: pagination, error: nil
        )
        mockConvService.listResult = .success(response)

        await engine.fullSync()

        let cached = await CacheCoordinator.shared.conversations.load(for: "list").value ?? []
        XCTAssertEqual(cached.map(\.id), ["newest", "middle", "older"], "Cache must be persisted sorted by lastMessageAt DESC")
    }
}

// MARK: - Mock ConversationService

private final class MockConversationService: ConversationServiceProviding, @unchecked Sendable {
    var listResult: Result<OffsetPaginatedAPIResponse<[APIConversation]>, Error> = .success(
        OffsetPaginatedAPIResponse(success: true, data: [], pagination: nil, error: nil)
    )
    var listCallCount = 0

    func reset() {
        listCallCount = 0
        listResult = .success(OffsetPaginatedAPIResponse(success: true, data: [], pagination: nil, error: nil))
    }

    func list(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[APIConversation]> {
        listCallCount += 1
        return try listResult.get()
    }

    func listPage(before cursor: String?, limit: Int, currentUserId: String) async throws -> ConversationPage {
        ConversationPage(items: [], nextCursor: nil, hasMore: false)
    }

    func getById(_ conversationId: String) async throws -> APIConversation { fatalError("Not used in tests") }
    func create(type: String, title: String?, participantIds: [String]) async throws -> CreateConversationResponse { fatalError("Not used in tests") }
    func delete(conversationId: String) async throws {}
    func markRead(conversationId: String) async throws {}
    func markAsReceived(conversationId: String) async throws {}
    func markUnread(conversationId: String) async throws {}
    func getParticipants(conversationId: String, limit: Int, cursor: String?) async throws -> PaginatedAPIResponse<[APIParticipant]> { fatalError("Not used in tests") }
    func deleteForMe(conversationId: String) async throws {}
    func listSharedWith(userId: String, limit: Int) async throws -> [APIConversation] { [] }
    func findDirectWith(userId: String) async throws -> APIConversation? { nil }
    func removeParticipant(conversationId: String, participantId: String) async throws {}
    func updateParticipantRole(conversationId: String, participantId: String, role: String) async throws {}
    func update(conversationId: String, title: String?, description: String?, avatar: String?, banner: String?, defaultWriteRole: String?, isAnnouncementChannel: Bool?, slowModeSeconds: Int?, autoTranslateEnabled: Bool?) async throws -> APIConversation { fatalError("Not used in tests") }
    func leave(conversationId: String) async throws {}
    func banParticipant(conversationId: String, userId: String) async throws {}
    func unbanParticipant(conversationId: String, userId: String) async throws {}
}

// MARK: - Mock MessageService

private final class MockMessageService: MessageServiceProviding, @unchecked Sendable {
    var listResult: Result<MessagesAPIResponse, Error> = .success(
        MessagesAPIResponse(success: true, data: [], pagination: nil, cursorPagination: nil, hasNewer: nil, meta: nil)
    )
    var listCallCount = 0
    var listBeforeResult: Result<MessagesAPIResponse, Error> = .success(
        MessagesAPIResponse(success: true, data: [], pagination: nil, cursorPagination: nil, hasNewer: nil, meta: nil)
    )

    func reset() {
        listCallCount = 0
        listResult = .success(MessagesAPIResponse(success: true, data: [], pagination: nil, cursorPagination: nil, hasNewer: nil, meta: nil))
    }

    func list(conversationId: String, offset: Int, limit: Int, includeReplies: Bool, includeTranslations: Bool) async throws -> MessagesAPIResponse {
        listCallCount += 1
        return try listResult.get()
    }

    func listBefore(conversationId: String, before: String, limit: Int, includeReplies: Bool, includeTranslations: Bool) async throws -> MessagesAPIResponse {
        return try listBeforeResult.get()
    }

    func listAfter(conversationId: String, after: Date, limit: Int, includeReplies: Bool, includeTranslations: Bool) async throws -> MessagesAPIResponse {
        return MessagesAPIResponse(success: true, data: [], pagination: nil, cursorPagination: nil, hasNewer: nil, meta: nil)
    }

    func listAround(conversationId: String, around: String, limit: Int, includeReplies: Bool, includeTranslations: Bool) async throws -> MessagesAPIResponse { fatalError("Not used in tests") }
    func send(conversationId: String, request: SendMessageRequest) async throws -> SendMessageResponseData { fatalError("Not used in tests") }
    func edit(messageId: String, content: String) async throws -> APIMessage { fatalError("Not used in tests") }
    func delete(conversationId: String, messageId: String) async throws {}
    func pin(conversationId: String, messageId: String) async throws {}
    func unpin(conversationId: String, messageId: String) async throws {}
    func consumeViewOnce(conversationId: String, messageId: String) async throws -> ConsumeViewOnceResponse { fatalError("Not used in tests") }
    func search(conversationId: String, query: String, limit: Int) async throws -> MessagesAPIResponse { fatalError("Not used in tests") }
    func searchWithCursor(conversationId: String, query: String, cursor: String) async throws -> MessagesAPIResponse { fatalError("Not used in tests") }
}

// MARK: - TestFactories extension

private extension TestFactories {
    static func makeAPIConversation(
        id: String = "conv-1",
        lastMessageAt: Date? = nil
    ) -> APIConversation {
        var json: [String: Any] = [
            "id": id,
            "identifier": "test-\(id)",
            "type": "DIRECT",
            "createdAt": ISO8601DateFormatter().string(from: Date()),
            "updatedAt": ISO8601DateFormatter().string(from: Date()),
            "isActive": true,
            "unreadCount": 0
        ]
        if let lastMessageAt {
            json["lastMessageAt"] = ISO8601DateFormatter().string(from: lastMessageAt)
        }
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(APIConversation.self, from: data)
    }
}

// MARK: - Gap-recovery mock (per-offset pages + transient per-offset failure)

private final class GapMockConversationService: ConversationServiceProviding, @unchecked Sendable {
    private let lock = NSLock()
    var pagesByOffset: [Int: [APIConversation]] = [:]
    var advertisedTotal: Int?
    /// offset -> number of leading calls that should throw before succeeding.
    var failTimesRemaining: [Int: Int] = [:]

    func list(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[APIConversation]> {
        let (items, total): ([APIConversation], Int?) = try lock.withLock {
            if let remaining = failTimesRemaining[offset], remaining > 0 {
                failTimesRemaining[offset] = remaining - 1
                throw URLError(.timedOut)
            }
            return (pagesByOffset[offset] ?? [], advertisedTotal)
        }
        return OffsetPaginatedAPIResponse(
            success: true,
            data: items,
            pagination: OffsetPagination(total: total, hasMore: nil, limit: limit, offset: offset),
            error: nil
        )
    }

    func listPage(before cursor: String?, limit: Int, currentUserId: String) async throws -> ConversationPage {
        ConversationPage(items: [], nextCursor: nil, hasMore: false)
    }
    func getById(_ conversationId: String) async throws -> APIConversation { fatalError("Not used in tests") }
    func create(type: String, title: String?, participantIds: [String]) async throws -> CreateConversationResponse { fatalError("Not used in tests") }
    func delete(conversationId: String) async throws {}
    func markRead(conversationId: String) async throws {}
    func markAsReceived(conversationId: String) async throws {}
    func markUnread(conversationId: String) async throws {}
    func getParticipants(conversationId: String, limit: Int, cursor: String?) async throws -> PaginatedAPIResponse<[APIParticipant]> { fatalError("Not used in tests") }
    func deleteForMe(conversationId: String) async throws {}
    func listSharedWith(userId: String, limit: Int) async throws -> [APIConversation] { [] }
    func findDirectWith(userId: String) async throws -> APIConversation? { nil }
    func removeParticipant(conversationId: String, participantId: String) async throws {}
    func updateParticipantRole(conversationId: String, participantId: String, role: String) async throws {}
    func update(conversationId: String, title: String?, description: String?, avatar: String?, banner: String?, defaultWriteRole: String?, isAnnouncementChannel: Bool?, slowModeSeconds: Int?, autoTranslateEnabled: Bool?) async throws -> APIConversation { fatalError("Not used in tests") }
    func leave(conversationId: String) async throws {}
    func banParticipant(conversationId: String, userId: String) async throws {}
    func unbanParticipant(conversationId: String, userId: String) async throws {}
}
