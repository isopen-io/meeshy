import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class CallDeclineReplyTests: XCTestCase {

    private final class MockReplyQueue: NotificationReplyQueueing {
        private(set) var enqueuedItems: [OfflineQueueItem] = []
        var enqueueItemError: Error?
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
            "ofqm_unused"
        }
    }

    private final class MockOptimisticPersistence: OptimisticMessagePersisting {
        private(set) var insertedRecords: [MessageRecord] = []
        private(set) var failedLocalIds: [String] = []

        func insertOptimistic(_ record: MessageRecord) async throws {
            insertedRecords.append(record)
        }

        func markOptimisticFailed(localId: String, reason: String) async throws {
            failedLocalIds.append(localId)
        }
    }

    private struct TestError: Error {}

    private struct SUTContext {
        let sut: CallDeclineMessenger
        let messageService: MockMessageService
        let queue: MockReplyQueue
        let persistence: MockOptimisticPersistence
    }

    private func makeSUT(userId: String? = "user1") -> SUTContext {
        let messageService = MockMessageService()
        let queue = MockReplyQueue()
        let persistence = MockOptimisticPersistence()
        let sut = CallDeclineMessenger(
            messageService: messageService,
            replyQueue: queue,
            messagePersistence: persistence,
            currentUserId: { userId },
            prepareReplyQueue: {}
        )
        return SUTContext(sut: sut, messageService: messageService, queue: queue, persistence: persistence)
    }

    private func makePlan(content: String = "Je te rappelle.", language: String? = "fr") -> CallDeclineReplyPlan {
        CallDeclineReplyPlan(conversationId: "conv1", content: content, originalLanguage: language)
    }

    // MARK: - Rule

    func test_plan_incomingRinging_trimsTextAndTargetsTheCallConversation() {
        let plan = CallDeclineReplyRule.plan(
            isDeclinable: true,
            conversationId: "conv1",
            text: "  Je te rappelle.  \n",
            originalLanguage: "fr"
        )

        XCTAssertEqual(plan, CallDeclineReplyPlan(conversationId: "conv1", content: "Je te rappelle.", originalLanguage: "fr"))
    }

    func test_plan_callNotDeclinable_returnsNil() {
        XCTAssertNil(CallDeclineReplyRule.plan(isDeclinable: false, conversationId: "conv1", text: "Je te rappelle.", originalLanguage: "fr"))
    }

    func test_plan_withoutConversation_returnsNil() {
        XCTAssertNil(CallDeclineReplyRule.plan(isDeclinable: true, conversationId: nil, text: "Je te rappelle.", originalLanguage: "fr"))
        XCTAssertNil(CallDeclineReplyRule.plan(isDeclinable: true, conversationId: "", text: "Je te rappelle.", originalLanguage: "fr"))
    }

    func test_plan_blankText_returnsNil() {
        XCTAssertNil(CallDeclineReplyRule.plan(isDeclinable: true, conversationId: "conv1", text: "  \n ", originalLanguage: "fr"))
    }

    func test_plan_overlongText_isCappedAtMaxLength() {
        let text = String(repeating: "a", count: CallDeclineReplyRule.maxLength + 40)

        let plan = CallDeclineReplyRule.plan(isDeclinable: true, conversationId: "conv1", text: text, originalLanguage: "fr")

        XCTAssertEqual(plan?.content.count, CallDeclineReplyRule.maxLength)
    }

    func test_quickReplies_areFourDistinctNonEmptyTexts() {
        let texts = CallDeclineQuickReply.allCases.map(\.text)

        XCTAssertEqual(texts.count, 4)
        XCTAssertEqual(Set(texts).count, 4)
        XCTAssertTrue(texts.allSatisfy { !$0.trimmingCharacters(in: .whitespaces).isEmpty })
    }

    // MARK: - Messenger

    func test_send_writesOptimisticRecordAndOutboxRowBeforeRest() async {
        let ctx = makeSUT()
        var sendCountAtEnqueue = -1
        ctx.queue.onEnqueue = { [weak messageService = ctx.messageService] in
            sendCountAtEnqueue = messageService?.sendCallCount ?? -1
        }

        await ctx.sut.send(makePlan())

        XCTAssertEqual(sendCountAtEnqueue, 0)
        XCTAssertEqual(ctx.persistence.insertedRecords.first?.conversationId, "conv1")
        XCTAssertEqual(ctx.persistence.insertedRecords.first?.senderId, "user1")
        XCTAssertEqual(ctx.persistence.insertedRecords.first?.content, "Je te rappelle.")
        XCTAssertEqual(ctx.queue.enqueuedItems.first?.content, "Je te rappelle.")
        XCTAssertEqual(ctx.messageService.lastSendConversationId, "conv1")
    }

    func test_send_carriesLanguageAndOneClientMessageIdEndToEnd() async {
        let ctx = makeSUT()

        await ctx.sut.send(makePlan(language: "de"))

        let item = ctx.queue.enqueuedItems.first
        XCTAssertEqual(item?.originalLanguage, "de")
        XCTAssertEqual(ctx.messageService.lastSendRequest?.originalLanguage, "de")
        XCTAssertEqual(ctx.messageService.lastSendRequest?.clientMessageId, item?.clientMessageId)
        XCTAssertEqual(ctx.persistence.insertedRecords.first?.localId, item?.clientMessageId)
        XCTAssertNil(ctx.messageService.lastSendRequest?.replyToId)
    }

    func test_send_restFailure_keepsDurableOutboxRow() async {
        let ctx = makeSUT()
        ctx.messageService.sendResult = .failure(TestError())

        await ctx.sut.send(makePlan())

        XCTAssertEqual(ctx.queue.enqueuedItems.count, 1)
        XCTAssertTrue(ctx.persistence.failedLocalIds.isEmpty)
    }

    func test_send_enqueueAndRestBothFail_marksOptimisticRowFailed() async {
        let ctx = makeSUT()
        ctx.queue.enqueueItemError = TestError()
        ctx.messageService.sendResult = .failure(TestError())

        await ctx.sut.send(makePlan())

        XCTAssertEqual(ctx.persistence.failedLocalIds, [ctx.persistence.insertedRecords.first?.localId].compactMap { $0 })
        XCTAssertEqual(ctx.persistence.failedLocalIds.count, 1)
    }

    func test_send_withoutCurrentUser_sendsNothing() async {
        let ctx = makeSUT(userId: nil)

        await ctx.sut.send(makePlan())

        XCTAssertTrue(ctx.persistence.insertedRecords.isEmpty)
        XCTAssertTrue(ctx.queue.enqueuedItems.isEmpty)
        XCTAssertEqual(ctx.messageService.sendCallCount, 0)
    }

    // MARK: - Wiring

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_rejectWithReply_plansBeforeRejectingAndRejectsBeforeSending() throws {
        let body = try source("Meeshy/Features/Main/Services/CallManager+DeclineReply.swift")
        let plan = try XCTUnwrap(body.range(of: "CallDeclineReplyRule.plan("))
        let reject = try XCTUnwrap(body.range(of: "rejectCall()"))
        let send = try XCTUnwrap(body.range(of: "messenger.send("))

        XCTAssertLessThan(plan.lowerBound, reject.lowerBound)
        XCTAssertLessThan(reject.lowerBound, send.lowerBound)
    }

    func test_incomingCallView_offersTheDeclineWithMessageSheet() throws {
        let body = try source("Meeshy/Features/Main/Views/IncomingCallView.swift")

        XCTAssertTrue(body.contains("CallDeclineSheet("))
        XCTAssertTrue(body.contains("call.decline.open.label"))
    }

    func test_declineSheet_usesTheQuickRepliesAndFortyFourPointTargets() throws {
        let body = try source("Meeshy/Features/Main/Views/CallDeclineSheet.swift")

        XCTAssertTrue(body.contains("CallDeclineQuickReply.allCases"))
        XCTAssertTrue(body.contains("rejectCall(withReply:"))
        XCTAssertTrue(body.contains("minHeight: 44"))
        XCTAssertTrue(body.contains("CallDeclineReplyRule.maxLength"))
    }
}
