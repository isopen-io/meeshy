import XCTest
@testable import MeeshySDK

final class PushDeliveryReceiptServiceTests: XCTestCase {

    private var defaults: UserDefaults!
    private let suiteName = "com.meeshy.test.push-receipts"

    override func setUp() {
        super.setUp()
        UserDefaults().removePersistentDomain(forName: suiteName)
        defaults = UserDefaults(suiteName: suiteName)!
    }

    override func tearDown() {
        UserDefaults().removePersistentDomain(forName: suiteName)
        defaults = nil
        super.tearDown()
    }

    // MARK: - Helpers

    private actor CallRecorder {
        var calls: [String] = []
        var shouldFail = false
        func setFailure(_ value: Bool) { shouldFail = value }
        func record(_ id: String) throws {
            calls.append(id)
            if shouldFail { throw TestError.network }
        }
    }

    private enum TestError: Error { case network }

    private func makeSUT(
        recorder: CallRecorder,
        authenticated: Bool = true
    ) -> PushDeliveryReceiptService {
        let deps = PushDeliveryReceiptService.Dependencies(
            markAsReceived: { id in
                try await recorder.record(id)
            },
            isAuthenticated: { authenticated }
        )
        return PushDeliveryReceiptService(dependencies: deps, defaults: defaults)
    }

    // MARK: - Tests

    func test_ack_whenAuthenticatedAndBackendOk_callsMarkAsReceived() async {
        let recorder = CallRecorder()
        let sut = makeSUT(recorder: recorder)

        await sut.ack(conversationId: "conv-1", messageId: "msg-1")

        let calls = await recorder.calls
        XCTAssertEqual(calls, ["conv-1"])
        XCTAssertEqual(sut._pendingCount(), 0)
    }

    func test_ack_whenNotAuthenticated_queuesForLater() async {
        let recorder = CallRecorder()
        let sut = makeSUT(recorder: recorder, authenticated: false)

        await sut.ack(conversationId: "conv-1", messageId: nil)

        let calls = await recorder.calls
        XCTAssertTrue(calls.isEmpty, "Unauthenticated calls must not hit the backend")
        XCTAssertEqual(sut._pendingCount(), 1)
    }

    func test_ack_whenBackendFails_queuesForRetry() async {
        let recorder = CallRecorder()
        await recorder.setFailure(true)
        let sut = makeSUT(recorder: recorder)

        await sut.ack(conversationId: "conv-1", messageId: nil)

        let calls = await recorder.calls
        XCTAssertEqual(calls, ["conv-1"])
        XCTAssertEqual(sut._pendingCount(), 1, "Failed ack must be queued")
    }

    func test_flushPending_retriesQueuedReceiptsSuccessfully() async {
        let recorder = CallRecorder()
        await recorder.setFailure(true)
        let sut = makeSUT(recorder: recorder)

        await sut.ack(conversationId: "conv-1", messageId: nil)
        await sut.ack(conversationId: "conv-2", messageId: nil)
        XCTAssertEqual(sut._pendingCount(), 2)

        await recorder.setFailure(false)
        await sut.flushPending()

        let calls = await recorder.calls
        XCTAssertEqual(calls.filter { $0 == "conv-1" }.count, 2)
        XCTAssertEqual(calls.filter { $0 == "conv-2" }.count, 2)
        XCTAssertEqual(sut._pendingCount(), 0, "Successful flush clears the queue")
    }

    func test_flushPending_whenStillOffline_keepsQueue() async {
        let recorder = CallRecorder()
        let sut = makeSUT(recorder: recorder, authenticated: false)

        await sut.ack(conversationId: "conv-1", messageId: nil)
        XCTAssertEqual(sut._pendingCount(), 1)

        await sut.flushPending()
        XCTAssertEqual(sut._pendingCount(), 1, "Offline flush must not drop the queue")
    }

    func test_ack_deduplicatesSameConversation() async {
        let recorder = CallRecorder()
        let sut = makeSUT(recorder: recorder, authenticated: false)

        await sut.ack(conversationId: "conv-1", messageId: "msg-1")
        await sut.ack(conversationId: "conv-1", messageId: "msg-2")

        XCTAssertEqual(sut._pendingCount(), 1, "Only the latest ack per conversation is kept")
    }

    func test_flushPending_whenFailuresRemain_requeues() async {
        let recorder = CallRecorder()
        await recorder.setFailure(true)
        let sut = makeSUT(recorder: recorder)

        await sut.ack(conversationId: "conv-1", messageId: nil)
        XCTAssertEqual(sut._pendingCount(), 1)

        await sut.flushPending()
        XCTAssertEqual(sut._pendingCount(), 1, "Still-failing items remain queued")
    }

    // MARK: - Poison-pill guards (empty id / permanent server errors)

    func test_ack_withEmptyConversationId_neverCallsBackendNorQueues() async {
        let recorder = CallRecorder()
        let sut = makeSUT(recorder: recorder)

        await sut.ack(conversationId: "", messageId: "msg-1")

        let calls = await recorder.calls
        XCTAssertTrue(calls.isEmpty, "Un id vide produirait /conversations//mark-as-received → 404 permanent")
        XCTAssertEqual(sut._pendingCount(), 0)
    }

    func test_flushPending_purgesPersistedEmptyConversationIds() async {
        let recorder = CallRecorder()
        // Simule la ligne corrompue persistée par un ancien build : enqueue
        // via le chemin non-authentifié d'un SUT SANS le guard (on écrit
        // directement le JSON legacy dans le même defaults/clé).
        let legacy = """
        [{"conversationId":"","messageId":null,"enqueuedAt":"2026-06-10T08:00:00Z"},\
        {"conversationId":"conv-ok","messageId":null,"enqueuedAt":"2026-06-10T08:00:01Z"}]
        """
        defaults.set(Data(legacy.utf8), forKey: "com.meeshy.push.pendingReceipts")
        let sut = makeSUT(recorder: recorder)
        XCTAssertEqual(sut._pendingCount(), 2)

        await sut.flushPending()

        let calls = await recorder.calls
        XCTAssertEqual(calls, ["conv-ok"], "La ligne vide est purgée sans appel réseau")
        XCTAssertEqual(sut._pendingCount(), 0)
    }

    func test_flushPending_dropsPermanent4xxInsteadOfRequeueing() async {
        let recorder = CallRecorder()
        let deps = PushDeliveryReceiptService.Dependencies(
            markAsReceived: { id in
                try await recorder.record(id)
                throw MeeshyError.server(statusCode: 404, message: "Route not found")
            },
            isAuthenticated: { true }
        )
        let sut = PushDeliveryReceiptService(dependencies: deps, defaults: defaults)
        defaults.set(
            Data("""
            [{"conversationId":"conv-gone","messageId":null,"enqueuedAt":"2026-06-10T08:00:00Z"}]
            """.utf8),
            forKey: "com.meeshy.push.pendingReceipts"
        )

        await sut.flushPending()

        XCTAssertEqual(sut._pendingCount(), 0, "Un 404 est permanent — re-enfiler garantit l'échec à vie")
    }

    func test_isRetryable_classifiesServerErrors() {
        XCTAssertFalse(PushDeliveryReceiptService.isRetryable(MeeshyError.server(statusCode: 400, message: "Validation failed")))
        XCTAssertFalse(PushDeliveryReceiptService.isRetryable(MeeshyError.server(statusCode: 404, message: "Route not found")))
        XCTAssertFalse(PushDeliveryReceiptService.isRetryable(MeeshyError.forbidden(reason: nil, body: nil)))
        XCTAssertTrue(PushDeliveryReceiptService.isRetryable(MeeshyError.server(statusCode: 401, message: "expired")))
        XCTAssertTrue(PushDeliveryReceiptService.isRetryable(MeeshyError.server(statusCode: 429, message: "rate limited")))
        XCTAssertTrue(PushDeliveryReceiptService.isRetryable(MeeshyError.server(statusCode: 503, message: "unavailable")))
        XCTAssertTrue(PushDeliveryReceiptService.isRetryable(TestError.network))
    }
}
