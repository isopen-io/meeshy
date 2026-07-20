import XCTest
import UserNotifications
import MeeshySDK
@testable import Meeshy

/// R1/R2 — `NotificationActionHandler` is the extracted, injectable handler
/// behind `AppDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:)`.
/// Contract under test:
///  (a) the work happens INSIDE `handle()` — when it returns, everything ran
///      (AppDelegate only calls `completionHandler()` after the await) and the
///      background task wrapped the whole flow;
///  (b) the auth token is pushed to the API client BEFORE any send (fix of the
///      silent 401 on background cold-launch);
///  (c) a reply is durable: optimistic MessageRecord + outbox row are written
///      BEFORE the REST attempt, so a network failure loses nothing;
///  (d) the reply carries `originalLanguage` = the user's preferred content
///      language (Prisme Linguistique) and one single `clientMessageId`
///      end-to-end (gateway dedup makes outbox retries safe).
@MainActor
final class NotificationActionHandlerTests: XCTestCase {

    // MARK: - Mocks

    private final class MockBackgroundTaskScheduler: BackgroundTaskScheduling {
        private(set) var beginCallCount = 0
        private(set) var endCallCount = 0
        private(set) var lastBeganName: String?

        func beginTask(name: String, expirationHandler: (() -> Void)?) -> UIBackgroundTaskIdentifier {
            beginCallCount += 1
            lastBeganName = name
            return UIBackgroundTaskIdentifier(rawValue: 42)
        }

        func endTask(_ identifier: UIBackgroundTaskIdentifier) {
            endCallCount += 1
        }
    }

    private final class MockReplyQueue: NotificationReplyQueueing {
        private(set) var enqueuedItems: [OfflineQueueItem] = []
        private(set) var enqueuedKinds: [OutboxKind] = []
        private(set) var enqueuedPayloads: [Data] = []
        var enqueueItemError: Error?
        var enqueueKindError: Error?
        /// Snapshot of an external counter taken at enqueue time, so tests can
        /// prove the durable row landed BEFORE the REST send.
        var onEnqueue: (() -> Void)?

        func enqueue(_ item: OfflineQueueItem) async throws {
            if let enqueueItemError { throw enqueueItemError }
            enqueuedItems.append(item)
            onEnqueue?()
        }

        @discardableResult
        func enqueue<P: Codable & Sendable>(
            _ kind: OutboxKind,
            payload: P,
            conversationId: String?
        ) async throws -> String {
            if let enqueueKindError { throw enqueueKindError }
            enqueuedKinds.append(kind)
            enqueuedPayloads.append(try JSONEncoder().encode(payload))
            onEnqueue?()
            return "ofqm_test"
        }
    }

    private final class MockOptimisticPersistence: OptimisticMessagePersisting {
        private(set) var insertedRecords: [MessageRecord] = []
        private(set) var markFailedCalls: [(localId: String, reason: String)] = []
        var insertError: Error?

        func insertOptimistic(_ record: MessageRecord) async throws {
            if let insertError { throw insertError }
            insertedRecords.append(record)
        }

        func markOptimisticFailed(localId: String, reason: String) async throws {
            markFailedCalls.append((localId, reason))
        }
    }

    private struct TestError: Error {}

    // MARK: - Factory

    private struct SUTContext {
        let sut: NotificationActionHandler
        let messageService: MockMessageService
        let conversationService: MockConversationService
        let postService: MockPostService
        let friendService: MockFriendService
        let queue: MockReplyQueue
        let persistence: MockOptimisticPersistence
        let backgroundTasks: MockBackgroundTaskScheduler
        let appliedTokens: () -> [String?]
        let openedNotifications: () -> Int
        let locallyMarkedRead: () -> [String]
        let removedConversationBanners: () -> [String]
    }

    private func makeSUT(
        authToken: String? = "jwt-token",
        currentUserId: String? = "user1",
        preferredLanguage: String? = "fr",
        isRegisteredUser: Bool = true
    ) -> SUTContext {
        let messageService = MockMessageService()
        let conversationService = MockConversationService()
        let postService = MockPostService()
        let friendService = MockFriendService()
        let queue = MockReplyQueue()
        let persistence = MockOptimisticPersistence()
        let backgroundTasks = MockBackgroundTaskScheduler()

        var appliedTokens: [String?] = []
        var openedCount = 0
        var markedRead: [String] = []
        var removedBanners: [String] = []

        let sut = NotificationActionHandler(
            messageService: messageService,
            conversationService: conversationService,
            postService: postService,
            friendService: friendService,
            replyQueue: queue,
            messagePersistence: persistence,
            backgroundTasks: backgroundTasks,
            authTokenProvider: { authToken },
            applyAuthToken: { appliedTokens.append($0) },
            currentUserId: { currentUserId },
            preferredLanguage: { preferredLanguage },
            isRegisteredUser: { isRegisteredUser },
            openNotification: { _ in openedCount += 1 },
            localMarkRead: { markedRead.append($0) },
            removeDeliveredForConversation: { removedBanners.append($0) },
            removeDeliveredForPost: { _ in }
        )

        return SUTContext(
            sut: sut,
            messageService: messageService,
            conversationService: conversationService,
            postService: postService,
            friendService: friendService,
            queue: queue,
            persistence: persistence,
            backgroundTasks: backgroundTasks,
            appliedTokens: { appliedTokens },
            openedNotifications: { openedCount },
            locallyMarkedRead: { markedRead },
            removedConversationBanners: { removedBanners }
        )
    }

    private func replyUserInfo(
        conversationId: String = "conv1",
        messageId: String = "msg1"
    ) -> [AnyHashable: Any] {
        [
            "type": "new_message",
            "conversationId": conversationId,
            "messageId": messageId,
            "senderId": "sender1"
        ]
    }

    // MARK: - (a) Work completes inside handle(), wrapped in a background task

    func test_handle_reply_finishesSendAndBackgroundTaskBeforeReturning() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: replyUserInfo(),
            replyText: "Salut !"
        )

        XCTAssertEqual(ctx.messageService.sendCallCount, 1,
                       "REST send must have completed before handle() returns")
        XCTAssertEqual(ctx.backgroundTasks.beginCallCount, 1)
        XCTAssertEqual(ctx.backgroundTasks.endCallCount, 1,
                       "The background task must be ended exactly once, after the work")
    }

    func test_handle_defaultAction_opensNotificationAndEndsBackgroundTask() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: UNNotificationDefaultActionIdentifier,
            userInfo: replyUserInfo(),
            replyText: nil
        )

        XCTAssertEqual(ctx.openedNotifications(), 1)
        XCTAssertEqual(ctx.backgroundTasks.endCallCount, 1)
        XCTAssertEqual(ctx.messageService.sendCallCount, 0)
    }

    // MARK: - (b) Auth token pushed before any send

    func test_handle_reply_appliesAuthTokenBeforeSend() async {
        let ctx = makeSUT(authToken: "tok-123")
        var sendCallCountWhenTokenApplied = -1
        // Re-wire through a fresh SUT whose applyAuthToken snapshots the
        // send call count — proving the ordering, not just the call.
        let messageService = ctx.messageService
        let sut = NotificationActionHandler(
            messageService: messageService,
            conversationService: ctx.conversationService,
            postService: ctx.postService,
            friendService: ctx.friendService,
            replyQueue: ctx.queue,
            messagePersistence: ctx.persistence,
            backgroundTasks: ctx.backgroundTasks,
            authTokenProvider: { "tok-123" },
            applyAuthToken: { _ in sendCallCountWhenTokenApplied = messageService.sendCallCount },
            currentUserId: { "user1" },
            preferredLanguage: { "fr" },
            isRegisteredUser: { true },
            openNotification: { _ in },
            localMarkRead: { _ in },
            removeDeliveredForConversation: { _ in },
            removeDeliveredForPost: { _ in }
        )

        await sut.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: replyUserInfo(),
            replyText: "Salut !"
        )

        XCTAssertEqual(sendCallCountWhenTokenApplied, 0,
                       "The token must reach the API client BEFORE the send fires")
        XCTAssertEqual(messageService.sendCallCount, 1)
    }

    func test_handle_markRead_appliesAuthTokenAndCallsRest() async {
        let ctx = makeSUT(authToken: "tok-9")

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.markRead.rawValue,
            userInfo: replyUserInfo(conversationId: "convX"),
            replyText: nil
        )

        XCTAssertEqual(ctx.appliedTokens(), ["tok-9"])
        XCTAssertEqual(ctx.conversationService.markReadCallCount, 1)
        XCTAssertEqual(ctx.locallyMarkedRead(), ["convX"])
        XCTAssertEqual(ctx.removedConversationBanners(), ["convX"])
    }

    // MARK: - (c) Durable reply — optimistic row + outbox BEFORE the REST attempt

    func test_handle_reply_writesOptimisticRecordAndOutboxRowBeforeSend() async {
        let ctx = makeSUT()
        var sendCallCountAtEnqueue = -1
        ctx.queue.onEnqueue = { [weak messageService = ctx.messageService] in
            sendCallCountAtEnqueue = messageService?.sendCallCount ?? -1
        }

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: replyUserInfo(conversationId: "conv1", messageId: "msg7"),
            replyText: "Réponse depuis le lockscreen"
        )

        XCTAssertEqual(ctx.persistence.insertedRecords.count, 1)
        XCTAssertEqual(ctx.queue.enqueuedItems.count, 1)
        XCTAssertEqual(sendCallCountAtEnqueue, 0,
                       "The outbox row must land BEFORE the REST send")

        let record = ctx.persistence.insertedRecords[0]
        let item = ctx.queue.enqueuedItems[0]
        XCTAssertEqual(record.conversationId, "conv1")
        XCTAssertEqual(record.senderId, "user1")
        XCTAssertEqual(record.replyToId, "msg7")
        XCTAssertEqual(record.state, .sending)
        XCTAssertEqual(item.replyToId, "msg7")
        XCTAssertEqual(item.content, "Réponse depuis le lockscreen")
    }

    func test_handle_reply_networkFailure_keepsDurableOutboxRow() async {
        let ctx = makeSUT()
        ctx.messageService.sendResult = .failure(TestError())

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: replyUserInfo(),
            replyText: "Perdu ? Non."
        )

        XCTAssertEqual(ctx.queue.enqueuedItems.count, 1,
                       "The reply must survive as an outbox row when REST fails")
        XCTAssertEqual(ctx.persistence.insertedRecords.count, 1)
        XCTAssertTrue(ctx.persistence.markFailedCalls.isEmpty,
                      "Outbox row exists — the optimistic bubble stays .sending for the flusher")
        XCTAssertEqual(ctx.backgroundTasks.endCallCount, 1)
    }

    func test_handle_reply_enqueueAndSendBothFail_marksOptimisticRowFailed() async {
        let ctx = makeSUT()
        ctx.queue.enqueueItemError = TestError()
        ctx.messageService.sendResult = .failure(TestError())

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: replyUserInfo(),
            replyText: "Vraiment perdu"
        )

        XCTAssertEqual(ctx.persistence.markFailedCalls.count, 1,
                       "No outbox row + no REST = the bubble must flip to .failed")
        XCTAssertEqual(ctx.persistence.markFailedCalls.first?.localId,
                       ctx.persistence.insertedRecords.first?.localId)
    }

    // MARK: - (d) Prisme Linguistique + clientMessageId end-to-end

    func test_handle_reply_carriesPreferredLanguageAndStableClientMessageId() async {
        let ctx = makeSUT(preferredLanguage: "es")

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: replyUserInfo(),
            replyText: "Hola"
        )

        let item = ctx.queue.enqueuedItems[0]
        let record = ctx.persistence.insertedRecords[0]
        let request = ctx.messageService.lastSendRequest

        XCTAssertEqual(item.originalLanguage, "es")
        XCTAssertEqual(record.originalLanguage, "es")
        XCTAssertEqual(request?.originalLanguage, "es")
        XCTAssertEqual(record.localId, item.clientMessageId)
        XCTAssertEqual(request?.clientMessageId, item.clientMessageId,
                       "One clientMessageId end-to-end — gateway dedup makes outbox retries safe")
    }

    func test_handle_reply_marksConversationReadAfterSend() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: replyUserInfo(conversationId: "conv1"),
            replyText: "Vu !"
        )

        XCTAssertEqual(ctx.locallyMarkedRead(), ["conv1"])
    }

    // MARK: - Guards

    func test_handle_reply_emptyText_doesNothing() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: replyUserInfo(),
            replyText: "   "
        )

        XCTAssertEqual(ctx.messageService.sendCallCount, 0)
        XCTAssertTrue(ctx.queue.enqueuedItems.isEmpty)
        XCTAssertTrue(ctx.persistence.insertedRecords.isEmpty)
        XCTAssertEqual(ctx.backgroundTasks.endCallCount, 1)
    }

    func test_handle_reply_noCurrentUser_doesNothing() async {
        let ctx = makeSUT(currentUserId: nil)

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: replyUserInfo(),
            replyText: "Sans session"
        )

        XCTAssertEqual(ctx.messageService.sendCallCount, 0)
        XCTAssertTrue(ctx.queue.enqueuedItems.isEmpty)
    }

    func test_handle_declineCall_isSilentNoop() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.declineCall.rawValue,
            userInfo: ["type": "incoming_call", "callId": "c1"],
            replyText: nil
        )

        XCTAssertEqual(ctx.openedNotifications(), 0)
        XCTAssertEqual(ctx.backgroundTasks.endCallCount, 1)
    }
}
