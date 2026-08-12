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
        private(set) var lastExpirationHandler: (() -> Void)?
        private(set) var endedIdentifiers: [UIBackgroundTaskIdentifier] = []

        func beginTask(name: String, expirationHandler: (() -> Void)?) -> UIBackgroundTaskIdentifier {
            beginCallCount += 1
            lastBeganName = name
            lastExpirationHandler = expirationHandler
            return UIBackgroundTaskIdentifier(rawValue: 42)
        }

        func endTask(_ identifier: UIBackgroundTaskIdentifier) {
            endCallCount += 1
            endedIdentifiers.append(identifier)
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
        /// Suspension point for the mid-flight expiration test — lets the test
        /// freeze `handle()` between `beginTask` and the outbox/REST work.
        var onInsert: (() async -> Void)?

        func insertOptimistic(_ record: MessageRecord) async throws {
            if let insertError { throw insertError }
            insertedRecords.append(record)
            await onInsert?()
        }

        func markOptimisticFailed(localId: String, reason: String) async throws {
            markFailedCalls.append((localId, reason))
        }
    }

    private struct TestError: Error {}

    /// One-shot async latch: `wait()` suspends until `open()` fires.
    private actor AsyncGate {
        private var opened = false
        private var waiters: [CheckedContinuation<Void, Never>] = []

        func wait() async {
            if opened { return }
            await withCheckedContinuation { waiters.append($0) }
        }

        func open() {
            opened = true
            waiters.forEach { $0.resume() }
            waiters = []
        }
    }

    /// Yield-polls the main actor until `condition` holds (bounded, no sleep).
    private func waitUntil(
        _ condition: @MainActor () -> Bool,
        iterations: Int = 10_000
    ) async {
        for _ in 0..<iterations {
            if condition() { return }
            await Task.yield()
        }
    }

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
        let removedPostBanners: () -> [String]
        let preparedReplyQueue: () -> Int
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
        var removedPostBanners: [String] = []
        var preparedReplyQueueCount = 0

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
            removeDeliveredForPost: { removedPostBanners.append($0) },
            prepareReplyQueue: { preparedReplyQueueCount += 1 }
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
            removedConversationBanners: { removedBanners },
            removedPostBanners: { removedPostBanners },
            preparedReplyQueue: { preparedReplyQueueCount }
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

    func test_handle_installsExpirationHandlerOnBackgroundTask() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: UNNotificationDismissActionIdentifier,
            userInfo: [:],
            replyText: nil
        )

        XCTAssertNotNil(ctx.backgroundTasks.lastExpirationHandler,
                        "Without an expiration handler nothing ends the task when the flow outlives the background window — iOS terminates the process (0x8BADF00D family)")
    }

    func test_handle_expirationMidFlight_endsBackgroundTaskExactlyOnce() async {
        let ctx = makeSUT()
        let gate = AsyncGate()
        ctx.persistence.onInsert = { await gate.wait() }

        let sut = ctx.sut
        let userInfo = replyUserInfo()
        let handleTask = Task { @MainActor in
            await sut.handle(
                actionIdentifier: MeeshyNotificationAction.reply.rawValue,
                userInfo: userInfo,
                replyText: "vol long courrier"
            )
        }
        await waitUntil { ctx.backgroundTasks.lastExpirationHandler != nil }

        ctx.backgroundTasks.lastExpirationHandler?()
        await waitUntil { ctx.backgroundTasks.endCallCount == 1 }
        XCTAssertEqual(ctx.backgroundTasks.endedIdentifiers,
                       [UIBackgroundTaskIdentifier(rawValue: 42)],
                       "The expiration handler must end THE task that was began")

        await gate.open()
        await handleTask.value
        XCTAssertEqual(ctx.backgroundTasks.endCallCount, 1,
                       "The normal completion path must not double-end an already-expired task")
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
            removeDeliveredForPost: { _ in },
            prepareReplyQueue: { }
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

    func test_handle_reply_wiresOutboxPoolBeforeEnqueue() async {
        let ctx = makeSUT()
        var preparedCountAtEnqueue = -1
        let preparedReplyQueue = ctx.preparedReplyQueue
        ctx.queue.onEnqueue = { preparedCountAtEnqueue = preparedReplyQueue() }

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.reply.rawValue,
            userInfo: replyUserInfo(),
            replyText: "durable même à froid"
        )

        XCTAssertEqual(preparedCountAtEnqueue, 1,
                       "The outbox pool must be wired BEFORE enqueue — a background cold-launch never ran the root-view .task that configures OfflineQueue, so enqueue would throw .poolNotConfigured")
        XCTAssertEqual(ctx.queue.enqueuedItems.count, 1)
    }

    func test_handle_comment_wiresOutboxPoolBeforeEnqueue() async {
        let ctx = makeSUT()
        var preparedCountAtEnqueue = -1
        let preparedReplyQueue = ctx.preparedReplyQueue
        ctx.queue.onEnqueue = { preparedCountAtEnqueue = preparedReplyQueue() }

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.comment.rawValue,
            userInfo: socialUserInfo(type: "post_comment", commentId: "c9"),
            replyText: "durable aussi"
        )

        XCTAssertEqual(preparedCountAtEnqueue, 1,
                       "The comment outbox row is the ONLY durable copy of the text — the pool must be wired before enqueue")
        XCTAssertEqual(ctx.queue.enqueuedKinds, [.createComment])
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

    // MARK: - R3/R4 — inline comment on social pushes

    private func socialUserInfo(
        type: String,
        postId: String? = "post1",
        commentId: String? = nil
    ) -> [AnyHashable: Any] {
        var info: [AnyHashable: Any] = ["type": type]
        if let postId { info["postId"] = postId }
        if let commentId { info["commentId"] = commentId }
        return info
    }

    private func decodedCommentPayload(_ ctx: SUTContext) throws -> CreateCommentPayload {
        let data = try XCTUnwrap(ctx.queue.enqueuedPayloads.first)
        return try JSONDecoder().decode(CreateCommentPayload.self, from: data)
    }

    func test_handle_comment_postCommentType_threadsReplyToNotifiedComment() async throws {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.comment.rawValue,
            userInfo: socialUserInfo(type: "post_comment", commentId: "c9"),
            replyText: "Bien vu !"
        )

        XCTAssertEqual(ctx.postService.addCommentCallCount, 1)
        XCTAssertEqual(ctx.postService.lastAddCommentPostId, "post1")
        XCTAssertEqual(ctx.postService.lastAddCommentContent, "Bien vu !")
        XCTAssertEqual(ctx.postService.lastAddCommentParentId, "c9",
                       "post_comment → threaded reply to THE notified comment")
    }

    func test_handle_comment_threadReplyTypes_useNotifiedCommentAsParent() async {
        for type in ["comment_reply", "story_new_comment", "story_thread_reply", "friend_story_comment"] {
            let ctx = makeSUT()

            await ctx.sut.handle(
                actionIdentifier: MeeshyNotificationAction.comment.rawValue,
                userInfo: socialUserInfo(type: type, commentId: "c42"),
                replyText: "réponse"
            )

            XCTAssertEqual(ctx.postService.lastAddCommentParentId, "c42",
                           "\(type) must thread under the notified comment")
        }
    }

    func test_handle_comment_friendNewPost_createsRootComment() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.comment.rawValue,
            userInfo: socialUserInfo(type: "friend_new_post", commentId: "spurious"),
            replyText: "Premier !"
        )

        XCTAssertEqual(ctx.postService.addCommentCallCount, 1)
        XCTAssertNil(ctx.postService.lastAddCommentParentId,
                     "friend_new_post → root comment, never threaded")
    }

    func test_handle_comment_missingCommentId_fallsBackToRootComment() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.comment.rawValue,
            userInfo: socialUserInfo(type: "post_comment", commentId: nil),
            replyText: "ok"
        )

        XCTAssertEqual(ctx.postService.addCommentCallCount, 1)
        XCTAssertNil(ctx.postService.lastAddCommentParentId)
    }

    func test_handle_comment_anonymousSession_isLoggedNoop() async {
        let ctx = makeSUT(isRegisteredUser: false)

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.comment.rawValue,
            userInfo: socialUserInfo(type: "post_comment", commentId: "c1"),
            replyText: "anonyme"
        )

        XCTAssertEqual(ctx.postService.addCommentCallCount, 0,
                       "The comments endpoint requires a registered user — no call")
        XCTAssertTrue(ctx.queue.enqueuedKinds.isEmpty)
        XCTAssertEqual(ctx.backgroundTasks.endCallCount, 1)
    }

    func test_handle_comment_networkFailure_keepsDurableOutboxRow() async throws {
        let ctx = makeSUT()
        ctx.postService.addCommentResult = .failure(TestError())

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.comment.rawValue,
            userInfo: socialUserInfo(type: "post_comment", commentId: "c9"),
            replyText: "durable"
        )

        XCTAssertEqual(ctx.queue.enqueuedKinds, [.createComment],
                       "The comment must survive as a .createComment outbox row")
        let payload = try decodedCommentPayload(ctx)
        XCTAssertEqual(payload.postId, "post1")
        XCTAssertEqual(payload.parentCommentId, "c9")
        XCTAssertEqual(payload.content, "durable")
    }

    func test_handle_comment_outboxAndRestShareSameClientMutationId() async throws {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.comment.rawValue,
            userInfo: socialUserInfo(type: "post_comment", commentId: "c9"),
            replyText: "idempotent"
        )

        let payload = try decodedCommentPayload(ctx)
        XCTAssertEqual(ctx.postService.lastAddCommentClientMutationId, payload.clientMutationId,
                       "Outbox replay and direct REST must share ONE mutation id so the gateway MutationLog dedups")
        XCTAssertTrue(payload.clientMutationId.hasPrefix("cmid_"))
    }

    func test_handle_comment_success_removesDeliveredPostBanners() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.comment.rawValue,
            userInfo: socialUserInfo(type: "post_comment", commentId: "c9"),
            replyText: "fini"
        )

        XCTAssertEqual(ctx.removedPostBanners(), ["post1"])
    }

    func test_handle_comment_missingPostId_doesNothing() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.comment.rawValue,
            userInfo: socialUserInfo(type: "post_comment", postId: nil, commentId: "c1"),
            replyText: "sans cible"
        )

        XCTAssertEqual(ctx.postService.addCommentCallCount, 0)
        XCTAssertTrue(ctx.queue.enqueuedKinds.isEmpty)
    }

    func test_handle_comment_emptyText_doesNothing() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.comment.rawValue,
            userInfo: socialUserInfo(type: "post_comment", commentId: "c1"),
            replyText: "  \n "
        )

        XCTAssertEqual(ctx.postService.addCommentCallCount, 0)
        XCTAssertTrue(ctx.queue.enqueuedKinds.isEmpty)
    }

    // MARK: - R5 — friend request ACCEPT/DECLINE actually call the API

    private func friendRequestUserInfo(
        friendRequestId: String? = "fr1",
        senderId: String? = "senderA"
    ) -> [AnyHashable: Any] {
        var info: [AnyHashable: Any] = ["type": "friend_request"]
        if let friendRequestId { info["friendRequestId"] = friendRequestId }
        if let senderId { info["senderId"] = senderId }
        return info
    }

    private func makeFriendRequest(id: String, senderId: String) -> FriendRequest {
        FriendRequest(
            id: id,
            senderId: senderId,
            receiverId: "user1",
            status: "pending",
            createdAt: Date()
        )
    }

    func test_handle_accept_friendRequest_respondsViaRestWithoutNavigation() async {
        let ctx = makeSUT()
        ctx.friendService.respondResult = .success(makeFriendRequest(id: "fr1", senderId: "senderA"))

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.accept.rawValue,
            userInfo: friendRequestUserInfo(friendRequestId: "fr1"),
            replyText: nil
        )

        XCTAssertEqual(ctx.friendService.respondCallCount, 1)
        XCTAssertEqual(ctx.friendService.lastRespondRequestId, "fr1")
        XCTAssertEqual(ctx.friendService.lastRespondAccepted, true)
        XCTAssertEqual(ctx.openedNotifications(), 0,
                       "Accept runs in background — the request must be accepted, not navigated to")
    }

    func test_handle_decline_friendRequest_respondsRejected() async {
        let ctx = makeSUT()
        ctx.friendService.respondResult = .success(makeFriendRequest(id: "fr1", senderId: "senderA"))

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.decline.rawValue,
            userInfo: friendRequestUserInfo(friendRequestId: "fr1"),
            replyText: nil
        )

        XCTAssertEqual(ctx.friendService.respondCallCount, 1)
        XCTAssertEqual(ctx.friendService.lastRespondAccepted, false)
        XCTAssertEqual(ctx.openedNotifications(), 0)
    }

    func test_handle_accept_withoutFriendRequestId_resolvesRequestViaSenderId() async {
        let ctx = makeSUT()
        ctx.friendService.receivedRequestsResult = .success(
            OffsetPaginatedAPIResponse(
                success: true,
                data: [
                    makeFriendRequest(id: "frOther", senderId: "someoneElse"),
                    makeFriendRequest(id: "fr9", senderId: "senderA")
                ],
                pagination: nil,
                error: nil
            )
        )
        ctx.friendService.respondResult = .success(makeFriendRequest(id: "fr9", senderId: "senderA"))

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.accept.rawValue,
            userInfo: friendRequestUserInfo(friendRequestId: nil, senderId: "senderA"),
            replyText: nil
        )

        XCTAssertEqual(ctx.friendService.receivedRequestsCallCount, 1)
        XCTAssertEqual(ctx.friendService.lastRespondRequestId, "fr9",
                       "The pending request from the notifying sender must be resolved and answered")
        XCTAssertEqual(ctx.friendService.lastRespondAccepted, true)
    }

    func test_handle_accept_unresolvableRequest_fallsBackToNavigation() async {
        let ctx = makeSUT()
        ctx.friendService.receivedRequestsResult = .success(
            OffsetPaginatedAPIResponse(success: true, data: [], pagination: nil, error: nil)
        )

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.accept.rawValue,
            userInfo: friendRequestUserInfo(friendRequestId: nil, senderId: "senderA"),
            replyText: nil
        )

        XCTAssertEqual(ctx.friendService.respondCallCount, 0)
        XCTAssertEqual(ctx.openedNotifications(), 1,
                       "When the request cannot be resolved, surface the app instead of dropping the intent")
    }

    func test_handle_accept_nonFriendRequestType_fallsBackToNavigation() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.accept.rawValue,
            userInfo: ["type": "new_message", "conversationId": "conv1"],
            replyText: nil
        )

        XCTAssertEqual(ctx.friendService.respondCallCount, 0)
        XCTAssertEqual(ctx.openedNotifications(), 1)
    }

    func test_handle_accept_anonymousSession_isLoggedNoop() async {
        let ctx = makeSUT(isRegisteredUser: false)

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.accept.rawValue,
            userInfo: friendRequestUserInfo(),
            replyText: nil
        )

        XCTAssertEqual(ctx.friendService.respondCallCount, 0)
        XCTAssertEqual(ctx.openedNotifications(), 0)
    }

    func test_handle_accept_restFailure_fallsBackToNavigationAndEndsBackgroundTask() async {
        let ctx = makeSUT()
        ctx.friendService.respondResult = .failure(TestError())

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.accept.rawValue,
            userInfo: friendRequestUserInfo(friendRequestId: "fr1"),
            replyText: nil
        )

        XCTAssertEqual(ctx.friendService.respondCallCount, 1)
        XCTAssertEqual(ctx.openedNotifications(), 1,
                       "A failed respond must not silently drop the user's intent — surface the app like the unresolvable-id path does")
        XCTAssertEqual(ctx.backgroundTasks.endCallCount, 1)
    }

    func test_handle_accept_receivedRequestsFailure_fallsBackToNavigation() async {
        let ctx = makeSUT()
        ctx.friendService.receivedRequestsResult = .failure(TestError())

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.accept.rawValue,
            userInfo: friendRequestUserInfo(friendRequestId: nil, senderId: "senderA"),
            replyText: nil
        )

        XCTAssertEqual(ctx.friendService.respondCallCount, 0)
        XCTAssertEqual(ctx.openedNotifications(), 1,
                       "An offline accept from the lock screen must open the app, not no-op")
    }

    func test_handle_decline_restFailure_fallsBackToNavigation() async {
        let ctx = makeSUT()
        ctx.friendService.respondResult = .failure(TestError())

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.decline.rawValue,
            userInfo: friendRequestUserInfo(friendRequestId: "fr1"),
            replyText: nil
        )

        XCTAssertEqual(ctx.openedNotifications(), 1)
    }
}
